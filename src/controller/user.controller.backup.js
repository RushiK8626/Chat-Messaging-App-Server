const { PrismaClient } = require('@prisma/client');
const { parse } = require('dotenv');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();


// Add this temporary debug function at the end of your file

// Debug: List all usernames in database
exports.debugListAllUsernames = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        user_id: true,
        username: true,
        full_name: true,
        email: true
      }
    });
    
    console.log('All users in database:', users);
    res.json({
      totalUsers: users.length,
      users: users
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, password, email, phone, full_name } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (!email && !phone) {
      return res.status(400).json({ error: 'Either email or phone is required' });
    }

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Check if email already exists
    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email }
      });

      if (existingEmail) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    // Check if phone already exists
    if (phone) {
      const existingPhone = await prisma.user.findUnique({
        where: { phone }
      });

      if (existingPhone) {
        return res.status(409).json({ error: 'Phone number already exists' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user and auth record in a transaction
    const user = await prisma.user.create({
      data: {
        username,
        email,
        phone,
        full_name,
        status_message: 'Hey there! I am using ConvoHub',
        auth: {
          create: {
            password_hash: hashedPassword
          }
        }
      },
      select: {
        user_id: true,
        username: true,
        email: true,
        phone: true,
        full_name: true,
        status_message: true,
        created_at: true
      }
    });

    res.status(201).json({
      message: 'User created successfully',
      user
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

// // Get all users
// exports.getAllUsers = async (req, res) => {
//   try {
//     const users = await prisma.user.findMany();
//     res.json(users);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { user_id: parseInt(id) },
      select: {
        user_id: true,
        username: true,
        email: true,
        phone: true,
        full_name: true,
        profile_pic: true,
        status_message: true,
        created_at: true
      }
    });

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
    const { full_name, email, phone, status_message, profile_pic } = req.body;

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
        ...(email && { email }),
        ...(phone && { phone }),
        ...(status_message !== undefined && { status_message }),
        ...(profile_pic !== undefined && { profile_pic })
      },
      select: {
        user_id: true,
        username: true,
        email: true,
        phone: true,
        full_name: true,
        profile_pic: true,
        status_message: true,
        created_at: true
      }
    });

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

// Search user by email
exports.getUserByEmail = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: req.params.email }
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// Get users with pagination
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search ? {
      OR: [
        { username: { contains: search } },
        { full_name: { contains: search } },
        { email: { contains: search } }
      ]
    } : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(limit),
        select: {
          user_id: true,
          username: true,
          email: true,
          phone: true,
          full_name: true,
          profile_pic: true,
          status_message: true,
          created_at: true
        },
        orderBy: { created_at: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
};

// Update user password
exports.updateUserPassword = async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    const bcrypt = require('bcrypt');

    // First verify current password
    const auth = await prisma.auth.findUnique({
      where: { user_id: parseInt(userId) }
    });

    if (!auth) {
      return res.status(404).json({ error: 'User authentication not found' });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, auth.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password and update
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await prisma.auth.update({
      where: { user_id: parseInt(userId) },
      data: { password_hash: hashedPassword }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update last login
exports.updateLastLogin = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    await prisma.auth.update({
      where: { user_id: userId },
      data: { last_login: new Date() }
    });
    res.json({ message: 'Last login updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get user authentication info
exports.getUserAuth = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const auth = await prisma.auth.findUnique({
      where: { user_id: userId },
      select: {
        auth_id: true,
        user_id: true,
        last_login: true
      }
    });
    res.json(auth);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get user's chats
exports.getUserChats = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const userChats = await prisma.chatMember.findMany({
      where: { user_id: userId },
      include: {
        chat: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    user_id: true,
                    username: true,
                    full_name: true,
                    profile_pic: true
                  }
                }
              }
            },
            messages: {
              orderBy: { created_at: 'desc' },
              take: 1,
              include: {
                sender: {
                  select: {
                    username: true,
                    full_name: true
                  }
                }
              }
            }
          }
        }
      }
    });
    res.json(userChats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get user's messages with pagination
exports.getUserMessages = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const messages = await prisma.message.findMany({
      where: { sender_id: userId },
      include: {
        chat: {
          select: {
            chat_id: true,
            chat_name: true,
            chat_type: true
          }
        },
        status: true,
        attachments: true
      },
      orderBy: { created_at: 'desc' },
      skip: skip,
      take: limit
    });

    res.json(messages);
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

// Get user's active sessions
exports.getUserSessions = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const sessions = await prisma.session.findMany({
      where: { user_id: userId },
      orderBy: { last_active: 'desc' }
    });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create new user session
exports.createUserSession = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { device_info, ip_address } = req.body;

    const session = await prisma.session.create({
      data: {
        user_id: userId,
        device_info,
        ip_address,
        last_active: new Date()
      }
    });

    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update session activity
exports.updateSessionActivity = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    await prisma.session.update({
      where: { session_id: sessionId },
      data: { last_active: new Date() }
    });
    res.json({ message: 'Session activity updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete user session (logout)
exports.deleteUserSession = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    await prisma.session.delete({
      where: { session_id: sessionId }
    });
    res.json({ message: 'Session deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get user statistics
exports.getUserStats = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const [messageCount, chatCount, notificationCount, sessionCount] = await Promise.all([
      prisma.message.count({ where: { sender_id: userId } }),
      prisma.chatMember.count({ where: { user_id: userId } }),
      prisma.notification.count({ where: { user_id: userId, is_read: false } }),
      prisma.session.count({ where: { user_id: userId } })
    ]);

    const stats = {
      totalMessages: messageCount,
      totalChats: chatCount,
      unreadNotifications: notificationCount,
      activeSessions: sessionCount
    };

    res.json(stats);
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


