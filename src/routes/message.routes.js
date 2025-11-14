const express = require('express');
const router = express.Router();
const messageController = require('../controller/message.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { upload } = require('../config/upload');

router.use(verifyToken);

// Essential routes only
router.post('/', messageController.createMessage); // Send text message (no attachment)
router.post('/upload', upload.single('file'), messageController.uploadFileAndCreateMessage);
router.get('/chat/:chatId', messageController.getMessagesByChat);
router.get('/unread/:userId', messageController.getUnreadMessageCount);

// Delete routes
router.delete('/:id', messageController.deleteMessageForUser); // Delete for current user only
router.delete('/:id/all', messageController.deleteMessageForAll); // Delete for all members (sender only)

router.get('/:messageId/attachments', messageController.getMessageAttachments);
router.put('/chat/:chatId/read-all/:userId', messageController.markAllMessagesAsRead);

module.exports = router;