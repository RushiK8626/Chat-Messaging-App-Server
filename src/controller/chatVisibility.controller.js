const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ========== ARCHIVE CHAT ==========
// Hide chat but keep it (can be restored)
exports.archiveChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    if (!chatId || !userId) {
      return res.status(400).json({ error: 'chatId and user_id are required' });
    }

    // Check if user is member of chat
    const isMember = await prisma.chatMember.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: userId
        }
      }
    });

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this chat' });
    }

    // ✅ Hide all messages in this chat for this user (for archive)
    const messagesInChat = await prisma.message.findMany({
      where: { chat_id: parseInt(chatId) },
      select: { message_id: true }
    });

    const messageIds = messagesInChat.map(m => m.message_id);

    if (messageIds.length > 0) {
      await prisma.messageVisibility.updateMany({
        where: {
          message_id: { in: messageIds },
          user_id: userId
        },
        data: {
          is_visible: false,
          hidden_at: new Date()
        }
      });
      console.log(`✅ Hid ${messageIds.length} messages in chat ${chatId} for user ${userId} (archive)`);
    }

    // Create or update ChatVisibility record
    const visibility = await prisma.chatVisibility.upsert({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: userId
        }
      },
      update: {
        is_visible: false,
        is_archived: true,
        archived_at: new Date()
      },
      create: {
        chat_id: parseInt(chatId),
        user_id: userId,
        is_visible: false,
        is_archived: true,
        archived_at: new Date()
      }
    });

    res.json({
      message: 'Chat archived successfully',
      chat_id: parseInt(chatId),
      status: 'archived'
    });

  } catch (err) {
    console.error('Archive chat error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ========== UNARCHIVE CHAT ==========
// Restore archived chat back to normal view
exports.unarchiveChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    if (!chatId || !userId) {
      return res.status(400).json({ error: 'chatId and user_id are required' });
    }

    const visibility = await prisma.chatVisibility.update({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: userId
        }
      },
      data: {
        is_visible: true,
        is_archived: false,
        archived_at: null
      }
    });

    // ✅ Restore message visibility when unarchiving
    // Get all messages that were hidden during archive
    const messagesInChat = await prisma.message.findMany({
      where: { chat_id: parseInt(chatId) },
      select: { message_id: true }
    });

    const messageIds = messagesInChat.map(m => m.message_id);

    if (messageIds.length > 0) {
      await prisma.messageVisibility.updateMany({
        where: {
          message_id: { in: messageIds },
          user_id: userId,
          is_visible: false  // Only restore if hidden
        },
        data: {
          is_visible: true,
          hidden_at: null
        }
      });
      console.log(`✅ Restored visibility for ${messageIds.length} messages in chat ${chatId} for user ${userId}`);
    }

    res.json({
      message: 'Chat unarchived successfully',
      chat_id: parseInt(chatId),
      status: 'active'
    });

  } catch (err) {
    console.error('Unarchive chat error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ========== DELETE CHAT (FOR USER) ==========
// Permanently delete chat for user (not for others)
exports.deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    if (!chatId || !userId) {
      return res.status(400).json({ error: 'chatId and user_id are required' });
    }

    // Check if user is member of chat
    const isMember = await prisma.chatMember.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: userId
        }
      }
    });

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this chat' });
    }

    // ✅ Hide all messages in this chat for this user
    // Get all message IDs in this chat
    const messagesInChat = await prisma.message.findMany({
      where: { chat_id: parseInt(chatId) },
      select: { message_id: true }
    });

    const messageIds = messagesInChat.map(m => m.message_id);

    // Hide all messages for this user
    if (messageIds.length > 0) {
      await prisma.messageVisibility.updateMany({
        where: {
          message_id: { in: messageIds },
          user_id: userId
        },
        data: {
          is_visible: false,
          hidden_at: new Date()
        }
      });
      console.log(`✅ Hid ${messageIds.length} messages in chat ${chatId} for user ${userId}`);
    }

    // Create or update ChatVisibility record
    const visibility = await prisma.chatVisibility.upsert({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: userId
        }
      },
      update: {
        is_visible: false,
        is_archived: false,
        hidden_at: new Date()
      },
      create: {
        chat_id: parseInt(chatId),
        user_id: userId,
        is_visible: false,
        is_archived: false,
        hidden_at: new Date()
      }
    });

    res.json({
      message: 'Chat deleted successfully',
      chat_id: parseInt(chatId),
      status: 'deleted'
    });

  } catch (err) {
    console.error('Delete chat error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ========== GET ARCHIVED CHATS ==========
// Get only archived chats for user
exports.getArchivedChats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get archived chats via ChatVisibility
    const archivedChatIds = await prisma.chatVisibility.findMany({
      where: {
        user_id: parseInt(userId),
        is_archived: true,
        is_visible: false
      },
      select: { chat_id: true }
    });

    const chatIds = archivedChatIds.map(v => v.chat_id);

    const archivedChats = await prisma.chat.findMany({
      where: {
        chat_id: { in: chatIds }
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
        messages: {
          take: 1,
          orderBy: { created_at: 'desc' },
          select: {
            message_text: true,
            created_at: true,
            sender: {
              select: { full_name: true }
            }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    const total = chatIds.length;

    res.json({
      chats: archivedChats,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    });

  } catch (err) {
    console.error('Get archived chats error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ========== GET ACTIVE CHATS (EXCLUDING ARCHIVED/DELETED) ==========
// Get only active chats for user (excluding archived and deleted)
exports.getActiveChats = async (req, res) => {
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

    // Get visible chats via ChatVisibility
    const visibleChatIds = await prisma.chatVisibility.findMany({
      where: {
        user_id: userIdInt,
        is_visible: true
      },
      select: { chat_id: true }
    });

    const chatIds = visibleChatIds.map(v => v.chat_id);

    // Get active chats
    const activeChats = await prisma.chat.findMany({
      where: {
        chat_id: { in: chatIds },
        members: {
          some: { user_id: userIdInt }
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
        messages: {
          take: 1,
          orderBy: { created_at: 'desc' },
          select: {
            message_id: true,
            message_text: true,
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
        },
        chatVisibility: {
          where: { user_id: userIdInt },
          select: {
            pinned: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    const total = chatIds.length;

    
    // Format the chat previews
    const chatPreviews = activeChats.map(chat => {
      const lastMessage = chat.messages[0];
      // console.log(chat);
      
      // Get pinned status - chatVisibility is an array due to the include
      // let isPinned = false;
      // if (chat.chatVisibility && Array.isArray(chat.chatVisibility) && chat.chatVisibility.length > 0) {
      //   isPinned = chat.chatVisibility[0].pinned || false;
      // } else if (chat.chatVisibility && !Array.isArray(chat.chatVisibility)) {
      //   isPinned = chat.chatVisibility.pinned || false;
      // }
      
      let preview = {
        chat_id: chat.chat_id,
        chat_type: chat.chat_type,
        chat_name: chat.chat_name,
        chat_image: chat.chat_image,
        created_at: chat.created_at,
        members: chat.members,
        admins: chat.admins,
        pinned: chat.chatVisibility[0].pinned,
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
        preview.last_message_timestamp = lastMessage.created_at;
      }

      return preview;
    });

    res.json({
      chats: chatPreviews,
      count: chatPreviews.length,
      total: total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });

  } catch (err) {
    console.error('Get active chats error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.pinChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    if (!chatId || !userId) {
      return res.status(400).json({ error: 'chatId and user_id are required' });
    }

    // Check if user is member of chat
    const isMember = await prisma.chatMember.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: userId
        }
      }
    });

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this chat' });
    }

    const visibility = await prisma.chatVisibility.update({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: userId
        }
      },
      data: {
        pinned: true
      }
    })

    if(visibility) {
      res.json({
        message: 'Chat Pinned successfully',
        chat_id: parseInt(chatId),
        status: 'pinned'
      });
    }
  } catch(err) {
    console.error('Chat Pinning error:', err);
    res.status(500).json({ error: err.message });
  }
}

exports.unpinChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    if (!chatId || !userId) {
      return res.status(400).json({ error: 'chatId and user_id are required' });
    }

    // Check if user is member of chat
    const isMember = await prisma.chatMember.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: userId
        }
      }
    });

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this chat' });
    }

    const visibility = await prisma.chatVisibility.update({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: userId
        }
      },
      data: {
        pinned: false
      }
    })

    if(visibility) {
      res.json({
        message: 'Chat Unpinned successfully',
        chat_id: parseInt(chatId),
        status: 'pinned'
      });
    }
  } catch(err) {
    console.error('Chat Unpinning error:', err);
    res.status(500).json({ error: err.message });
  } 
}

// ========== GET CHAT STATUS FOR USER ==========
// Check if chat is archived, deleted, or active for user
exports.getChatStatus = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    const visibility = await prisma.chatVisibility.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chatId),
          user_id: userId
        }
      }
    });

    if (!visibility) {
      // Default to active if no record exists
      return res.json({
        chat_id: parseInt(chatId),
        user_id: userId,
        status: 'active',
        is_visible: true,
        is_archived: false
      });
    }

    let status = 'active';
    if (!visibility.is_visible && visibility.is_archived) {
      status = 'archived';
    } else if (!visibility.is_visible && !visibility.is_archived) {
      status = 'deleted';
    }

    res.json({
      chat_id: parseInt(chatId),
      user_id: userId,
      status,
      is_visible: visibility.is_visible,
      is_archived: visibility.is_archived,
      archived_at: visibility.archived_at,
      hidden_at: visibility.hidden_at
    });

  } catch (err) {
    console.error('Get chat status error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ========== BATCH DELETE CHATS ==========
// Delete multiple chats for user at once
exports.batchDeleteChats = async (req, res) => {
  try {
    const { chatIds } = req.body;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
      return res.status(400).json({ error: 'chatIds array is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const parsedChatIds = chatIds.map(id => parseInt(id));

    // Verify user is member of all chats
    const memberShips = await prisma.chatMember.findMany({
      where: {
        chat_id: { in: parsedChatIds },
        user_id: userId
      }
    });

    if (memberShips.length !== parsedChatIds.length) {
      return res.status(403).json({ 
        error: 'Not a member of all specified chats' 
      });
    }

    // Get all message IDs in these chats
    const messagesInChats = await prisma.message.findMany({
      where: { chat_id: { in: parsedChatIds } },
      select: { message_id: true }
    });

    const messageIds = messagesInChats.map(m => m.message_id);

    // Hide all messages for this user (batch update)
    if (messageIds.length > 0) {
      await prisma.messageVisibility.updateMany({
        where: {
          message_id: { in: messageIds },
          user_id: userId
        },
        data: {
          is_visible: false,
          hidden_at: new Date()
        }
      });
      console.log(`✅ Hid ${messageIds.length} messages in ${parsedChatIds.length} chats for user ${userId}`);
    }

    // Update or create ChatVisibility records for all chats
    const visibilityUpdates = await Promise.all(
      parsedChatIds.map(chatId =>
        prisma.chatVisibility.upsert({
          where: {
            chat_id_user_id: {
              chat_id: chatId,
              user_id: userId
            }
          },
          update: {
            is_visible: false,
            is_archived: false,
            hidden_at: new Date()
          },
          create: {
            chat_id: chatId,
            user_id: userId,
            is_visible: false,
            is_archived: false,
            hidden_at: new Date()
          }
        })
      )
    );

    res.json({
      message: `${parsedChatIds.length} chats deleted successfully`,
      deleted_count: visibilityUpdates.length,
      chat_ids: parsedChatIds
    });

  } catch (err) {
    console.error('Batch delete chats error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ========== BATCH PIN CHATS ==========
// Pin multiple chats for user at once
exports.batchPinChats = async (req, res) => {
  try {
    const { chatIds } = req.body;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
      return res.status(400).json({ error: 'chatIds array is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const parsedChatIds = chatIds.map(id => parseInt(id));

    // Verify user is member of all chats
    const memberShips = await prisma.chatMember.findMany({
      where: {
        chat_id: { in: parsedChatIds },
        user_id: userId
      }
    });

    if (memberShips.length !== parsedChatIds.length) {
      return res.status(403).json({ 
        error: 'Not a member of all specified chats' 
      });
    }

    // Update or create ChatVisibility records with pinned = true
    const pinUpdates = await Promise.all(
      parsedChatIds.map(chatId =>
        prisma.chatVisibility.upsert({
          where: {
            chat_id_user_id: {
              chat_id: chatId,
              user_id: userId
            }
          },
          update: {
            pinned: true
          },
          create: {
            chat_id: chatId,
            user_id: userId,
            pinned: true,
            is_visible: true
          }
        })
      )
    );

    res.json({
      message: `${parsedChatIds.length} chats pinned successfully`,
      pinned_count: pinUpdates.length,
      chat_ids: parsedChatIds
    });

  } catch (err) {
    console.error('Batch pin chats error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ========== BATCH MARK READ CHATS ==========
// Mark all messages as read in multiple chats
exports.batchMarkReadChats = async (req, res) => {
  try {
    const { chatIds } = req.body;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
      return res.status(400).json({ error: 'chatIds array is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const parsedChatIds = chatIds.map(id => parseInt(id));

    // Verify user is member of all chats
    const memberShips = await prisma.chatMember.findMany({
      where: {
        chat_id: { in: parsedChatIds },
        user_id: userId
      }
    });

    if (memberShips.length !== parsedChatIds.length) {
      return res.status(403).json({ 
        error: 'Not a member of all specified chats' 
      });
    }

    // Get all message IDs in these chats
    const messages = await prisma.message.findMany({
      where: { 
        chat_id: { in: parsedChatIds }
      },
      select: { message_id: true }
    });

    const messageIds = messages.map(msg => msg.message_id);

    if (messageIds.length === 0) {
      return res.json({
        message: 'No messages found in specified chats',
        marked_count: 0,
        chat_ids: parsedChatIds
      });
    }

    // Update status for all messages to 'read'
    const result = await prisma.messageStatus.updateMany({
      where: {
        message_id: { in: messageIds },
        user_id: userId,
        status: { not: 'read' } // Only update unread messages
      },
      data: {
        status: 'read',
        updated_at: new Date()
      }
    });

    console.log(`✅ Marked ${result.count} messages as read in ${parsedChatIds.length} chats for user ${userId}`);

    res.json({
      message: `Marked ${result.count} messages as read in ${parsedChatIds.length} chats`,
      marked_count: result.count,
      chat_ids: parsedChatIds
    });

  } catch (err) {
    console.error('Batch mark read chats error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ========== BATCH UNPIN CHATS ==========
// Unpin multiple chats for user at once
exports.batchUnpinChats = async (req, res) => {
  try {
    const { chatIds } = req.body;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
      return res.status(400).json({ error: 'chatIds array is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const parsedChatIds = chatIds.map(id => parseInt(id));

    // Verify user is member of all chats
    const memberShips = await prisma.chatMember.findMany({
      where: {
        chat_id: { in: parsedChatIds },
        user_id: userId
      }
    });

    if (memberShips.length !== parsedChatIds.length) {
      return res.status(403).json({ 
        error: 'Not a member of all specified chats' 
      });
    }

    // Update ChatVisibility records with pinned = false
    const unpinUpdates = await Promise.all(
      parsedChatIds.map(chatId =>
        prisma.chatVisibility.update({
          where: {
            chat_id_user_id: {
              chat_id: chatId,
              user_id: userId
            }
          },
          data: {
            pinned: false
          }
        })
      )
    );

    res.json({
      message: `${parsedChatIds.length} chats unpinned successfully`,
      unpinned_count: unpinUpdates.length,
      chat_ids: parsedChatIds
    });

  } catch (err) {
    console.error('Batch unpin chats error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ========== BATCH ARCHIVE CHATS ==========
// Archive multiple chats for user at once
exports.batchArchiveChats = async (req, res) => {
  try {
    const { chatIds } = req.body;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
      return res.status(400).json({ error: 'chatIds array is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const parsedChatIds = chatIds.map(id => parseInt(id));

    // Verify user is member of all chats
    const memberShips = await prisma.chatMember.findMany({
      where: {
        chat_id: { in: parsedChatIds },
        user_id: userId
      }
    });

    if (memberShips.length !== parsedChatIds.length) {
      return res.status(403).json({ 
        error: 'Not a member of all specified chats' 
      });
    }

    // Get all message IDs in these chats
    const messagesInChats = await prisma.message.findMany({
      where: { chat_id: { in: parsedChatIds } },
      select: { message_id: true }
    });

    const messageIds = messagesInChats.map(m => m.message_id);

    // Hide all messages for this user (batch update)
    if (messageIds.length > 0) {
      await prisma.messageVisibility.updateMany({
        where: {
          message_id: { in: messageIds },
          user_id: userId
        },
        data: {
          is_visible: false,
          hidden_at: new Date()
        }
      });
      console.log(`✅ Hid ${messageIds.length} messages in ${parsedChatIds.length} chats for user ${userId} (archive)`);
    }

    // Update or create ChatVisibility records
    const archiveUpdates = await Promise.all(
      parsedChatIds.map(chatId =>
        prisma.chatVisibility.upsert({
          where: {
            chat_id_user_id: {
              chat_id: chatId,
              user_id: userId
            }
          },
          update: {
            is_visible: false,
            is_archived: true,
            archived_at: new Date()
          },
          create: {
            chat_id: chatId,
            user_id: userId,
            is_visible: false,
            is_archived: true,
            archived_at: new Date()
          }
        })
      )
    );

    res.json({
      message: `${parsedChatIds.length} chats archived successfully`,
      archived_count: archiveUpdates.length,
      chat_ids: parsedChatIds
    });

  } catch (err) {
    console.error('Batch archive chats error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ========== BATCH UNARCHIVE CHATS ==========
// Unarchive multiple chats for user at once
exports.batchUnarchiveChats = async (req, res) => {
  try {
    const { chatIds } = req.body;
    const userId = req.user?.user_id || parseInt(req.body.user_id);

    if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
      return res.status(400).json({ error: 'chatIds array is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const parsedChatIds = chatIds.map(id => parseInt(id));

    // Verify user is member of all chats
    const memberShips = await prisma.chatMember.findMany({
      where: {
        chat_id: { in: parsedChatIds },
        user_id: userId
      }
    });

    if (memberShips.length !== parsedChatIds.length) {
      return res.status(403).json({ 
        error: 'Not a member of all specified chats' 
      });
    }

    // Get all message IDs in these chats
    const messagesInChats = await prisma.message.findMany({
      where: { chat_id: { in: parsedChatIds } },
      select: { message_id: true }
    });

    const messageIds = messagesInChats.map(m => m.message_id);

    // Restore message visibility for this user
    if (messageIds.length > 0) {
      await prisma.messageVisibility.updateMany({
        where: {
          message_id: { in: messageIds },
          user_id: userId,
          is_visible: false
        },
        data: {
          is_visible: true,
          hidden_at: null
        }
      });
      console.log(`✅ Restored visibility for ${messageIds.length} messages in ${parsedChatIds.length} chats for user ${userId}`);
    }

    // Update ChatVisibility records
    const unarchiveUpdates = await Promise.all(
      parsedChatIds.map(chatId =>
        prisma.chatVisibility.update({
          where: {
            chat_id_user_id: {
              chat_id: chatId,
              user_id: userId
            }
          },
          data: {
            is_visible: true,
            is_archived: false,
            archived_at: null
          }
        })
      )
    );

    res.json({
      message: `${parsedChatIds.length} chats unarchived successfully`,
      unarchived_count: unarchiveUpdates.length,
      chat_ids: parsedChatIds
    });

  } catch (err) {
    console.error('Batch unarchive chats error:', err);
    res.status(500).json({ error: err.message });
  }
};
