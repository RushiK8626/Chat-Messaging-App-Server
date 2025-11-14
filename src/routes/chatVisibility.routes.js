const express = require('express');
const router = express.Router();
const chatVisibilityController = require('../controller/chatVisibility.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.use(verifyToken);

// GET operations MUST come before dynamic routes to avoid conflicts
router.get('/archived/:userId', chatVisibilityController.getArchivedChats);
router.get('/active/:userId', chatVisibilityController.getActiveChats);
router.get('/status/:chatId', chatVisibilityController.getChatStatus);

// Archive/Unarchive operations
router.put('/:chatId/archive', chatVisibilityController.archiveChat);
router.put('/:chatId/unarchive', chatVisibilityController.unarchiveChat);

// Pin/Unpin operations
router.put('/:chatId/pin', chatVisibilityController.pinChat);
router.put('/:chatId/unpin', chatVisibilityController.unpinChat);

// Batch operations
router.post('/batch/delete', chatVisibilityController.batchDeleteChats);
router.post('/batch/pin', chatVisibilityController.batchPinChats);
router.post('/batch/unpin', chatVisibilityController.batchUnpinChats);
router.post('/batch/archive', chatVisibilityController.batchArchiveChats);
router.post('/batch/unarchive', chatVisibilityController.batchUnarchiveChats);
router.post('/batch/mark-read', chatVisibilityController.batchMarkReadChats);

// Delete operation
router.delete('/:chatId', chatVisibilityController.deleteChat);

module.exports = router;
