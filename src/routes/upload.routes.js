const express = require('express');
const router = express.Router();
const uploadController = require('../controller/upload.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Upload routes (authentication required)
router.post('/profile-pic', verifyToken, uploadController.uploadProfilePic);
router.post('/group-image', verifyToken, uploadController.uploadGroupImage);
router.post('/attachment', verifyToken, uploadController.uploadAttachment);

// Protected file serving (authentication required)
router.get('/chat-images/:filename', verifyToken, uploadController.getChatImage);
router.get('/attachments/:filename', verifyToken, uploadController.getAttachment);
router.get('/:filename', verifyToken, uploadController.getFile);

// Public routes (no authentication required)
router.get('/profiles/:filename', uploadController.getProfilePicture);

module.exports = router;
