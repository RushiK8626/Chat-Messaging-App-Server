const { PrismaClient } = require('@prisma/client');
const notificationService = require('../services/notification.service');

const prisma = new PrismaClient();

/**
 * Subscribe user to push notifications
 * POST /api/notifications/subscribe
 */
exports.subscribeToPushNotifications = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    const { subscription } = req.body;

    if (!user_id || !subscription) {
      return res.status(400).json({
        error: 'user_id and subscription are required'
      });
    }

    if (!subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        error: 'Invalid subscription format'
      });
    }

    // Save subscription
    const savedSubscription = await notificationService.savePushSubscription(
      user_id,
      subscription
    );

    res.status(201).json({
      message: 'Successfully subscribed to push notifications',
      data: {
        user_id,
        subscribed_at: savedSubscription.created_at
      }
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe to notifications' });
  }
};

/**
 * Unsubscribe user from push notifications
 * POST /api/notifications/unsubscribe
 */
exports.unsubscribeFromPushNotifications = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const result = await notificationService.removePushSubscription(user_id);

    if (!result) {
      return res.status(404).json({
        error: 'Push subscription not found'
      });
    }

    res.status(200).json({
      message: 'Successfully unsubscribed from push notifications'
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe from notifications' });
  }
};

/**
 * Get VAPID public key for frontend
 * GET /api/notifications/vapid-public-key
 */
exports.getVapidPublicKey = async (req, res) => {
  try {
    const publicKey = notificationService.getVapidPublicKey();

    if (!publicKey) {
      return res.status(500).json({
        error: 'VAPID public key not configured'
      });
    }

    // Set cache headers for public endpoint
    res.set({
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      'Content-Type': 'application/json'
    });

    res.status(200).json({
      vapidPublicKey: publicKey
    });
  } catch (error) {
    console.error('Get VAPID key error:', error);
    res.status(500).json({ error: 'Failed to retrieve VAPID key' });
  }
};

/**
 * Get all notifications for user
 * GET /api/notifications
 */
exports.getNotifications = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    const { limit = 20, offset = 0 } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const notifications = await prisma.notification.findMany({
      where: { user_id },
      orderBy: { created_at: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      select: {
        notification_id: true,
        message: true,
        notification_type: true,
        action_url: true,
        is_read: true,
        read_at: true,
        created_at: true
      }
    });

    const total = await prisma.notification.count({
      where: { user_id }
    });

    res.status(200).json({
      data: notifications,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

/**
 * Mark notification as read
 * PUT /api/notifications/:notification_id/read
 */
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { notification_id } = req.params;
    const user_id = req.user?.user_id;

    if (!notification_id || !user_id) {
      return res.status(400).json({
        error: 'notification_id and user_id are required'
      });
    }

    // Verify ownership
    const notification = await prisma.notification.findUnique({
      where: { notification_id: parseInt(notification_id) }
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.user_id !== user_id) {
      return res.status(403).json({
        error: 'Not authorized to update this notification'
      });
    }

    const updated = await prisma.notification.update({
      where: { notification_id: parseInt(notification_id) },
      data: {
        is_read: true,
        read_at: new Date()
      }
    });

    res.status(200).json({
      message: 'Notification marked as read',
      data: updated
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const result = await prisma.notification.updateMany({
      where: {
        user_id,
        is_read: false
      },
      data: {
        is_read: true,
        read_at: new Date()
      }
    });

    res.status(200).json({
      message: 'All notifications marked as read',
      updated_count: result.count
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
};

/**
 * Delete notification
 * DELETE /api/notifications/:notification_id
 */
exports.deleteNotification = async (req, res) => {
  try {
    const { notification_id } = req.params;
    const user_id = req.user?.user_id;

    if (!notification_id || !user_id) {
      return res.status(400).json({
        error: 'notification_id and user_id are required'
      });
    }

    // Verify ownership
    const notification = await prisma.notification.findUnique({
      where: { notification_id: parseInt(notification_id) }
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.user_id !== user_id) {
      return res.status(403).json({
        error: 'Not authorized to delete this notification'
      });
    }

    await prisma.notification.delete({
      where: { notification_id: parseInt(notification_id) }
    });

    res.status(200).json({
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const count = await prisma.notification.count({
      where: {
        user_id,
        is_read: false
      }
    });

    res.status(200).json({
      unread_count: count
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
};

/**
 * Send test push notification
 * POST /api/notifications/send-test
 */
exports.sendTestNotification = async (req, res) => {
  try {
    const { user_id, title, body } = req.body;

    if (!user_id || !title || !body) {
      return res.status(400).json({
        error: 'user_id, title, and body are required'
      });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { user_id }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Get user's push subscription
    const subscription = await prisma.pushSubscription.findUnique({
      where: { user_id }
    });

    if (!subscription) {
      return res.status(400).json({
        error: 'User has no active push subscription'
      });
    }

    // Send test push notification
    await notificationService.sendPushNotificationToUser(
      user_id,
      title,
      body,
      {
        notification_type: 'test',
        action_url: '/notifications'
      }
    );

    res.status(200).json({
      message: 'Test notification sent successfully',
      data: {
        user_id,
        title,
        body
      }
    });
  } catch (error) {
    console.error('Send test notification error:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
};
