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
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create a new chat (private or group)
exports.createChat = async (req, res) => {
  try {
    const { chat_type, chat_name, member_ids, admin_id } = req.body;

    // Validation
    if (!chat_type || !['private', 'group'].includes(chat_type)) {
      return res.status(400).json({ error: 'Invalid chat type. Must be "private" or "group"' });
    }

    if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
      return res.status(400).json({ error: 'member_ids array is required' });
    }

    // Private chat must have exactly 2 members
    if (chat_type === 'private' && member_ids.length !== 2) {
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
    if (chat_type === 'group' && !member_ids.includes(admin_id)) {
      return res.status(400).json({ error: 'Admin must be a member of the group' });
    }

    // Verify all members exist
    const users = await prisma.user.findMany({
      where: { user_id: { in: member_ids } }
    });

    if (users.length !== member_ids.length) {
      return res.status(404).json({ error: 'One or more users not found' });
    }

    // For private chats, check if chat already exists using private_chat_key
    let privateChatKey = null;
    if (chat_type === 'private') {
      // Generate private_chat_key from sorted user IDs
      const sortedIds = [...member_ids].sort((a, b) => a - b);
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

    // Create chat with members
    const chat = await prisma.chat.create({
      data: {
        chat_type,
        chat_name: chat_type === 'group' ? chat_name : null,
        private_chat_key: privateChatKey,
        members: {
          create: member_ids.map(user_id => ({
            user_id,
            joined_at: new Date()
          }))
        },
        ...(chat_type === 'group' && admin_id && {
          admins: {
            create: {
              user_id: admin_id
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

    res.status(201).json({
      message: 'Chat created successfully',
      chat
    });

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
            }
          }
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

    const chats = await prisma.chat.findMany({
      where: {
        members: {
          some: {
            user_id: parseInt(userId)
          }
        }
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

    const chats = await prisma.chat.findMany({
      where: {
        members: {
          some: {
            user_id: parseInt(userId)
          }
        }
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
        last_message: null
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
              previewText = '📷 Image';
            } else if (fileType.startsWith('video/')) {
              previewText = '🎥 Video';
            } else if (fileType.startsWith('audio/')) {
              previewText = '🎵 Audio';
            } else if (fileType.includes('pdf')) {
              previewText = '📄 PDF';
            } else if (fileType.includes('word') || fileType.includes('document')) {
              previewText = '📝 Document';
            } else if (fileType.includes('excel') || fileType.includes('sheet')) {
              previewText = '📊 Spreadsheet';
            } else if (fileType.includes('zip') || fileType.includes('rar')) {
              previewText = '📦 Archive';
            } else {
              previewText = '📎 Attachment';
            }
          } else {
            previewText = '📎 File';
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
      }

      return preview;
    });

    // Get total count for pagination
    const totalCount = await prisma.chat.count({
      where: {
        members: {
          some: {
            user_id: parseInt(userId)
          }
        }
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
exports.addChatMember = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Check if chat exists and is a group
    const chat = await prisma.chat.findUnique({
      where: { chat_id: parseInt(chatId) }
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

    // Add member
    const member = await prisma.chatMember.create({
      data: {
        chat_id: parseInt(chatId),
        user_id: parseInt(user_id),
        joined_at: new Date()
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

    res.status(201).json({
      message: 'Member added successfully',
      member
    });

  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

// Remove member from chat
exports.removeChatMember = async (req, res) => {
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

    // Remove member
    await prisma.chatMember.delete({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: parseInt(userId)
        }
      }
    });

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
    const { chat_name } = req.body;

    const chat = await prisma.chat.update({
      where: { chat_id: parseInt(id) },
      data: {
        ...(chat_name && { chat_name })
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

    res.json({
      message: 'Chat updated successfully',
      chat
    });

  } catch (error) {
    console.error('Update chat error:', error);
    res.status(500).json({ error: 'Failed to update chat' });
  }
};

// Get public chat info (no authentication required)
exports.getPublicChatInfo = async (req, res) => {
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
        }
      }
    });

    // Debug: print fetched chat object for troubleshooting
    console.log('Get public chat info - raw result:', chat);
    try {
      console.log('Get public chat info - JSON:', JSON.stringify(chat, null, 2));
    } catch (err) {
      console.log('Get public chat info - JSON stringify failed:', err);
      console.dir(chat, { depth: null });
    }

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
      member_count: chat._count.members
    });

  } catch (error) {
    console.error('Get public chat info error:', error);
    res.status(500).json({ error: 'Failed to get chat info' });
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