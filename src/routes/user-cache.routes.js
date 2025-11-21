const express = require('express');
const router = express.Router();
const userCacheController = require('../controller/user-cache.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.use(verifyToken);

// Get cached user profile
router.get('/profile/:userId', userCacheController.getUserProfile);

// Get cached chat memberships
router.get('/chats/:userId', userCacheController.getChatMemberships);

// Get cached friend list
router.get('/friends/:userId', userCacheController.getFriendList);

// Invalidate user caches (for testing/manual cache clearing)
router.delete('/invalidate/:userId', userCacheController.invalidateUserCaches);

module.exports = router;
