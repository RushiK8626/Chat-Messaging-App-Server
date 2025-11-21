const userCacheService = require('../services/user-cache.service');

// Get user profile (cache-first)
exports.getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await userCacheService.getUserProfile(parseInt(userId));
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user, cached: true });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

// Get user's chat memberships (cache-first)
exports.getChatMemberships = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const chats = await userCacheService.getChatMemberships(parseInt(userId));
    
    res.json({ chats, cached: true });
  } catch (error) {
    console.error('Get chat memberships error:', error);
    res.status(500).json({ error: 'Failed to fetch chat memberships' });
  }
};

// Get user's friend list (cache-first)
exports.getFriendList = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const friends = await userCacheService.getFriendList(parseInt(userId));
    
    res.json({ friends, cached: true });
  } catch (error) {
    console.error('Get friend list error:', error);
    res.status(500).json({ error: 'Failed to fetch friend list' });
  }
};

// Invalidate all user caches
exports.invalidateUserCaches = async (req, res) => {
  try {
    const { userId } = req.params;
    
    await userCacheService.invalidateAllUserCaches(parseInt(userId));
    
    res.json({ message: 'User caches invalidated successfully' });
  } catch (error) {
    console.error('Invalidate caches error:', error);
    res.status(500).json({ error: 'Failed to invalidate caches' });
  }
};

module.exports = exports;
