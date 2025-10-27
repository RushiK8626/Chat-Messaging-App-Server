const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

// Upload file and create message with attachment
exports.uploadFileAndCreateMessage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { chat_id, sender_id, message_text } = req.body;

    // Verify sender is a member of the chat
    const chatMember = await prisma.chatMember.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chat_id),
          user_id: parseInt(sender_id)
        }
      }
    });

    if (!chatMember) {
      // Delete uploaded file if user is not authorized
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'User is not a member of this chat' });
    }

    // Determine message type based on file type
    let messageType = 'file';
    if (req.file.mimetype.startsWith('image/')) {
      messageType = 'image';
    } else if (req.file.mimetype.startsWith('video/')) {
      messageType = 'video';
    } else if (req.file.mimetype.startsWith('audio/')) {
      messageType = 'audio';
    } else if (req.file.mimetype.includes('pdf')) {
      messageType = 'document';
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        chat_id: parseInt(chat_id),
        sender_id: parseInt(sender_id),
        message_text: message_text || req.file.originalname,
        message_type: messageType
      }
    });

    // Create attachment record
    const fileUrl = `/uploads/${req.file.filename}`;
    const attachment = await prisma.attachment.create({
      data: {
        message_id: message.message_id,
        file_url: fileUrl,
        file_type: req.file.mimetype,
        file_size: req.file.size
      }
    });

    // Create message status for all chat members
    const chatMembers = await prisma.chatMember.findMany({
      where: { chat_id: parseInt(chat_id) },
      select: { user_id: true }
    });

    const statusData = chatMembers.map(member => ({
      message_id: message.message_id,
      user_id: member.user_id,
      status: member.user_id === parseInt(sender_id) ? 'sent' : 'delivered'
    }));

    await prisma.messageStatus.createMany({
      data: statusData
    });

    // Fetch complete message with relations
    const completeMessage = await prisma.message.findUnique({
      where: { message_id: message.message_id },
      include: {
        sender: {
          select: {
            user_id: true,
            username: true,
            full_name: true,
            profile_pic: true
          }
        },
        chat: {
          select: {
            chat_id: true,
            chat_name: true,
            chat_type: true
          }
        },
        attachments: true
      }
    });

    res.status(201).json(completeMessage);
  } catch (err) {
    // Delete uploaded file if there's an error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    }
    res.status(500).json({ error: err.message });
  }
};

// Create a new message
exports.createMessage = async (req, res) => {
  try {
    const { chat_id, sender_id, message_text, message_type = "text" } = req.body;

    // Verify sender is a member of the chat
    const chatMember = await prisma.chatMember.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chat_id),
          user_id: parseInt(sender_id)
        }
      }
    });

    if (!chatMember) {
      return res.status(403).json({ error: 'User is not a member of this chat' });
    }

    const message = await prisma.message.create({
      data: {
        chat_id: parseInt(chat_id),
        sender_id: parseInt(sender_id),
        message_text,
        message_type
      },
      include: {
        sender: {
          select: {
            user_id: true,
            username: true,
            full_name: true,
            profile_pic: true
          }
        },
        chat: {
          select: {
            chat_id: true,
            chat_name: true,
            chat_type: true
          }
        }
      }
    });

    // Create message status for all chat members
    const chatMembers = await prisma.chatMember.findMany({
      where: { chat_id: parseInt(chat_id) },
      select: { user_id: true }
    });

    const statusData = chatMembers.map(member => ({
      message_id: message.message_id,
      user_id: member.user_id,
      status: member.user_id === parseInt(sender_id) ? 'sent' : 'delivered'
    }));

    await prisma.messageStatus.createMany({
      data: statusData
    });

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get message by ID
exports.getMessageById = async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const message = await prisma.message.findUnique({
      where: { message_id: messageId },
      include: {
        sender: {
          select: {
            user_id: true,
            username: true,
            full_name: true,
            profile_pic: true
          }
        },
        chat: {
          select: {
            chat_id: true,
            chat_name: true,
            chat_type: true
          }
        },
        status: {
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
        attachments: true
      }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update message
exports.updateMessage = async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const { message_text } = req.body;
    const senderId = parseInt(req.body.sender_id);

    // Verify the message belongs to the sender
    const existingMessage = await prisma.message.findUnique({
      where: { message_id: messageId }
    });

    if (!existingMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (existingMessage.sender_id !== senderId) {
      return res.status(403).json({ error: 'You can only edit your own messages' });
    }

    const updatedMessage = await prisma.message.update({
      where: { message_id: messageId },
      data: { message_text },
      include: {
        sender: {
          select: {
            user_id: true,
            username: true,
            full_name: true,
            profile_pic: true
          }
        }
      }
    });

    res.json(updatedMessage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete message
exports.deleteMessage = async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const senderId = parseInt(req.body.sender_id);

    // Verify the message belongs to the sender
    const existingMessage = await prisma.message.findUnique({
      where: { message_id: messageId }
    });

    if (!existingMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (existingMessage.sender_id !== senderId) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }

    // Delete related records first
    await prisma.messageStatus.deleteMany({
      where: { message_id: messageId }
    });

    await prisma.attachment.deleteMany({
      where: { message_id: messageId }
    });

    await prisma.message.delete({
      where: { message_id: messageId }
    });

    res.json({ message: 'Message deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get messages by chat ID with pagination
exports.getMessagesByChat = async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Verify user is a member of the chat
    const userId = parseInt(req.query.userId);
    if (userId) {
      const chatMember = await prisma.chatMember.findUnique({
        where: {
          chat_id_user_id: {
            chat_id: chatId,
            user_id: userId
          }
        }
      });

      if (!chatMember) {
        return res.status(403).json({ error: 'User is not a member of this chat' });
      }
    }

    const [messages, totalCount] = await Promise.all([
      prisma.message.findMany({
        where: { chat_id: chatId },
        include: {
          sender: {
            select: {
              user_id: true,
              username: true,
              full_name: true,
              profile_pic: true
            }
          },
          status: userId ? {
            where: { user_id: userId }
          } : true,
          attachments: {
            select: {
              attachment_id: true,
              file_url: true,
              file_type: true,
              file_size: true
            }
          }
        },
        orderBy: { created_at: 'desc' },
        skip: skip,
        take: limit
      }),
      prisma.message.count({ where: { chat_id: chatId } })
    ]);

    res.json({
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalMessages: totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get messages by sender
exports.getMessagesBySender = async (req, res) => {
  try {
    const senderId = parseInt(req.params.senderId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const messages = await prisma.message.findMany({
      where: { sender_id: senderId },
      include: {
        chat: {
          select: {
            chat_id: true,
            chat_name: true,
            chat_type: true
          }
        },
        attachments: {
          select: {
            attachment_id: true,
            file_url: true,
            file_type: true
          }
        }
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

// Get recent messages for user (across all chats)
exports.getRecentMessages = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit) || 20;

    // Get user's chats first
    const userChats = await prisma.chatMember.findMany({
      where: { user_id: userId },
      select: { chat_id: true }
    });

    const chatIds = userChats.map(chat => chat.chat_id);

    const messages = await prisma.message.findMany({
      where: {
        chat_id: { in: chatIds }
      },
      include: {
        sender: {
          select: {
            user_id: true,
            username: true,
            full_name: true,
            profile_pic: true
          }
        },
        chat: {
          select: {
            chat_id: true,
            chat_name: true,
            chat_type: true
          }
        }
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get messages by type
exports.getMessagesByType = async (req, res) => {
  try {
    const { messageType } = req.params;
    const chatId = req.query.chatId ? parseInt(req.query.chatId) : undefined;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const whereClause = {
      message_type: messageType
    };

    if (chatId) {
      whereClause.chat_id = chatId;
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      include: {
        sender: {
          select: {
            user_id: true,
            username: true,
            full_name: true,
            profile_pic: true
          }
        },
        chat: {
          select: {
            chat_id: true,
            chat_name: true,
            chat_type: true
          }
        },
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

// Update message status (delivered, read)
exports.updateMessageStatus = async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    const userId = parseInt(req.params.userId);
    const { status } = req.body;

    if (!['sent', 'delivered', 'read'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be sent, delivered, or read' });
    }

    const messageStatus = await prisma.messageStatus.upsert({
      where: {
        message_id_user_id: {
          message_id: messageId,
          user_id: userId
        }
      },
      update: {
        status: status,
        updated_at: new Date()
      },
      create: {
        message_id: messageId,
        user_id: userId,
        status: status
      }
    });

    res.json(messageStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Mark message as read
exports.markMessageAsRead = async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    const userId = parseInt(req.params.userId);

    await prisma.messageStatus.upsert({
      where: {
        message_id_user_id: {
          message_id: messageId,
          user_id: userId
        }
      },
      update: {
        status: 'read',
        updated_at: new Date()
      },
      create: {
        message_id: messageId,
        user_id: userId,
        status: 'read'
      }
    });

    res.json({ message: 'Message marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Mark all messages in chat as read
exports.markAllMessagesAsRead = async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const userId = parseInt(req.params.userId);

    // Get all messages in the chat
    const messages = await prisma.message.findMany({
      where: { chat_id: chatId },
      select: { message_id: true }
    });

    const messageIds = messages.map(msg => msg.message_id);

    // Update status for all messages
    await prisma.messageStatus.updateMany({
      where: {
        message_id: { in: messageIds },
        user_id: userId
      },
      data: {
        status: 'read',
        updated_at: new Date()
      }
    });

    res.json({ message: `Marked ${messageIds.length} messages as read` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get message status for specific message
exports.getMessageStatus = async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);

    const messageStatus = await prisma.messageStatus.findMany({
      where: { message_id: messageId },
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

    res.json(messageStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get unread message count for user
exports.getUnreadMessageCount = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const chatId = req.query.chatId ? parseInt(req.query.chatId) : undefined;

    let whereClause = {
      user_id: userId,
      status: { not: 'read' }
    };

    if (chatId) {
      // Get messages for specific chat
      const messages = await prisma.message.findMany({
        where: { chat_id: chatId },
        select: { message_id: true }
      });
      const messageIds = messages.map(msg => msg.message_id);
      whereClause.message_id = { in: messageIds };
    }

    const unreadCount = await prisma.messageStatus.count({
      where: whereClause
    });

    res.json({ unreadCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add attachment to message
exports.addMessageAttachment = async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    const { file_url, file_type, file_size } = req.body;

    // Verify message exists
    const message = await prisma.message.findUnique({
      where: { message_id: messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const attachment = await prisma.attachment.create({
      data: {
        message_id: messageId,
        file_url,
        file_type,
        file_size: file_size ? parseInt(file_size) : null
      }
    });

    res.status(201).json(attachment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get message attachments
exports.getMessageAttachments = async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);

    const attachments = await prisma.attachment.findMany({
      where: { message_id: messageId },
      orderBy: { uploaded_at: 'asc' }
    });

    res.json(attachments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete attachment
exports.deleteAttachment = async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);

    // Verify attachment exists
    const attachment = await prisma.attachment.findUnique({
      where: { attachment_id: attachmentId }
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    await prisma.attachment.delete({
      where: { attachment_id: attachmentId }
    });

    res.json({ message: 'Attachment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get attachments by chat
exports.getAttachmentsByChat = async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const fileType = req.query.fileType;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let whereClause = {
      message: {
        chat_id: chatId
      }
    };

    if (fileType) {
      whereClause.file_type = fileType;
    }

    const attachments = await prisma.attachment.findMany({
      where: whereClause,
      include: {
        message: {
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
      orderBy: { uploaded_at: 'desc' },
      skip: skip,
      take: limit
    });

    res.json(attachments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Search messages by text content
exports.searchMessages = async (req, res) => {
  try {
    const { query } = req.query;
    const chatId = req.query.chatId ? parseInt(req.query.chatId) : undefined;
    const userId = req.query.userId ? parseInt(req.query.userId) : undefined;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    let whereClause = {
      message_text: {
        contains: query,
        mode: 'insensitive'
      }
    };

    if (chatId) {
      whereClause.chat_id = chatId;
    }

    if (userId) {
      // Only search in chats where user is a member
      const userChats = await prisma.chatMember.findMany({
        where: { user_id: userId },
        select: { chat_id: true }
      });
      const chatIds = userChats.map(chat => chat.chat_id);
      whereClause.chat_id = { in: chatIds };
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      include: {
        sender: {
          select: {
            user_id: true,
            username: true,
            full_name: true,
            profile_pic: true
          }
        },
        chat: {
          select: {
            chat_id: true,
            chat_name: true,
            chat_type: true
          }
        }
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

// Get message statistics for a chat
exports.getChatMessageStats = async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);

    const [totalMessages, messagesByType, messagesByUser, attachmentCount] = await Promise.all([
      prisma.message.count({ where: { chat_id: chatId } }),
      
      prisma.message.groupBy({
        by: ['message_type'],
        where: { chat_id: chatId },
        _count: { message_type: true }
      }),
      
      prisma.message.groupBy({
        by: ['sender_id'],
        where: { chat_id: chatId },
        _count: { sender_id: true },
        orderBy: { _count: { sender_id: 'desc' } }
      }),
      
      prisma.attachment.count({
        where: {
          message: { chat_id: chatId }
        }
      })
    ]);

    // Get user details for message count by user
    const userIds = messagesByUser.map(item => item.sender_id);
    const users = await prisma.user.findMany({
      where: { user_id: { in: userIds } },
      select: {
        user_id: true,
        username: true,
        full_name: true
      }
    });

    const messagesByUserWithDetails = messagesByUser.map(item => ({
      ...item,
      user: users.find(user => user.user_id === item.sender_id)
    }));

    res.json({
      totalMessages,
      messagesByType,
      messagesByUser: messagesByUserWithDetails,
      attachmentCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Bulk delete messages
exports.bulkDeleteMessages = async (req, res) => {
  try {
    const { messageIds, senderId } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'Message IDs array is required' });
    }

    // Verify all messages belong to the sender
    const messages = await prisma.message.findMany({
      where: {
        message_id: { in: messageIds.map(id => parseInt(id)) },
        sender_id: parseInt(senderId)
      }
    });

    if (messages.length !== messageIds.length) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }

    // Delete related records first
    await prisma.messageStatus.deleteMany({
      where: { message_id: { in: messageIds.map(id => parseInt(id)) } }
    });

    await prisma.attachment.deleteMany({
      where: { message_id: { in: messageIds.map(id => parseInt(id)) } }
    });

    await prisma.message.deleteMany({
      where: { message_id: { in: messageIds.map(id => parseInt(id)) } }
    });

    res.json({ message: `Successfully deleted ${messageIds.length} messages` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get messages with date range filter
exports.getMessagesByDateRange = async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const { startDate, endDate } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const messages = await prisma.message.findMany({
      where: {
        chat_id: chatId,
        created_at: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      },
      include: {
        sender: {
          select: {
            user_id: true,
            username: true,
            full_name: true,
            profile_pic: true
          }
        },
        attachments: {
          select: {
            attachment_id: true,
            file_url: true,
            file_type: true
          }
        }
      },
      orderBy: { created_at: 'asc' },
      skip: skip,
      take: limit
    });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get message delivery statistics
exports.getMessageDeliveryStats = async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);

    const deliveryStats = await prisma.messageStatus.groupBy({
      by: ['status'],
      where: { message_id: messageId },
      _count: { status: true }
    });

    const totalRecipients = await prisma.messageStatus.count({
      where: { message_id: messageId }
    });

    res.json({
      messageId,
      totalRecipients,
      deliveryStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
