const userCacheService = require('../services/user-cache.service');

// Search users by name or username (public, paginated)
exports.searchUsersPublic = async (req, res) => {
  try {
    const { query, page = 1, limit = 10 } = req.query;
    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    const pageNum = parseInt(page) > 0 ? parseInt(page) : 1;
    const limitNum = parseInt(limit) > 0 ? parseInt(limit) : 10;
    const skip = (pageNum - 1) * limitNum;

    // Find users matching name or username (case-insensitive)
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query } },
          { full_name: { contains: query } }
        ]
      },
      select: {
        user_id: true,
        username: true,
        full_name: true,
        profile_pic: true,
        status_message: true,
        is_online: true,
        last_seen: true
      },
      skip,
      take: limitNum
    });

    // Get total count for pagination
    const total = await prisma.user.count({
      where: {
        OR: [
          { username: { contains: query } },
          { full_name: { contains: query } }
        ]
      }
    });

    res.json({
      users,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    console.error('Public user search error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
};
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

// ========== ESSENTIAL USER FUNCTIONS ONLY ==========

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    // Try cache first
    const user = await userCacheService.getUserProfile(parseInt(id));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};

// Update user data
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, username, status_message, profile_pic } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { user_id: parseInt(id) }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { user_id: parseInt(id) },
      data: {
        ...(full_name && { full_name }),
        ...(username && { username }),
        ...(status_message !== undefined && { status_message }),
        ...(profile_pic !== undefined && { profile_pic })
      },
      select: {
        user_id: true,
        username: true,
        full_name: true,
        profile_pic: true,
        status_message: true,
        created_at: true
      }
    });

    // Invalidate user cache
    await userCacheService.invalidateUserProfile(parseInt(id));

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { user_id: parseInt(id) }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { user_id: parseInt(id) }
    });

    res.json({ message: 'User deleted successfully' });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// Search user by username
exports.getUserByUsername = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: {
        user_id: true,
        username: true,
        full_name: true,
        email: true,
        phone: true,
        profile_pic: true,
        status_message: true,
        created_at: true
      }
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Search users by name (partial match)
exports.searchUsersByName = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { full_name: { contains: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: {
        user_id: true,
        username: true,
        full_name: true,
        profile_pic: true,
        status_message: true
      },
      take: 20 // Limit results
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Block a user
exports.blockUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { blockedUserId } = req.body;

    if (userId === blockedUserId) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    const blockedUser = await prisma.blockedUser.create({
      data: {
        user_id: userId,
        blocked_user_id: parseInt(blockedUserId)
      }
    });

    res.json({ message: 'User blocked successfully', blockedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Unblock a user
exports.unblockUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const blockedUserId = parseInt(req.params.blockedUserId);

    await prisma.blockedUser.delete({
      where: {
        user_id_blocked_user_id: {
          user_id: userId,
          blocked_user_id: blockedUserId
        }
      }
    });

    res.json({ message: 'User unblocked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get user's blocked users
exports.getBlockedUsers = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const blockedUsers = await prisma.blockedUser.findMany({
      where: { user_id: userId },
      include: {
        blockedUser: {
          select: {
            user_id: true,
            username: true,
            full_name: true,
            profile_pic: true
          }
        }
      }
    });
    res.json(blockedUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Check if users are blocked (either direction)
exports.checkBlockStatus = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const otherUserId = parseInt(req.params.otherUserId);

    if (userId === otherUserId) {
      return res.status(400).json({ error: 'Cannot check block status with same user' });
    }

    // Check if current user blocked the other user
    const currentUserBlocked = await prisma.blockedUser.findUnique({
      where: {
        user_id_blocked_user_id: {
          user_id: userId,
          blocked_user_id: otherUserId
        }
      }
    });

    // Check if other user blocked the current user
    const otherUserBlocked = await prisma.blockedUser.findUnique({
      where: {
        user_id_blocked_user_id: {
          user_id: otherUserId,
          blocked_user_id: userId
        }
      }
    });

    res.json({
      currentUserBlockedOther: !!currentUserBlocked,
      otherUserBlockedCurrent: !!otherUserBlocked,
      isBlocked: !!currentUserBlocked || !!otherUserBlocked
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get user's notifications
exports.getUserNotifications = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notifications = await prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      skip: skip,
      take: limit
    });

    const unreadCount = await prisma.notification.count({
      where: {
        user_id: userId,
        is_read: false
      }
    });

    res.json({
      notifications,
      unreadCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Mark notification as read
exports.markNotificationRead = async (req, res) => {
  try {
    const notificationId = parseInt(req.params.notificationId);
    await prisma.notification.update({
      where: { notification_id: notificationId },
      data: { is_read: true }
    });
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update user status message
exports.updateUserStatus = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { status_message } = req.body;

    const updatedUser = await prisma.user.update({
      where: { user_id: userId },
      data: { status_message },
      select: {
        user_id: true,
        username: true,
        full_name: true,
        status_message: true
      }
    });

    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update user profile picture
exports.updateUserProfilePic = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { profile_pic } = req.body;

    const updatedUser = await prisma.user.update({
      where: { user_id: userId },
      data: { profile_pic },
      select: {
        user_id: true,
        username: true,
        full_name: true,
        profile_pic: true
      }
    });

    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Check if username is available
exports.checkUsernameAvailability = async (req, res) => {
  try {
    const { username } = req.params;
    const existingUser = await prisma.user.findUnique({
      where: { username },
      select: { user_id: true }
    });

    res.json({
      username,
      available: !existingUser
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Check if email is available
exports.checkEmailAvailability = async (req, res) => {
  try {
    const { email } = req.params;
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { user_id: true }
    });

    res.json({
      email,
      available: !existingUser
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Public user profile (by username or id)
exports.getPublicUserProfile = async (req, res) => {
  try {
    const { username, id } = req.params;
    let user;
    if (username) {
      user = await prisma.user.findUnique({
        where: { username },
        select: {
          user_id: true,
          username: true,
          full_name: true,
          profile_pic: true,
          status_message: true,
          is_online: true,
          last_seen: true,
          created_at: true
        }
      });
    } else if (id) {
      user = await prisma.user.findUnique({
        where: { user_id: parseInt(id) },
        select: {
          user_id: true,
          username: true,
          full_name: true,
          profile_pic: true,
          status_message: true,
          is_online: true,
          last_seen: true,
          created_at: true
        }
      });
    } else {
      return res.status(400).json({ error: 'Username or ID required' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Get public user profile error:', error);
    res.status(500).json({ error: 'Failed to get public user profile' });
  }
};
