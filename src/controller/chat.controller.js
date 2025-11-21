const userCacheService = require('../services/user-cache.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Search chats by member name (private) or chat name (group)
exports.searchChats = async (req, res) => {
  try {
    const { query, page = 1, limit = 10 } = req.query;
    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    const pageNum = parseInt(page) > 0 ? parseInt(page) : 1;
    const limitNum = parseInt(limit) > 0 ? parseInt(limit) : 10;

    // Find private chats (fetch all, filter in JS for case-insensitive search)
    const privateChatsRaw = await prisma.chat.findMany({
      where: { chat_type: 'private' },
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
        }
      }
    });
    const q = query.toLowerCase();
    let privateChats = privateChatsRaw.filter(chat =>
      chat.members.some(m =>
        (m.user.username && m.user.username.toLowerCase().includes(q)) ||
        (m.user.full_name && m.user.full_name.toLowerCase().includes(q))
      )
    );
    const privateTotal = privateChats.length;
    privateChats = privateChats.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    // Find group chats (fetch all, filter in JS for case-insensitive search)
    const groupChatsRaw = await prisma.chat.findMany({
      where: { chat_type: 'group' },
      select: { chat_id: true, chat_name: true }
    });
    let groupChats = groupChatsRaw.filter(chat =>
      chat.chat_name && chat.chat_name.toLowerCase().includes(q)
    );
    const groupTotal = groupChats.length;
    groupChats = groupChats.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      privateChats: privateChats.map(chat => ({
        chat_id: chat.chat_id,
        members: chat.members.map(m => m.user)
      })),
      privateTotal,
      groupChats,
      groupTotal,
      page: pageNum,
      limit: limitNum
    });
  } catch (error) {
    console.error('Search chats error:', error);
    res.status(500).json({ error: 'Failed to search chats' });
  }
};

const notificationService = require('../services/notification.service');

// Create a new chat (private or group)
exports.createChat = async (req, res) => {
  try {
    const { chat_type, chat_name, member_ids, admin_id, description } = req.body;
    let groupImagePath = null;

    // Handle group image upload
    if (req.file) {
      groupImagePath = `/uploads/${req.file.filename}`;
    }

    // Validation
    if (!chat_type || !['private', 'group'].includes(chat_type)) {
      return res.status(400).json({ error: 'Invalid chat type. Must be "private" or "group"' });
    }

    // Parse member_ids - can be array or JSON string
    let parsedMemberIds = member_ids;

    if (!member_ids) {
      return res.status(400).json({ error: 'member_ids array is required' });
    }

    // If it's a string, parse it as JSON
    if (typeof member_ids === 'string') {
      try {
        parsedMemberIds = JSON.parse(member_ids);
      } catch (e) {
        return res.status(400).json({ error: 'member_ids must be a valid JSON array string' });
      }
    }

    // Validate it's an array and has elements
    if (!Array.isArray(parsedMemberIds) || parsedMemberIds.length === 0) {
      return res.status(400).json({ error: 'member_ids must be a non-empty array' });
    }

    // Private chat must have exactly 2 members
    if (chat_type === 'private' && parsedMemberIds.length !== 2) {
      return res.status(400).json({ error: 'Private chat must have exactly 2 members' });
    }

    // Group chat must have a name
    if (chat_type === 'group' && !chat_name) {
      return res.status(400).json({ error: 'Group chat must have a chat_name' });
    }

    // Group chat must have an admin
    if (chat_type === 'group' && !admin_id) {
      return res.status(400).json({ error: 'Group chat must have an admin_id' });
    }

    // Check if admin is in member list
    if (chat_type === 'group' && !parsedMemberIds.includes(parseInt(admin_id))) {
      return res.status(400).json({ error: 'Admin must be a member of the group' });
    }

    // Verify all members exist
    const users = await prisma.user.findMany({
      where: { user_id: { in: parsedMemberIds.map(id => parseInt(id)) } }
    });

    if (users.length !== parsedMemberIds.length) {
      return res.status(404).json({ error: 'One or more users not found' });
    }

    // For private chats, check if chat already exists using private_chat_key
    let privateChatKey = null;
    if (chat_type === 'private') {
      // Generate private_chat_key from sorted user IDs
      const sortedIds = [...parsedMemberIds].sort((a, b) => a - b);
      privateChatKey = sortedIds.join('_');

      const existingChat = await prisma.chat.findFirst({
        where: {
          chat_type: 'private',
          private_chat_key: privateChatKey
        },
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
          }
        }
      });

      if (existingChat) {
        return res.status(200).json({
          message: 'Private chat already exists',
          chat: existingChat
        });
      }
    }

    // Create chat with members and optional group image
    const chat = await prisma.chat.create({
      data: {
        chat_type,
        chat_name: chat_type === 'group' ? chat_name : null,
        description: chat_type === 'group' && description ? description : null,
        chat_image: groupImagePath,
        private_chat_key: privateChatKey,
        members: {
          create: parsedMemberIds.map(user_id => ({
            user_id: parseInt(user_id),
            joined_at: new Date(),
            role: chat_type === 'group' && parseInt(user_id) === parseInt(admin_id) ? 'admin' : 'member'
          }))
        },
        ...(chat_type === 'group' && admin_id && {
          admins: {
            create: {
              user_id: parseInt(admin_id)
            }
          }
        })
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                user_id: true,
                username: true,
                full_name: true,
                profile_pic: true,
                status_message: true
              }
            }
          }
        },
        admins: {
          include: {
            user: {
              select: {
                user_id: true,
                username: true,
                full_name: true
              }
            }
          }
        }
      }
    });

    // Create ChatVisibility records for all chat members (default: active)
    await prisma.chatVisibility.createMany({
      data: parsedMemberIds.map(user_id => ({
        chat_id: chat.chat_id,
        user_id: parseInt(user_id),
        is_visible: true,
        is_archived: false,
        hidden_at: null,
        archived_at: null
      })),
      skipDuplicates: true  // Skip if record already exists
    });

    res.status(201).json({
      message: 'Chat created successfully',
      chat
    });

    // Invalidate chat memberships cache for all members
    for (const memberId of parsedMemberIds) {
      await userCacheService.invalidateChatMemberships(parseInt(memberId));
    }

  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
};

// Get chat by ID
exports.getChatById = async (req, res) => {
  try {
    const { id } = req.params;

    const chat = await prisma.chat.findUnique({
      where: { chat_id: parseInt(id) },
      include: {
        members: {
          include: {
            user: {
              select: {
                user_id: true,
                username: true,
                full_name: true,
                profile_pic: true,
                status_message: true
              }
            }
          }
        },
        admins: {
          include: {
            user: {
              select: {
                user_id: true,
                username: true,
                full_name: true
              }
            }
          }
        },
        messages: {
          take: 1,
          orderBy: { created_at: 'desc' },
          include: {
            sender: {
              select: {
                user_id: true,
                username: true,
                full_name: true
              }
            },
            status: true
          },
        }
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json({ chat });

  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ error: 'Failed to get chat' });
  }
};

// Get all chats for a user
exports.getUserChats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Try cache first (only for first page)
    if (parseInt(page) === 1) {
      const cachedChats = await userCacheService.getCachedChatMemberships(parseInt(userId));
      if (cachedChats) {
        console.log(`Cache HIT for user chats ${userId}`);
        return res.json({ chats: cachedChats });
      }
    }

    const chats = await prisma.chat.findMany({
      where: {
        AND: [
          {
            members: {
              some: {
                user_id: parseInt(userId)
              }
            }
          },
          {
            chatVisibility: {
              some: {
                user_id: parseInt(userId),
                is_visible: true
              }
            }
          }
        ]
      },
      skip,
      take: parseInt(limit),
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
        admins: {
          include: {
            user: {
              select: {
                user_id: true,
                username: true
              }
            }
          }
        },
        messages: {
          take: 1,
          where: {
            messageVisibility: {
              some: {
                user_id: userId,
                is_visible: true
              }
            }
          },
          orderBy: { created_at: 'desc' },
          include: {
            sender: {
              select: {
                user_id: true,
                username: true,
                full_name: true
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    res.json({
      chats,
      count: chats.length
    });

  } catch (error) {
    console.error('Get user chats error:', error);
    res.status(500).json({ error: 'Failed to get chats' });
  }
};

// Get user chats preview (only last message)
exports.getUserChatsPreview = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const userIdInt = parseInt(userId);

    // Calculate unread count per chat using raw query or aggregation
    const unreadCountsPerChat = await prisma.message.groupBy({
      by: ['chat_id'],
      where: {
        status: {
          some: {
            user_id: userIdInt,
            status: 'delivered'
          }
        }
      },
      _count: {
        message_id: true 
      }
    });

    // Convert to map for easy lookup: { chat_id: unreadCount }
    const unreadMap = {};
    unreadCountsPerChat.forEach(item => {
      unreadMap[item.chat_id] = item._count.message_id;
    });

    const chats = await prisma.chat.findMany({
      where: {
        AND: [
          {
            members: {
              some: {
                user_id: userIdInt
              }
            }
          },
          {
            chatVisibility: {
              some: {
                user_id: userIdInt,
                is_visible: true
              }
            }
          }
        ]
      },
      skip,
      take: parseInt(limit),
      include: {
        members: {
          include: {
            user: {
              select: {
                user_id: true,
                username: true,
                full_name: true,
                profile_pic: true,
                status_message: true
              }
            }
          }
        },
        messages: {
          take: 1,
          orderBy: { created_at: 'desc' },
          select: {
            message_id: true,
            message_text: true,
            message_type: true,
            created_at: true,
            sender: {
              select: {
                user_id: true,
                username: true,
                full_name: true
              }
            },
            attachments: {
              select: {
                file_type: true,
                file_url: true
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    // Format the chat previews
    const chatPreviews = chats.map(chat => {
      const lastMessage = chat.messages[0];
      let preview = {
        chat_id: chat.chat_id,
        chat_type: chat.chat_type,
        chat_name: chat.chat_name,
        chat_image: chat.chat_image,
        created_at: chat.created_at,
        members: chat.members,
        admins: chat.admins,
        last_message: null,
        last_message_timestamp: null,
        unread_count: unreadMap[chat.chat_id] || 0 
      };

      if (lastMessage) {
        // Determine preview text based on message type
        let previewText = lastMessage.message_text;
        
        // If message has attachments and no text, show file type
        if (lastMessage.attachments && lastMessage.attachments.length > 0 && !lastMessage.message_text) {
          const attachment = lastMessage.attachments[0];
          const fileType = attachment.file_type;
          
          if (fileType) {
            if (fileType.startsWith('image/')) {
              previewText = 'Image';
            } else if (fileType.startsWith('video/')) {
              previewText = 'Video';
            } else if (fileType.startsWith('audio/')) {
              previewText = 'Audio';
            } else if (fileType.includes('pdf')) {
              previewText = 'PDF';
            } else if (fileType.includes('word') || fileType.includes('document')) {
              previewText = 'Document';
            } else if (fileType.includes('excel') || fileType.includes('sheet')) {
              previewText = 'Spreadsheet';
            } else if (fileType.includes('zip') || fileType.includes('rar')) {
              previewText = 'Archive';
            } else {
              previewText = 'Attachment';
            }
          } else {
            previewText = 'File';
          }
        }

        preview.last_message = {
          message_id: lastMessage.message_id,
          message_type: lastMessage.message_type,
          preview_text: previewText,
          created_at: lastMessage.created_at,
          sender: lastMessage.sender,
          has_attachment: lastMessage.attachments && lastMessage.attachments.length > 0
        };
        preview.last_message_timestamp = lastMessage.created_at;
      }

      return preview;
    });

    // Get total count for pagination
    const totalCount = await prisma.chat.count({
      where: {
        AND: [
          {
            members: {
              some: {
                user_id: parseInt(userId)
              }
            }
          },
          {
            chatVisibility: {
              some: {
                user_id: parseInt(userId),
                is_visible: true
              }
            }
          }
        ]
      }
    });

    res.json({
      chats: chatPreviews,
      count: chatPreviews.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit))
    });

  } catch (error) {
    console.error('Get user chats preview error:', error);
    res.status(500).json({ error: 'Failed to get chats preview' });
  }
};

// Add member to chat
exports.addChatMember = async (req, res, io) => {
  try {
    const { chatId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Check if chat exists and is a group
    const chat = await prisma.chat.findUnique({
      where: { chat_id: parseInt(chatId) },
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
        }
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chat.chat_type !== 'group') {
      return res.status(400).json({ error: 'Can only add members to group chats' });
    }

    // Check if user is already a member
    const existingMember = await prisma.chatMember.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: parseInt(user_id)
        }
      }
    });

    if (existingMember) {
      return res.status(409).json({ error: 'User is already a member' });
    }

    // Check if user exists
    const newUser = await prisma.user.findUnique({
      where: { user_id: parseInt(user_id) },
      select: {
        user_id: true,
        username: true,
        full_name: true,
        profile_pic: true,
        is_online: true,
        last_seen: true
      }
    });

    if (!newUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add member
    const member = await prisma.chatMember.create({
      data: {
        chat_id: parseInt(chatId),
        user_id: parseInt(user_id),
        joined_at: new Date()
      }
    });

    // Create ChatVisibility record for new member
    await prisma.chatVisibility.create({
      data: {
        chat_id: parseInt(chatId),
        user_id: parseInt(user_id),
        is_visible: true,
        is_archived: false
      }
    });

    //  Emit WebSocket notification to all chat members
    if (io) {
      io.to(`chat_${chatId}`).emit('member_added', {
        chat_id: parseInt(chatId),
        member: {
          user_id: newUser.user_id,
          username: newUser.username,
          full_name: newUser.full_name,
          profile_pic: newUser.profile_pic
        },
        timestamp: new Date(),
        message: `${newUser.full_name || newUser.username} joined the group`
      });

      // NEW: Send direct notification to added user
      // Get the current user (admin who added this member)
      const currentUser = await prisma.user.findUnique({
        where: { user_id: req.user?.user_id },
        select: { user_id: true, username: true, full_name: true }
      });

      io.to(`user_${user_id}`).emit('you_were_added_to_group', {
        chat_id: parseInt(chatId),
        group_name: chat.chat_name,
        added_by: currentUser?.full_name || 'Admin',
        chat_image: chat.chat_image,
        message: `You were added to "${chat.chat_name}" by ${currentUser?.full_name || 'an admin'}`
      });

      // Send push notification to added user
      try {
        await notificationService.notifyUserAddedToGroup(user_id, {
          chat_id: parseInt(chatId),
          chat_name: chat.chat_name,
          added_by_username: currentUser?.username || 'Admin'
        });
      } catch (pushError) {
        console.error('Failed to send push notification:', pushError.message);
      }
    }

    res.status(201).json({
      message: 'Member added successfully',
      member: {
        user_id: newUser.user_id,
        username: newUser.username,
        full_name: newUser.full_name,
        profile_pic: newUser.profile_pic,
        is_online: newUser.is_online
      }
    });

  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

// Remove member from chat
exports.removeChatMember = async (req, res, io) => {
  try {
    const { chatId, userId } = req.params;

    // Check if chat exists
    const chat = await prisma.chat.findUnique({
      where: { chat_id: parseInt(chatId) }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chat.chat_type !== 'group') {
      return res.status(400).json({ error: 'Can only remove members from group chats' });
    }

    // Get member details before removing
    const member = await prisma.chatMember.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: parseInt(userId)
        }
      },
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
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found in this chat' });
    }

    const removedUserDetails = member.user;

    // Remove member
    await prisma.chatMember.delete({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: parseInt(userId)
        }
      }
    });

    // Delete ChatVisibility for this member
    await prisma.chatVisibility.delete({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: parseInt(userId)
        }
      }
    });

    // Remove GroupAdmin if user was admin
    await prisma.groupAdmin.deleteMany({
      where: {
        chat_id: parseInt(chatId),
        user_id: parseInt(userId)
      }
    });

    // Emit WebSocket notification to all remaining chat members
    if (io) {
      io.to(`chat_${chatId}`).emit('member_removed', {
        chat_id: parseInt(chatId),
        removed_member: {
          user_id: removedUserDetails.user_id,
          username: removedUserDetails.username,
          full_name: removedUserDetails.full_name,
          profile_pic: removedUserDetails.profile_pic
        },
        timestamp: new Date(),
        message: `${removedUserDetails.full_name || removedUserDetails.username} was removed from the group`
      });

      // NEW: Send direct notification to removed user
      // Get the current user (admin who removed this member)
      const currentUser = await prisma.user.findUnique({
        where: { user_id: req.user?.user_id },
        select: { user_id: true, username: true, full_name: true }
      });

      io.to(`user_${userId}`).emit('you_were_removed_from_group', {
        chat_id: parseInt(chatId),
        group_name: chat.chat_name,
        removed_by: currentUser?.full_name || 'Admin',
        message: `You were removed from "${chat.chat_name}" by ${currentUser?.full_name || 'an admin'}`
      });
    }

    // Check if chat is now empty
    const memberCount = await prisma.chatMember.count({
      where: { chat_id: parseInt(chatId) }
    });

    if (memberCount === 0) {
      // Delete empty group chat
      await prisma.chat.delete({
        where: { chat_id: parseInt(chatId) }
      });
    }

    res.json({ message: 'Member removed successfully' });

  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

// Update chat details
exports.updateChat = async (req, res) => {
  try {
    const { id } = req.params;
    const { chat_name, description } = req.body;
    
    // Handle optional group image upload
    let chatImagePath = null;
    if (req.file) {
      chatImagePath = `/uploads/${req.file.filename}`;
    }

    // Get old chat data to detect what changed
    const oldChat = await prisma.chat.findUnique({
      where: { chat_id: parseInt(id) }
    });

    const chat = await prisma.chat.update({
      where: { chat_id: parseInt(id) },
      data: {
        ...(chat_name && { chat_name: chat_name.trim() }),
        ...(description && { description: description.trim() }),
        ...(chatImagePath && { chat_image: chatImagePath })
      },
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
        }
      }
    });

    // Send push notifications for group info changes
    try {
      const memberIds = chat.members.map(m => m.user.user_id);
      const currentUser = await prisma.user.findUnique({
        where: { user_id: req.user?.user_id },
        select: { username: true }
      });

      let changeType = 'info';
      if (chat_name && oldChat.chat_name !== chat_name) {
        changeType = 'name';
      } else if (chatImagePath) {
        changeType = 'image';
      } else if (description && oldChat.description !== description) {
        changeType = 'description';
      }

      await notificationService.notifyGroupInfoChange(memberIds, {
        chat_id: parseInt(id),
        chat_name: chat.chat_name,
        change_type: changeType,
        changed_by_username: currentUser?.username || 'Admin'
      });
      } catch (pushError) {
        console.error('Failed to send group info change notifications:', pushError.message);
      }    res.json({
      message: 'Chat updated successfully',
      chat
    });

  } catch (error) {
    console.error('Update chat error:', error);
    res.status(500).json({ error: 'Failed to update chat' });
  }
};

// Get public chat info (no authentication required)
exports.getChatInfo = async (req, res) => {
  try {
    const { id } = req.params;

    const chat = await prisma.chat.findUnique({
      where: { chat_id: parseInt(id) },
      select: {
        chat_id: true,
        chat_name: true,
        chat_type: true,
        chat_image: true,
        description: true,
        created_at: true,
        _count: {
          select: { members: true }
        },
        members: {
          include: {
            user: {
              select: {
                user_id: true,
                full_name: true,
                username: true,
                profile_pic: true
              }
            }
          }
        },
        admins: {
          include: {
            user: {
              select: {
                user_id: true,
                username: true,
                full_name: true
              }
            }
          }
        }
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json({
      chat_id: chat.chat_id,
      chat_name: chat.chat_name,
      chat_type: chat.chat_type,
      chat_image: chat.chat_image,
      description: chat.description,
      created_at: chat.created_at,
      member_count: chat._count.members,
      members: chat.members.map(m => m.user),
      admins: chat.admins.map(a => a.user)
    });

  } catch (error) {
    console.error('Get public chat info error:', error);
    res.status(500).json({ error: 'Failed to get chat info' });
  }
};

// Exit group chat (current user leaves)
exports.exitGroupChat = async (req, res, io) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    if (!chatId || !userId) {
      return res.status(400).json({ error: 'chatId and user_id are required' });
    }

    const chatIdInt = parseInt(chatId);
    const userIdInt = parseInt(userId);

    // Check if chat exists
    const chat = await prisma.chat.findUnique({
      where: { chat_id: chatIdInt },
      include: { 
        members: { select: { user_id: true } },
        admins: { select: { user_id: true } }
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Can only exit group chats, not private chats
    if (chat.chat_type !== 'group') {
      return res.status(400).json({ error: 'Can only exit group chats. For private chats, use delete chat instead.' });
    }

    // Verify user is a member of the chat
    const isMember = chat.members.some(m => m.user_id === userIdInt);
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    // Get user details before removing for WebSocket notification
    const exitingUser = await prisma.user.findUnique({
      where: { user_id: userIdInt },
      select: {
        user_id: true,
        username: true,
        full_name: true,
        profile_pic: true
      }
    });

    // Remove user from ChatMember
    await prisma.chatMember.delete({
      where: {
        chat_id_user_id: {
          chat_id: chatIdInt,
          user_id: userIdInt
        }
      }
    });

    // Remove user's ChatVisibility record
    await prisma.chatVisibility.deleteMany({
      where: {
        chat_id: chatIdInt,
        user_id: userIdInt
      }
    });

    // If user was an admin, remove from GroupAdmin table too
    await prisma.groupAdmin.deleteMany({
      where: {
        chat_id: chatIdInt,
        user_id: userIdInt
      }
    });

    // Check if chat is now empty
    const remainingMembers = await prisma.chatMember.count({
      where: { chat_id: chatIdInt }
    });

    let response = {
      message: 'Successfully exited group chat',
      chat_id: chatIdInt,
      remaining_members: remainingMembers
    };

    // Emit WebSocket notification to remaining chat members
    if (io && exitingUser) {
      io.to(`chat_${chatIdInt}`).emit('member_exited', {
        chat_id: chatIdInt,
        exiting_member: {
          user_id: exitingUser.user_id,
          username: exitingUser.username,
          full_name: exitingUser.full_name,
          profile_pic: exitingUser.profile_pic
        },
        remaining_members: remainingMembers,
        timestamp: new Date(),
        message: `${exitingUser.full_name || exitingUser.username} left the group`
      });
    }

    // If chat is empty, optionally delete it
    if (remainingMembers === 0) {
      // Delete all related records
      await prisma.messageVisibility.deleteMany({
        where: {
          message: { chat_id: chatIdInt }
        }
      });

      await prisma.messageStatus.deleteMany({
        where: {
          message: { chat_id: chatIdInt }
        }
      });

      await prisma.attachment.deleteMany({
        where: {
          message: { chat_id: chatIdInt }
        }
      });

      await prisma.message.deleteMany({
        where: { chat_id: chatIdInt }
      });

      await prisma.groupAdmin.deleteMany({
        where: { chat_id: chatIdInt }
      });

      await prisma.chatVisibility.deleteMany({
        where: { chat_id: chatIdInt }
      });

      await prisma.chat.delete({
        where: { chat_id: chatIdInt }
      });
    }

    res.json(response);

  } catch (error) {
    console.error('Exit group chat error:', error);
    res.status(500).json({ error: 'Failed to exit group chat' });
  }
};

// Delete chat
exports.deleteChat = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.chat.delete({
      where: { chat_id: parseInt(id) }
    });

    res.json({ message: 'Chat deleted successfully' });

  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
};