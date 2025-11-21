const express = require('express');
const router = express.Router();
const userController = require('../controller/user.controller');
const { verifyToken, optionalAuth } = require('../middleware/auth.middleware');

// Public routes
router.get('/public/search', userController.searchUsersPublic);
router.get('/search', optionalAuth, userController.searchUsersByName);
router.get('/username/:username', optionalAuth, userController.getUserByUsername);
router.get('/check-username/:username', userController.checkUsernameAvailability);
router.get('/check-email/:email', userController.checkEmailAvailability);

// Public user profile (by username or id)
router.get('/public/username/:username', userController.getPublicUserProfile);
router.get('/public/id/:id', userController.getPublicUserProfile);

// Protected routes
router.use(verifyToken);
router.get('/:id', userController.getUserById);
router.put('/:id', userController.updateUser);
router.put('/:id/status', userController.updateUserStatus);
router.put('/:id/profile-pic', userController.updateUserProfilePic);
router.post('/:id/block', userController.blockUser);
router.delete('/:id/unblock/:blockedUserId', userController.unblockUser);
router.get('/:id/blocked', userController.getBlockedUsers);
router.get('/:id/block-status/:otherUserId', userController.checkBlockStatus);
router.get('/:id/notifications', userController.getUserNotifications);

module.exports = router;