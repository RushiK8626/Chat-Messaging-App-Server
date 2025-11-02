const express = require('express');
const router = express.Router();
const chatController = require('../controller/chat.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { upload } = require('../config/upload');

// All chat routes require authentication
router.use(verifyToken);

// Chat info
router.get('/:id/info', chatController.getChatInfo);

// Search chats (private by member name, group by chat name)
router.get('/search', chatController.searchChats);

// Chat CRUD operations - with file upload for group image
router.post('/', upload.single('group_image'), chatController.createChat);
router.get('/:id', chatController.getChatById);
router.put('/:id', chatController.updateChat);
router.delete('/:id', chatController.deleteChat);

// User chats
router.get('/user/:userId', chatController.getUserChats);
router.get('/user/:userId/preview', chatController.getUserChatsPreview);

// Member management
router.post('/:chatId/members', chatController.addChatMember);
router.delete('/:chatId/members/:userId', chatController.removeChatMember);

module.exports = router;