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
router.put('/:id', upload.single('group_image'), chatController.updateChat);
router.delete('/:id', chatController.deleteChat);

// User chats
router.get('/user/:userId', chatController.getUserChats);
router.get('/user/:userId/preview', chatController.getUserChatsPreview);

// Member management with WebSocket notifications
router.post('/:chatId/members', (req, res) => {
  chatController.addChatMember(req, res, req.io);
});

router.delete('/:chatId/members/:userId', (req, res) => {
  chatController.removeChatMember(req, res, req.io);
});

// Exit group chat (current user leaves)
router.post('/:chatId/exit', (req, res) => {
  chatController.exitGroupChat(req, res, req.io);
});

module.exports = router;