const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
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

// Delete message
exports.deleteMessage = async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const senderId = parseInt(req.body.sender_id || req.user.user_id); // Support both body and JWT

    // Verify the message belongs to the sender
    const existingMessage = await prisma.message.findUnique({
      where: { message_id: messageId },
      include: {
        attachments: true
      }
    });

    if (!existingMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (existingMessage.sender_id !== senderId) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
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

    // Delete related records first (cascade should handle this, but being explicit)
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
