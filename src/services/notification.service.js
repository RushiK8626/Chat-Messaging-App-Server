const webpush = require('web-push');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Configure web-push with VAPID details
webpush.setVapidDetails(
  'mailto:convohub@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/**
 * Send push notification to a specific user
 * @param {number} userId - User ID to send notification to
 * @param {object} payload - Notification payload
 * @returns {Promise<boolean>} - True if sent, false otherwise
 */
const sendPushNotificationToUser = async (userId, payload) => {
  try {
    // Fetch user's push subscription
    const pushSubscription = await prisma.pushSubscription.findUnique({
      where: { user_id: userId }
    });

    if (!pushSubscription) {
      return false;
    }

    // Reconstruct subscription object for web-push
    const subscription = {
      endpoint: pushSubscription.endpoint,
      keys: {
        auth: pushSubscription.auth_key,
        p256dh: pushSubscription.p256dh_key
      }
    };

    // Send notification
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (error) {
    if (error.statusCode === 410 || error.statusCode === 404) {
      // Subscription is no longer valid, delete it
      await prisma.pushSubscription.deleteUnique({
        where: { user_id: userId }
      }).catch(err => console.error('Error deleting subscription:', err));
    } else {
      console.error(`Failed to send push notification to user ${userId}:`, error.message);
    }
    return false;
  }
};

/**
 * Send push notification to multiple users
 * @param {array} userIds - Array of user IDs
 * @param {object} payload - Notification payload
 * @returns {Promise<object>} - { sent: number, failed: number }
 */
const sendPushNotificationToMultipleUsers = async (userIds, payload) => {
  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    const result = await sendPushNotificationToUser(userId, payload);
    result ? sent++ : failed++;
  }

  return { sent, failed };
};

/**
 * Send notification for new message
 * @param {object} messageData - Message details
 * @param {array} recipientUserIds - User IDs to notify (exclude sender)
 */
const notifyNewMessage = async (messageData, recipientUserIds) => {
  try {
    const {
      sender_username,
      sender_profile_pic,
      message_text,
      chat_id,
      chat_name,
      chat_type,
      chat_image,
      message_type
    } = messageData;

    // Truncate message text if too long
    const truncatedText = message_text && message_text.length > 50
      ? message_text.substring(0, 50) + '...'
      : (message_text || `[${message_type.toUpperCase()}]`);

    let payload;
    let notificationMessage;

    // Different notification format for private vs group chats
    if (chat_type === 'private') {
      // Private chat: sender profile pic, sender name, message
      payload = {
        title: sender_username,
        body: truncatedText,
        icon: sender_profile_pic || 'https://via.placeholder.com/192',
        badge: 'https://via.placeholder.com/72',
        tag: `message-${chat_id}`,
        data: {
          chat_id: chat_id,
          action: 'open_chat',
          url: `/chat/${chat_id}`,
          chat_type: 'private'
        },
        requireInteraction: false,
        vibrate: [200, 100, 200],
        silent: false
      };
      notificationMessage = `${sender_username}: ${truncatedText}`;
    } else {
      // Group chat: group chat image, group name, sender name, message
      payload = {
        title: chat_name || 'Group Chat',
        body: `${sender_username}: ${truncatedText}`,
        icon: chat_image || 'https://via.placeholder.com/192',
        badge: 'https://via.placeholder.com/72',
        tag: `message-${chat_id}`,
        data: {
          chat_id: chat_id,
          action: 'open_chat',
          url: `/chat/${chat_id}`,
          chat_type: 'group'
        },
        requireInteraction: false,
        vibrate: [200, 100, 200],
        silent: false
      };
      notificationMessage = `${chat_name}: ${sender_username} - ${truncatedText}`;
    }

    // Send push notifications
    const result = await sendPushNotificationToMultipleUsers(recipientUserIds, payload);

    // Save notifications to database for each recipient
    try {
      const notificationPromises = recipientUserIds.map(userId =>
        prisma.notification.create({
          data: {
            user_id: userId,
            message: notificationMessage,
            notification_type: 'message',
            action_url: `/chat/${chat_id}`,
            is_read: false
          }
        }).catch(err => {
          console.error(`Error saving notification for user ${userId}:`, err.message);
          return null;
        })
      );

      await Promise.all(notificationPromises);
    } catch (dbError) {
      console.error('Error saving notifications to database:', dbError);
      // Don't fail the push notification if DB save fails
    }

    return result;
  } catch (error) {
    console.error('Error in notifyNewMessage:', error);
    return { sent: 0, failed: recipientUserIds.length };
  }
};

/**
 * Send notification for user added to group
 * @param {number} userId - User added to group
 * @param {object} groupData - Group details
 */
const notifyUserAddedToGroup = async (userId, groupData) => {
  try {
    const { chat_id, chat_name, added_by_username } = groupData;

    const payload = {
      title: 'Added to Group',
      body: `You've been added to "${chat_name}" by ${added_by_username}`,
      icon: 'https://via.placeholder.com/192',
      badge: 'https://via.placeholder.com/72',
      tag: `group-add-${chat_id}`,
      data: {
        chat_id: chat_id,
        action: 'open_chat',
        url: `/chat/${chat_id}`
      },
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200]
    };

    const result = await sendPushNotificationToUser(userId, payload);

    // Save notification to database
    try {
      await prisma.notification.create({
        data: {
          user_id: userId,
          message: `You've been added to "${chat_name}" by ${added_by_username}`,
          notification_type: 'group_added',
          action_url: `/chat/${chat_id}`,
          is_read: false
        }
      });
    } catch (dbError) {
      console.error(`Error saving group addition notification for user ${userId}:`, dbError.message);
    }

    return result;
  } catch (error) {
    console.error('Error in notifyUserAddedToGroup:', error);
    return false;
  }
};

/**
 * Send notification for group info change
 * @param {array} userIds - Group member user IDs
 * @param {object} changeData - What changed
 */
const notifyGroupInfoChange = async (userIds, changeData) => {
  try {
    const { chat_id, chat_name, change_type, changed_by_username } = changeData;

    let message = '';
    if (change_type === 'name') {
      message = `Group name changed to "${chat_name}"`;
    } else if (change_type === 'image') {
      message = `Group image updated`;
    } else if (change_type === 'description') {
      message = `Group description updated`;
    } else {
      message = `Group info updated`;
    }

    const payload = {
      title: chat_name,
      body: `${changed_by_username}: ${message}`,
      icon: 'https://via.placeholder.com/192',
      badge: 'https://via.placeholder.com/72',
      tag: `group-change-${chat_id}`,
      data: {
        chat_id: chat_id,
        action: 'open_chat',
        url: `/chat/${chat_id}`
      },
      requireInteraction: false,
      vibrate: [200, 100, 200]
    };

    const result = await sendPushNotificationToMultipleUsers(userIds, payload);

    // Save notifications to database for each user
    try {
      const notificationPromises = userIds.map(userId =>
        prisma.notification.create({
          data: {
            user_id: userId,
            message: `${changed_by_username}: ${message}`,
            notification_type: 'group_info_changed',
            action_url: `/chat/${chat_id}`,
            is_read: false
          }
        }).catch(err => {
          console.error(`Error saving group info change notification for user ${userId}:`, err.message);
          return null;
        })
      );

      await Promise.all(notificationPromises);
    } catch (dbError) {
      console.error('Error saving group info change notifications to database:', dbError);
    }

    return result;
  } catch (error) {
    console.error('Error in notifyGroupInfoChange:', error);
    return { sent: 0, failed: userIds.length };
  }
};

/**
 * Save push subscription to database
 * @param {number} userId - User ID
 * @param {object} subscription - Push subscription object
 */
const savePushSubscription = async (userId, subscription) => {
  try {
    const { endpoint, keys } = subscription;

    // Upsert (update or create) subscription
    const result = await prisma.pushSubscription.upsert({
      where: { user_id: userId },
      update: {
        endpoint: endpoint,
        auth_key: keys.auth,
        p256dh_key: keys.p256dh,
        updated_at: new Date()
      },
      create: {
        user_id: userId,
        endpoint: endpoint,
        auth_key: keys.auth,
        p256dh_key: keys.p256dh
      }
    });

    return result;
  } catch (error) {
    console.error('Error saving push subscription:', error);
    throw error;
  }
};

/**
 * Remove push subscription from database
 * @param {number} userId - User ID
 */
const removePushSubscription = async (userId) => {
  try {
    await prisma.pushSubscription.delete({
      where: { user_id: userId }
    });
    return true;
  } catch (error) {
    if (error.code === 'P2025') {
      // Record not found
      return false;
    }
    console.error('Error removing push subscription:', error);
    throw error;
  }
};

/**
 * Get VAPID public key for client
 * @returns {string} - VAPID public key
 */
const getVapidPublicKey = () => {
  return process.env.VAPID_PUBLIC_KEY;
};

/**
 * Save notification to database
 * @param {number} userId - User ID
 * @param {object} notificationData - Notification data
 */
const saveNotification = async (userId, notificationData) => {
  try {
    const {
      message,
      notification_type = 'message',
      action_url = null
    } = notificationData;

    const notification = await prisma.notification.create({
      data: {
        user_id: userId,
        message,
        notification_type,
        action_url
      }
    });

    return notification;
  } catch (error) {
    console.error('Error saving notification to DB:', error);
    throw error;
  }
};

module.exports = {
  sendPushNotificationToUser,
  sendPushNotificationToMultipleUsers,
  notifyNewMessage,
  notifyUserAddedToGroup,
  notifyGroupInfoChange,
  savePushSubscription,
  removePushSubscription,
  getVapidPublicKey,
  saveNotification
};
