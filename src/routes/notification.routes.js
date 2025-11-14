const express = require('express');
const router = express.Router();
const notificationController = require('../controller/notification.controller');
const { verifyToken } = require('../middleware/auth.middleware');

/**
 * @route   GET /api/notifications/vapid-public-key
 * @desc    Get VAPID public key for frontend
 * @access  Public
 */
router.get('/vapid-public-key', notificationController.getVapidPublicKey);

/**
 * @route   POST /api/notifications/subscribe
 * @desc    Subscribe user to push notifications
 * @access  Private
 * @body    { subscription: { endpoint, keys: { auth, p256dh } } }
 */
router.post('/subscribe', verifyToken, notificationController.subscribeToPushNotifications);

/**
 * @route   POST /api/notifications/unsubscribe
 * @desc    Unsubscribe user from push notifications
 * @access  Private
 */
router.post('/unsubscribe', verifyToken, notificationController.unsubscribeFromPushNotifications);

/**
 * @route   GET /api/notifications
 * @desc    Get all notifications for authenticated user
 * @access  Private
 * @query   { limit: number, offset: number }
 */
router.get('/', verifyToken, notificationController.getNotifications);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get count of unread notifications
 * @access  Private
 */
router.get('/unread-count', verifyToken, notificationController.getUnreadCount);

/**
 * @route   PUT /api/notifications/:notification_id/read
 * @desc    Mark a specific notification as read
 * @access  Private
 */
router.put('/:notification_id/read', verifyToken, notificationController.markNotificationAsRead);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put('/read-all', verifyToken, notificationController.markAllNotificationsAsRead);

/**
 * @route   DELETE /api/notifications/:notification_id
 * @desc    Delete a specific notification
 * @access  Private
 */
router.delete('/:notification_id', verifyToken, notificationController.deleteNotification);

/**
 * @route   POST /api/notifications/send-test
 * @desc    Send a test push notification to a user
 * @access  Private
 * @body    { user_id: string, title: string, body: string }
 */
router.post('/send-test', verifyToken, notificationController.sendTestNotification);

module.exports = router;
