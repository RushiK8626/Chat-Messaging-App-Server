const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
const cacheService = require('../services/cache.service');
const { emitFileMessage } = require('../socket/socketHandler');

// ========== ESSENTIAL MESSAGE FUNCTIONS ONLY ==========
// Most message operations are handled via Socket.IO

// Create a text message (without file attachment)
exports.createMessage = async (req, res) => {
  try {
    const { chat_id, sender_id, message_text, message_type = 'text' } = req.body;

    // Validation
    if (!chat_id || !sender_id) {
      return res.status(400).json({ error: 'chat_id and sender_id are required' });
    }

    if (!message_text || message_text.trim() === '') {
      return res.status(400).json({ error: 'message_text is required and cannot be empty' });
    }

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

    // Create message
    const message = await prisma.message.create({
      data: {
        chat_id: parseInt(chat_id),
        sender_id: parseInt(sender_id),
        message_text: message_text.trim(),
        message_type: message_type
      }
    });

    // Auto-restore deleted chat when new message arrives
    await prisma.chatVisibility.updateMany({
      where: {
        chat_id: parseInt(chat_id),
        is_visible: false,
        is_archived: false  // Only restore if deleted, not archived
      },
      data: {
        is_visible: true,
        hidden_at: null
      }
    });

    // Create message status and visibility for all chat members
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

    // Create message visibility for all members (default: visible)
    const visibilityData = chatMembers.map(member => ({
      message_id: message.message_id,
      user_id: member.user_id,
      is_visible: true
    }));

    await prisma.messageVisibility.createMany({
      data: visibilityData
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
        status: {
          select: {
            user_id: true,
            status: true,
            updated_at: true
          }
        }
      }
    });

    res.status(201).json({
      message: 'Message sent successfully',
      data: completeMessage
    });

  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

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

    // Auto-restore deleted chat when new message arrives
    await prisma.chatVisibility.updateMany({
      where: {
        chat_id: parseInt(chat_id),
        is_visible: false,
        is_archived: false  // Only restore if deleted, not archived
      },
      data: {
        is_visible: true,
        hidden_at: null
      }
    });

    // Create attachment record
    const fileUrl = `/uploads/${req.file.filename}`;
    const attachment = await prisma.attachment.create({
      data: {
        message_id: message.message_id,
        file_url: fileUrl,
        original_filename: req.file.originalname,
        file_type: req.file.mimetype,
        file_size: req.file.size
      }
    });

    // Create message status and visibility for all chat members
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

    // Create message visibility for all members (default: visible)
    const visibilityData = chatMembers.map(member => ({
      message_id: message.message_id,
      user_id: member.user_id,
      is_visible: true
    }));

    await prisma.messageVisibility.createMany({
      data: visibilityData
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

    // Emit to chat room via Socket.IO for real-time delivery
    emitFileMessage(chat_id, completeMessage);

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

// Get messages by chat ID with pagination
// Get recent messages (cache-first strategy) - FAST
exports.getRecentMessages = async (req, res) => {
  try {
    console.log('req.params:', req.params);
    console.log('req.query:', req.query);
    
    const chatId = parseInt(req.params.chatId);
    const userId = parseInt(req.query.userId);
    const limit = parseInt(req.query.limit) || 50;

    console.log('Parsed values - chatId:', chatId, 'userId:', userId, 'limit:', limit);

    // Validate chatId
    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat_id', params: req.params });
    }

    // Validate userId
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user_id' });
    }

    // Verify user is a member of the chat
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

    // Try cache first, fallback to database
    const messages = await cacheService.getMessages(chatId, userId, limit);

    res.json({
      messages: messages.reverse(), // Oldest first
      count: messages.length,
      cached: true,
      limit
    });

  } catch (error) {
    console.error('Get recent messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

// Get messages with pagination (database query) - For older messages
exports.getMessagesByChat = async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const userId = parseInt(req.query.userId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Validate chatId
    if (isNaN(chatId)) {
      return res.status(400).json({ error: 'Invalid chat_id' });
    }

    // Validate userId
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user_id' });
    }

    // Verify user is a member of the chat
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

    const [messages, totalCount] = await Promise.all([
      prisma.message.findMany({
        where: { 
          chat_id: chatId,
          visibility: {
            some: {
              user_id: userId,
              is_visible: true
            }
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
          status: true,
          attachments: {
            select: {
              attachment_id: true,
              file_url: true,
              original_filename: true,
              file_type: true,
              file_size: true
            }
          },
          visibility: {
            select: {
              user_id: true,
              is_visible: true,
              hidden_at: true
            }
          },
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

// Delete message
exports.deleteMessageForAll = async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = parseInt(req.body.user_id || req.user.user_id);

    // Verify the message exists
    const existingMessage = await prisma.message.findUnique({
      where: { message_id: messageId },
      include: {
        attachments: true
      }
    });

    if (!existingMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is sender or group admin
    const isSender = existingMessage.sender_id === userId;
    
    // Check if user is admin of the chat
    const isAdmin = await prisma.groupAdmin.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: existingMessage.chat_id,
          user_id: userId
        }
      }
    });

    // Allow if sender OR admin
    if (!isSender && !isAdmin) {
      return res.status(403).json({ 
        error: 'Only message sender or group admin can delete this message for all' 
      });
    }

    // Delete file attachments from disk
    if (existingMessage.attachments && existingMessage.attachments.length > 0) {
      existingMessage.attachments.forEach(attachment => {
        const filePath = path.join(__dirname, '../../', attachment.file_url);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (err) {
            console.error('Error deleting file:', err);
          }
        }
      });
    }

    // Delete related records (in correct order)
    await prisma.messageVisibility.deleteMany({
      where: { message_id: messageId }
    });

    await prisma.messageStatus.deleteMany({
      where: { message_id: messageId }
    });

    await prisma.attachment.deleteMany({
      where: { message_id: messageId }
    });

    await prisma.message.delete({
      where: { message_id: messageId }
    });

    res.json({ 
      message: 'Message deleted successfully for all members',
      messageId,
      deletedBy: isSender ? 'sender' : 'admin'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteMessageForUser = async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const userId = parseInt(req.body.user_id || req.user.user_id);

    // Validate inputs
    if (isNaN(messageId) || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid message_id or user_id' });
    }

    // Verify message exists
    const message = await prisma.message.findUnique({
      where: { message_id: messageId },
      select: { 
        message_id: true,
        chat_id: true,
        sender_id: true
      }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is a member of the chat where message was sent
    const isUserInChat = await prisma.chatMember.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: message.chat_id,
          user_id: userId
        }
      }
    });

    if (!isUserInChat) {
      return res.status(403).json({ error: 'User is not a member of this chat' });
    }

    // Update message visibility for this user to false
    const updatedVisibility = await prisma.messageVisibility.update({
      where: {
        message_id_user_id: {
          message_id: messageId,
          user_id: userId
        }
      },
      data: {
        is_visible: false,
        hidden_at: new Date()
      }
    });

    if (!updatedVisibility) {
      return res.status(500).json({ error: `Failed to delete message for user` });
    }

    // Check if message is hidden for all users
    const visibleCount = await prisma.messageVisibility.count({
      where: {
        message_id: messageId,
        is_visible: true
      }
    });

    // If hidden for all, delete message from database
    if (visibleCount === 0) {
      // Delete attachments
      await prisma.attachment.deleteMany({
        where: { message_id: messageId }
      });

      // Delete message status
      await prisma.messageStatus.deleteMany({
        where: { message_id: messageId }
      });

      // Delete visibility records
      await prisma.messageVisibility.deleteMany({
        where: { message_id: messageId }
      });

      // Delete message
      await prisma.message.delete({
        where: { message_id: messageId }
      });

      return res.json({ 
        message: 'Message deleted for user and removed from database (hidden for all members)',
        messageId,
        userId,
        removedFromDb: true
      });
    }

    res.json({ 
      message: 'Message deleted for user',
      messageId,
      userId,
      removedFromDb: false
    });

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

    res.json({ unreadCount, chatId: chatId || 'all' });
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

    res.json({ 
      message: `Marked ${result.count} messages as read`,
      count: result.count
    });
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

    // Delete file from disk
    const filePath = path.join(__dirname, '../../', attachment.file_url);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Error deleting file:', err);
      }
    }

    await prisma.attachment.delete({
      where: { attachment_id: attachmentId }
    });

    res.json({ message: 'Attachment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
