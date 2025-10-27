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
router.delete('/:id', messageController.deleteMessage);
router.get('/:messageId/attachments', messageController.getMessageAttachments);
router.put('/chat/:chatId/read-all/:userId', messageController.markAllMessagesAsRead);

module.exports = router;