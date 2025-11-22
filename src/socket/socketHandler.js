const { PrismaClient } = require('@prisma/client');
const jwtService = require('../services/jwt.service');
const notificationService = require('../services/notification.service');
const cacheService = require('../services/cache.service');
const userCacheService = require('../services/user-cache.service');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
const redis = require("../config/redis");
const { secureHeapUsed } = require('crypto');

// Store io instance for use in helper functions
let ioInstance = null;

// Helper function to process complete file messages (used for both chunked and regular uploads)
const _processCompleteFileMessage = async (fileData, socket, io, userId) => {
  try {
    const { chat_id, message_text, fileBuffer, fileName, fileType, fileSize, tempId } = fileData;
    const sender_id = userId;

    // Verify sender is a member of the chat
    const chatMember = await prisma.chatMember.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chat_id),
          user_id: userId
        }
      }
    });

    if (!chatMember) {
      socket.emit('file_upload_error', { 
        error: 'You are not a member of this chat',
        tempId 
      });
      return;
    }

    // Create unique filename
    const uploadsDir = path.join(__dirname, '../../uploads');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(fileName);
    const nameWithoutExt = path.basename(fileName, ext);
    const serverFilename = nameWithoutExt + '-' + uniqueSuffix + ext;
    const filePath = path.join(uploadsDir, serverFilename);

    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Write file to disk (convert base64 to buffer if needed)
    let buffer = fileBuffer;
    if (typeof fileBuffer === 'string') {
      buffer = Buffer.from(fileBuffer, 'base64');
    }
    
    try {
      fs.writeFileSync(filePath, buffer);
    } catch (writeErr) {
      console.error(`Failed to write file to disk:`, writeErr);
      socket.emit('file_upload_error', { 
        error: 'Failed to save file to disk',
        details: writeErr.message,
        tempId: tempId 
      });
      return;
    }

    // Determine message type based on file type
    let messageType = 'file';
    if (fileType.startsWith('image/')) {
      messageType = 'image';
    } else if (fileType.startsWith('video/')) {
      messageType = 'video';
    } else if (fileType.startsWith('audio/')) {
      messageType = 'audio';
    } else if (fileType.includes('pdf')) {
      messageType = 'document';
    }

    // Create message record
    const message = await prisma.message.create({
      data: {
        chat_id: parseInt(chat_id),
        sender_id: sender_id,
        message_text: message_text || fileName,
        message_type: messageType
      }
    });

    // Auto-restore deleted chat when new message arrives
    // If this chat was deleted (is_visible=false, is_archived=false), restore it
    // BUT: Do NOT restore old messages - only the chat visibility
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
    const fileUrl = `/uploads/${serverFilename}`;
    const attachment = await prisma.attachment.create({
      data: {
        message_id: message.message_id,
        file_url: fileUrl,
        original_filename: fileName,
        file_type: fileType,
        file_size: fileSize
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
      status: member.user_id === sender_id ? 'sent' : 'delivered'
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
            chat_type: true,
            chat_image: true
          }
        },
        attachments: {
          select: {
            attachment_id: true,
            file_url: true,
            original_filename: true,
            file_type: true,
            file_size: true
          }
        },
        status: true
      }
    });

    // Broadcast to all users in the chat room
    io.to(`chat_${chat_id}`).emit('new_message', {
      ...completeMessage,
      tempId // Include temp ID for client matching
    });

    // Cache the file message
    cacheService.addMessageToCache(parseInt(chat_id), completeMessage).catch(err => {
      console.error('Failed to cache file message:', err.message);
    });

    // Send push notifications to recipients (exclude sender)
    const fileMessageRecipientIds = chatMembers
      .map(m => m.user_id)
      .filter(id => id !== sender_id);

    if (fileMessageRecipientIds.length > 0) {
      try {
        const fileInfo = completeMessage.attachments[0];
        await notificationService.notifyNewMessage(
          {
            sender_username: completeMessage.sender.username,
            sender_profile_pic: completeMessage.sender.profile_pic,
            message_text: fileInfo?.original_filename || `Shared a ${messageType}`,
            chat_id: parseInt(chat_id),
            chat_name: completeMessage.chat.chat_name || completeMessage.sender.username,
            chat_type: completeMessage.chat.chat_type,
            chat_image: completeMessage.chat.chat_image,
            message_type: messageType
          },
          fileMessageRecipientIds
        );
      } catch (pushError) {
        console.error(' Failed to send push notifications:', pushError.message);
      }
    }

    // Send confirmation to sender
    socket.emit('file_upload_success', {
      message_id: completeMessage.message_id,
      tempId,
      file_url: fileUrl,
      original_filename: fileName,
      status: 'sent',
      timestamp: completeMessage.created_at
    });

  } catch (error) {
    console.error('Error in _processCompleteFileMessage:', error);
    socket.emit('file_upload_error', { 
      error: 'Failed to process file',
      details: error.message,
      tempId: fileData.tempId 
    });
  }
};

const initializeSocket = (io) => {
  ioInstance = io;

  // Create a separate namespace for registration (no auth required)
  const registrationNamespace = io.of('/registration');
  
  registrationNamespace.on('connection', (socket) => {

    // Handle registration monitoring
    socket.on('monitor_registration', async (data) => {
      const { username } = data;
      if (username) {
        await redis.set(`registration:socket:${username}`, String(socket.id), { EX: 300 });
        
        socket.emit('monitoring_started', { username });
      }
    });

    // Handle stop monitoring (explicit cancel from frontend)
    socket.on('cancel_registration', async (data) => {
      const { username } = data;
      if (username) {
        const authController = require('../controller/auth.controller');
        const pendingRegistrations = authController.getPendingRegistrations();
        
        const registrationData = pendingRegistrations.get(username);
        if (registrationData) {
          clearTimeout(registrationData.timeoutId);
          pendingRegistrations.delete(username);
          
          socket.emit('registration_cancelled', { username });
        }
        
        await redis.del(`registration:socket:${username}`);
      }
    });

    // Handle disconnection - auto-cancel registration
    socket.on('disconnect', async () => {
      await cleanupRegistrationBySocket(socket);
    });
  });

  // Create a separate namespace for login OTP (no auth required)
  const loginNamespace = io.of('/login');
  
  loginNamespace.on('connection', (socket) => {

    // Handle login OTP monitoring
    socket.on('monitor_login', async (data) => {
      const { userId } = data;
      if (userId) {
        await redis.set(`login:socket:${userId}`, String(socket.id), { EX: 300 });
        
        socket.emit('monitoring_started', { userId });
      }
    });

    // Handle stop monitoring (explicit cancel from frontend)
    socket.on('cancel_login', async (data) => {
      const { userId } = data;
      if (userId) {
        const authController = require('../controller/auth.controller');
        const pendingLogins = authController.getPendingLogins();
        
        const loginData = pendingLogins.get(parseInt(userId));
        if (loginData) {
          clearTimeout(loginData.timeoutId);
          pendingLogins.delete(parseInt(userId));
          
          socket.emit('login_cancelled', { userId });
        }
        
        await redis.del(`login:socket:${userId}`);
      }
    });

    // Handle disconnection - auto-cancel login
    socket.on('disconnect', async () => {
      await cleanupLoginBySocket(socket);
    });
  });

  // Middleware to verify JWT token for main namespace
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwtService.verifyAccessToken(token);
      
      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { user_id: decoded.user_id },
        select: {
          user_id: true,
          username: true,
          full_name: true,
          profile_pic: true,
          status_message: true
        }
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', async (socket) => {
    console.log('User connected:', socket.id);

    const user = socket.user;
    const userId = user.user_id;

    await redis.hSet(`active:user:${userId}`, {
      socketId: String(socket.id),
      username: String(user.username || ''),
      full_name: String(user.full_name || ''),
      profile_pic: String(user.profile_pic || ''),
      status: "online",
      lastSeen: new Date().toISOString()
    });
    
    await redis.expire(`active:user:${userId}`, 86400);

    await redis.set(`socket:user:${socket.id}`, String(userId), { EX: 86400 });

    // Update user online status in database
    await prisma.user.update({
      where: { user_id: userId },
      data: {
        is_online: true,
        last_seen: new Date()
      }
    });

    // Get user's chats and join chat rooms
    const userChats = await prisma.chatMember.findMany({
      where: { user_id: userId },
      include: {
        chat: {
          select: {
            chat_id: true,
            chat_name: true,
            chat_type: true
          }
        }
      }
    });

    // Join user to their chat rooms
    userChats.forEach(chatMember => {
      socket.join(`chat_${chatMember.chat_id}`);
    });

    // Join user to their personal notification room for direct events
    // This allows the user to receive direct notifications like:
    socket.join(`user_${userId}`);

    // Create/update user session
    await prisma.session.create({
      data: {
        user_id: userId,
        device_info: socket.handshake.headers['user-agent'] || 'Unknown',
        ip_address: socket.handshake.address,
        last_active: new Date()
      }
    }).catch(() => {
      // Session might already exist, update it
      prisma.session.updateMany({
        where: { user_id: userId },
        data: { last_active: new Date() }
      });
    });

    // Notify other users that this user is online
    socket.broadcast.emit('user_online', {
      user_id: userId,
      username: user.username,
      full_name: user.full_name,
      status: 'online'
    });

    // Send confirmation to user
    socket.emit('connected', {
      message: 'Successfully connected',
      user: user,
      chats: userChats
    });


    // ========== TEXT MESSAGE HANDLER ==========
    // Handle real-time text message sending
    socket.on('send_message', async (messageData, ack) => {
      try {
        const { chat_id, message_text, message_type = 'text', reply_to_id, tempId } = messageData;
        const sender_id = userId;

        // Validation
        if (!chat_id) {
          const errorData = { 
            error: 'chat_id is required',
            tempId
          };
          socket.emit('message_error', errorData);
          if (typeof ack === 'function') ack({ success: false, error: 'chat_id is required' });
          return;
        }

        if (!message_text || message_text.trim() === '') {
          const errorData = { 
            error: 'message_text cannot be empty',
            tempId
          };
          socket.emit('message_error', errorData);
          if (typeof ack === 'function') ack({ success: false, error: 'message_text cannot be empty' });
          return;
        }

        // Verify sender is a member of the chat
        const chatMember = await prisma.chatMember.findUnique({
          where: {
            chat_id_user_id: {
              chat_id: parseInt(chat_id),
              user_id: userId
            }
          }
        });

        if (!chatMember) {
          const errorData = { 
            error: 'You are not a member of this chat',
            tempId
          };
          socket.emit('message_error', errorData);
          if (typeof ack === 'function') ack({ success: false, error: 'Not a chat member' });
          return;
        }

        const chat = await prisma.chat.findUnique({
          where: {
            chat_id: parseInt(chat_id)
          },
          include: {
            members: true
          }
        });
      
        if (chat && chat.chat_type === 'private') {
          if (chat.members.length < 2) {
            return; 
          }
          firstMember = chat.members[0];
          secondMember = chat.members[1];
          blockedUsers = await prisma.blockedUser.findMany({
            where: {
              OR: [
                {user_id: firstMember.user_id, blocked_user_id: secondMember.user_id},
                {user_id: secondMember.user_id, blocked_user_id: firstMember.user_id}
              ]
            }
          })

          if(blockedUsers.length > 0) {
            const errorData = { 
              error: 'User is blocked',
              tempId
            };
            socket.emit('message_error', errorData);
            if (typeof ack === 'function') ack({ success: false, error: 'User blocked' });
            return;
          }
        }

        // Create message in database
        // Check if this is a reply
        const messageDataToCreate = {
          chat_id: parseInt(chat_id),
          sender_id: parseInt(sender_id),
          message_text: message_text.trim(),
          message_type,
          created_at: new Date()
        };

        // If reply_to_id is provided, mark as reply and set referenced message
        if (reply_to_id) {
          messageDataToCreate.is_reply = true;
          messageDataToCreate.referenced_message_id = parseInt(reply_to_id);
          
          // Validate that the referenced message exists in the same chat
          const referencedMsg = await prisma.message.findUnique({
            where: { message_id: parseInt(reply_to_id) }
          });

          if (!referencedMsg || referencedMsg.chat_id !== parseInt(chat_id)) {
            const errorData = { 
              error: 'Referenced message not found or not in this chat',
              tempId
            };
            socket.emit('message_error', errorData);
            if (typeof ack === 'function') ack({ success: false, error: 'Invalid referenced message' });
            return;
          }
        }

        const message = await prisma.message.create({
          data: messageDataToCreate,
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
            referenced_message: {
              select: {
                message_id: true,
                message_text: true,
                sender: {
                  select: {
                    username: true,
                    user_id: true
                  }
                }
              }
            }
          }
        });

        // Get all chat members for message status and visibility creation
        const chatMembers = await prisma.chatMember.findMany({
          where: { chat_id: parseInt(chat_id) },
          select: { user_id: true }
        });

        // Auto-restore deleted chat when new message arrives
        // If this chat was deleted (is_visible=false, is_archived=false), restore it
        // BUT: Do NOT restore old messages - only the chat visibility
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

        // Create message status for all members
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

        // Fetch complete message with status and attachments for broadcasting
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
                chat_type: true,
                chat_image: true
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
            referenced_message: {
              select: {
                message_id: true,
                message_text: true,
                is_reply: true,
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

        // Emit message to all users in the chat room (including sender)
        io.to(`chat_${chat_id}`).emit('new_message', {
          ...completeMessage,
          tempId: messageData.tempId // Send back temp ID for client matching
        });

        // Cache the message for faster retrieval
        cacheService.addMessageToCache(parseInt(chat_id), completeMessage).catch(err => {
          console.error('Failed to cache message:', err.message);
        });

        // Send push notifications to recipients (exclude sender)
        const recipientIds = chatMembers
          .map(m => m.user_id)
          .filter(id => id !== parseInt(sender_id));

        if (recipientIds.length > 0) {
          try {
            await notificationService.notifyNewMessage(
              {
                sender_username: completeMessage.sender.username,
                sender_profile_pic: completeMessage.sender.profile_pic,
                message_text: completeMessage.message_text,
                chat_id: parseInt(chat_id),
                chat_name: completeMessage.chat.chat_name || completeMessage.sender.username,
                chat_type: completeMessage.chat.chat_type,
                chat_image: completeMessage.chat.chat_image,
                message_type: completeMessage.message_type
              },
              recipientIds
            );
          } catch (pushError) {
            console.error(' Failed to send push notifications:', pushError.message);
            // Don't fail the message send, just log the error
          }
        }

        // Send specific confirmation to sender
        socket.emit('message_sent', {
          message_id: completeMessage.message_id,
          tempId: messageData.tempId,
          status: 'sent',
          timestamp: completeMessage.created_at
        });

        // Send acknowledgment callback to confirm persistence
        if (typeof ack === 'function') {
          ack({
            success: true,
            message_id: completeMessage.message_id,
            tempId: messageData.tempId
          });
        }

      } catch (error) {
        console.error('Error in send_message:', error);
        socket.emit('message_error', { 
          error: 'Failed to send message',
          details: error.message,
          tempId: messageData.tempId 
        });
        if (typeof ack === 'function') ack({ success: false, error: error.message });
      }
    });

    // ========== MESSAGE STATUS HANDLER ==========
    // Handle message status updates (read, delivered)
    socket.on('update_message_status', async (statusData) => {
      try {
        const { message_id, status } = statusData;

        if (!message_id || !status) {
          socket.emit('status_error', { error: 'message_id and status are required' });
          return;
        }

        // Validate status value
        if (!['delivered', 'read'].includes(status)) {
          socket.emit('status_error', { error: 'Invalid status. Must be "delivered" or "read"' });
          return;
        }

        // Parse message_id as integer
        const parsedMessageId = parseInt(message_id);
        
        if (isNaN(parsedMessageId)) {
          socket.emit('status_error', { error: 'Invalid message_id format' });
          return;
        }

        // Check if message exists and user has a status record
        const existingStatus = await prisma.messageStatus.findUnique({
          where: {
            message_id_user_id: {
              message_id: parsedMessageId,
              user_id: userId
            }
          }
        });

        if (!existingStatus) {
          console.warn(`No message status found for message ${parsedMessageId} and user ${userId}`);
          socket.emit('status_error', { error: 'Message status record not found' });
          return;
        }

        // Update message status
        const updatedStatus = await prisma.messageStatus.update({
          where: {
            message_id_user_id: {
              message_id: parsedMessageId,
              user_id: userId
            }
          },
          data: {
            status: status,
            updated_at: new Date()
          }
        });

        // Get message to find chat_id
        const message = await prisma.message.findUnique({
          where: { message_id: parsedMessageId },
          select: { chat_id: true, sender_id: true }
        });

        if (!message) {
          console.warn(`Message not found: ${parsedMessageId}`);
          socket.emit('status_error', { error: 'Message not found' });
          return;
        }

        // Broadcast status update to chat members
        io.to(`chat_${message.chat_id}`).emit('message_status_updated', {
          message_id: parsedMessageId,
          user_id: userId,
          status: status,
          updated_at: updatedStatus.updated_at
        });

      } catch (error) {
        console.error('Error in update_message_status:', error);
        socket.emit('status_error', { 
          error: 'Failed to update message status',
          details: error.message 
        });
      }
    });

    // ========== DELETE MESSAGE HANDLER ==========
    // Handle message deletion for all members (sender or admin only)
    socket.on('delete_message_for_all', async (data) => {
      try {
        const { message_id } = data;

        // Validate message_id
        if (!message_id) {
          socket.emit('delete_error', { error: 'message_id is required' });
          return;
        }

        const messageIdInt = parseInt(message_id);
        if (isNaN(messageIdInt)) {
          socket.emit('delete_error', { error: 'Invalid message_id format' });
          return;
        }

        // Verify message exists
        const message = await prisma.message.findUnique({
          where: { message_id: messageIdInt },
          include: { attachments: true }
        });

        if (!message) {
          return socket.emit('delete_error', { error: 'Message not found' });
        }

        // Check if user is sender or group admin
        const isSender = message.sender_id === userId;
        
        const isAdmin = await prisma.groupAdmin.findUnique({
          where: {
            chat_id_user_id: {
              chat_id: message.chat_id,
              user_id: userId
            }
          }
        });

        // Allow if sender OR admin
        if (!isSender && !isAdmin) {
          return socket.emit('delete_error', { 
            error: 'Only message sender or group admin can delete this message'
          });
        }

        // Delete file attachments from disk
        if (message.attachments && message.attachments.length > 0) {
          message.attachments.forEach(attachment => {
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
          where: { message_id: messageIdInt }
        });

        await prisma.messageStatus.deleteMany({
          where: { message_id: messageIdInt }
        });

        await prisma.attachment.deleteMany({
          where: { message_id: messageIdInt }
        });

        await prisma.message.delete({
          where: { message_id: messageIdInt }
        });

        // Remove from cache
        cacheService.removeMessageFromCache(messageIdInt, message.chat_id).catch(err => {
          console.error('Failed to remove message from cache:', err.message);
        });

        // Broadcast deletion to all chat members
        io.to(`chat_${message.chat_id}`).emit('message_deleted_for_all', {
          message_id: messageIdInt,
          chat_id: message.chat_id,
          deleted_by_user_id: userId,
          deleted_by_type: isSender ? 'sender' : 'admin',
          deleted_at: new Date()
        });

        // Send confirmation to requester
        socket.emit('delete_success', {
          message: 'Message deleted successfully for all members',
          message_id: messageIdInt,
          deleted_by: isSender ? 'sender' : 'admin'
        });

      } catch (error) {
        console.error('Error in delete_message_for_all:', error);
        socket.emit('delete_error', { 
          error: 'Failed to delete message',
          details: error.message 
        });
      }
    });

    // ========== DELETE MESSAGE FOR USER HANDLER ==========
    // Handle message deletion for current user only
    socket.on('delete_message_for_user', async (data) => {
      try {
        const { message_id } = data;

        // Validate message_id
        if (!message_id) {
          socket.emit('delete_error', { error: 'message_id is required' });
          return;
        }

        const messageIdInt = parseInt(message_id);
        if (isNaN(messageIdInt)) {
          socket.emit('delete_error', { error: 'Invalid message_id format' });
          return;
        }

        // Verify message exists
        const message = await prisma.message.findUnique({
          where: { message_id: messageIdInt },
          select: { 
            message_id: true,
            chat_id: true,
            sender_id: true
          }
        });

        if (!message) {
          return socket.emit('delete_error', { error: 'Message not found' });
        }

        // Check if user is a member of the chat
        const isUserInChat = await prisma.chatMember.findUnique({
          where: {
            chat_id_user_id: {
              chat_id: message.chat_id,
              user_id: userId
            }
          }
        });

        if (!isUserInChat) {
          return socket.emit('delete_error', { error: 'User is not a member of this chat' });
        }

        // Update message visibility for this user to false
        const updatedVisibility = await prisma.messageVisibility.update({
          where: {
            message_id_user_id: {
              message_id: messageIdInt,
              user_id: userId
            }
          },
          data: {
            is_visible: false,
            hidden_at: new Date()
          }
        });

        // Check if message is hidden for all users
        const visibleCount = await prisma.messageVisibility.count({
          where: {
            message_id: messageIdInt,
            is_visible: true
          }
        });

        // If hidden for all, delete message from database
        if (visibleCount === 0) {
          // Delete attachments
          await prisma.attachment.deleteMany({
            where: { message_id: messageIdInt }
          });

          // Delete message status
          await prisma.messageStatus.deleteMany({
            where: { message_id: messageIdInt }
          });

          // Delete visibility records
          await prisma.messageVisibility.deleteMany({
            where: { message_id: messageIdInt }
          });

          // Delete message
          await prisma.message.delete({
            where: { message_id: messageIdInt }
          });

          // Remove from cache
          cacheService.removeMessageFromCache(messageIdInt, message.chat_id).catch(err => {
            console.error('Failed to remove message from cache:', err.message);
          });

          // Broadcast to all chat members that message is deleted
          io.to(`chat_${message.chat_id}`).emit('message_deleted_for_all', {
            message_id: messageIdInt,
            chat_id: message.chat_id,
            deleted_by_user_id: userId,
            deleted_by_type: 'auto_cascade',
            reason: 'Hidden for all members',
            deleted_at: new Date()
          });

          return socket.emit('delete_success', {
            message: 'Message deleted for user and removed from database (hidden for all members)',
            message_id: messageIdInt,
            removed_from_db: true
          });
        }

        // Notify only the requesting user (personal deletion)
        socket.emit('delete_success', {
          message: 'Message deleted for you',
          message_id: messageIdInt,
          removed_from_db: false
        });

      } catch (error) {
        console.error('Error in delete_message_for_user:', error);
        socket.emit('delete_error', { 
          error: 'Failed to delete message for user',
          details: error.message 
        });
      }
    });

    // Handle typing indicator
    socket.on('typing_start', (data) => {
      const { chat_id, user_id, username } = data;
      socket.to(`chat_${chat_id}`).emit('user_typing', {
        user_id,
        username,
        chat_id
      });
    });

    socket.on('typing_stop', (data) => {
      const { chat_id, user_id } = data;
      socket.to(`chat_${chat_id}`).emit('user_stopped_typing', {
        user_id,
        chat_id
      });
    });

    // Handle joining a specific chat
    socket.on('join_chat', async (data) => {
      try {
        const { chat_id } = data;

        // Validate chat_id
        if (!chat_id) {
          socket.emit('error', { message: 'chat_id is required' });
          return;
        }

        const chatIdInt = parseInt(chat_id);
        if (isNaN(chatIdInt)) {
          socket.emit('error', { message: 'Invalid chat_id format' });
          return;
        }

        // Verify user is a member of the chat
        const chatMember = await prisma.chatMember.findUnique({
          where: {
            chat_id_user_id: {
              chat_id: chatIdInt,
              user_id: userId
            }
          }
        });

        if (chatMember) {
          socket.join(`chat_${chatIdInt}`);
          socket.emit('chat_joined', { chat_id: chatIdInt });
          
          // Notify others in the chat
          socket.to(`chat_${chatIdInt}`).emit('user_joined_chat', {
            user_id: userId,
            chat_id: chatIdInt
          });
        } else {
          socket.emit('error', { message: 'Not authorized to join this chat' });
        }

      } catch (error) {
        console.error('Error in join_chat:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });

    // Handle leaving a chat
    socket.on('leave_chat', (data) => {
      const { chat_id } = data;
      socket.leave(`chat_${chat_id}`);
      socket.to(`chat_${chat_id}`).emit('user_left_chat', {
        user_id: userId,
        chat_id
      });
    });

    // Handle user status updates
    socket.on('update_status', async (data) => {
      try {
        const { status_message } = data;
        
        // Update status in database
        await prisma.user.update({
          where: { user_id: userId },
          data: { status_message }
        });

        const key = `active:user:${userId}`;
        const exists = await redis.exists(key);

        if (exists) {
          await redis.hSet(key, {
            status_message: String(status_message || ''),
            lastSeen: new Date().toISOString()
          });
        }


        // Broadcast status update
        socket.broadcast.emit('user_status_updated', {
          user_id: userId,
          status_message
        });

      } catch (error) {
        console.error('Error in update_status:', error);
        socket.emit('error', { message: 'Failed to update status' });
      }
    });

    // Handle getting online users
    socket.on('get_online_users', async () => {
      try {
        const onlineUsers = await getOnlineUsers();
        socket.emit('online_users', onlineUsers);
      } catch (err) {
        console.error("Error fetching online users:", err);
        socket.emit('online_users', []);  // fail-safe
      }
    });

    // ========== FILE UPLOAD VIA WEBSOCKET ==========
    // Handle file upload with attachment and message
    socket.on('send_file_message', async (fileData, ack) => {
      try {
        const { chat_id, message_text, fileBuffer, fileName, fileType, fileSize, tempId } = fileData;

        // Validation
        if (!chat_id) {
          socket.emit('file_upload_error', { 
            error: 'chat_id is required',
            tempId 
          });
          if (typeof ack === 'function') ack({ success: false, error: 'chat_id is required' });
          return;
        }

        if (!fileBuffer || !fileName) {
          socket.emit('file_upload_error', { 
            error: 'File buffer and fileName are required',
            tempId 
          });
          if (typeof ack === 'function') ack({ success: false, error: 'File buffer and fileName are required' });
          return;
        }

        // Max file size: 50MB
        const MAX_FILE_SIZE = 50 * 1024 * 1024;
        if (fileSize > MAX_FILE_SIZE) {
          socket.emit('file_upload_error', { 
            error: `File size exceeds 50MB limit (${(fileSize / 1024 / 1024).toFixed(2)}MB)`,
            tempId 
          });
          if (typeof ack === 'function') ack({ success: false, error: 'File size exceeds limit' });
          return;
        }

        // Use helper function to process the file
        await _processCompleteFileMessage(fileData, socket, io, userId);
        
        // Send acknowledgment callback to confirm persistence
        if (typeof ack === 'function') {
          ack({
            success: true,
            tempId
          });
        }

      } catch (error) {
        console.error('Error in send_file_message:', error);
        socket.emit('file_upload_error', { 
          error: 'Failed to upload file',
          details: error.message,
          tempId: fileData.tempId 
        });
        if (typeof ack === 'function') ack({ success: false, error: error.message });
      }
    });

    
    socket.on('send_file_message_chunk', async (chunkData, ack) => {
      try {
        const { 
          tempId, 
          chunk,  // Base64 chunk data
          chunkIndex, 
          totalChunks, 
          isFirstChunk,
          isLastChunk,
          chat_id,
          fileName,
          fileSize,
          fileType,
          message_text
        } = chunkData;

        // Store metadata on first chunk
        if (isFirstChunk) {
          await redis.hSet(`file:meta:${tempId}`, {
            chat_id: String(chat_id),
            fileName: String(fileName || ''),
            fileSize: String(fileSize || 0),
            fileType: String(fileType || ''),
            message_text: String(message_text || ''),
            userId: String(userId),
            totalChunks: String(totalChunks),
            receivedChunks: '0'
          });
          await redis.expire(`file:meta:${tempId}`, 600); // 10 min TTL
        }

        // Store the chunk in a list (append to end)
        await redis.rPush(`file:chunks:${tempId}`, JSON.stringify({
          index: chunkIndex,
          data: chunk
        }));
        await redis.expire(`file:chunks:${tempId}`, 600); // 10 min TTL

        // Increment received chunks counter
        const received = await redis.hIncrBy(`file:meta:${tempId}`, 'receivedChunks', 1);

        // Send ack for this chunk
        if (typeof ack === 'function') {
          ack({ success: true, chunkIndex, receivedChunks: received });
        }

        // If all chunks received, combine and process
        if (isLastChunk && received === totalChunks) {
          const meta = await redis.hGetAll(`file:meta:${tempId}`);
          const chunksData = await redis.lRange(`file:chunks:${tempId}`, 0, -1);
          
          // Parse and sort chunks by index
          const chunks = chunksData
            .map(c => JSON.parse(c))
            .sort((a, b) => a.index - b.index)
            .map(c => c.data);
          
          // Combine all chunks
          const completeBase64 = chunks.join('');
          
          // Process the complete file
          await _processCompleteFileMessage({
            chat_id: parseInt(meta.chat_id),
            fileName: meta.fileName,
            fileSize: parseInt(meta.fileSize),
            fileType: meta.fileType,
            message_text: meta.message_text,
            fileBuffer: completeBase64,
            tempId
          }, socket, io, parseInt(meta.userId));
          
          // Clean up
          await redis.del(`file:meta:${tempId}`);
          await redis.del(`file:chunks:${tempId}`);
        }
      } catch (error) {
        console.error('Error in send_file_message_chunk:', error);
        if (typeof ack === 'function') {
          ack({ success: false, error: error.message });
        }
      }
    });

    // ========== UPLOAD PROGRESS TRACKING (OPTIONAL) ==========
    // Track upload progress for large files
    socket.on('file_upload_progress', (progressData) => {
      const { chat_id, progress, tempId } = progressData;
      // Broadcast progress to sender only (or to all users in chat if desired)
      socket.emit('file_upload_progress_update', {
        progress, // 0-100
        tempId
      });
    });

    // ========== USER DISCONNECT ==========
    socket.on('disconnect', async () => {
      try {
        const userIdStr = await redis.get(`socket:user:${socket.id}`);
        const userId = userIdStr ? parseInt(userIdStr) : null;
        
        if (userId) {
          // Update last seen time
          const userData = await redis.hGetAll(`active:user:${userId}`);
          if (userData) {
            // Update user offline status in database with retry logic and timeout
            try {
              await Promise.race([
                prisma.user.update({
                  where: { user_id: userId },
                  data: {
                    is_online: false,
                    last_seen: new Date()
                  }
                }),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Update timeout')), 5000)
                )
              ]);

              // Update session last activity (non-critical, don't wait)
              prisma.session.updateMany({
                where: { user_id: userId },
                data: { last_active: new Date() }
              }).catch(err => {
                console.warn(`⚠️  Failed to update session for user ${userId}:`, err.message);
              });

              // Notify others that user is offline (fire and forget)
              socket.broadcast.emit('user_offline', {
                user_id: userId,
                username: userData.username,
                lastSeen: new Date()
              });

              // console.log(`User ${userData.username} (${userId}) disconnected`);
            } catch (dbError) {
              if (dbError.message === 'Update timeout') {
                console.warn(`⚠️  Database update timeout for user ${userId}, skipping`);
              } else if (dbError.code === 'HY000') {
                console.warn(`Database lock timeout for user ${userId}, skipping offline update`);
              } else {
                console.error(`Error updating user ${userId} status:`, dbError.message);
              }
              // Don't throw - cleanup will continue regardless
            }
          }

          // Clean up immediately (don't wait for DB)
          await redis.del(`active:user:${userId}`);
          await redis.del(`socket:user:${socket.id}`);
        }

      } catch (error) {
        console.error('Error in disconnect handler:', error.message);
      }

      // console.log(`Socket disconnected: ${socket.id}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });
};

// Helper function to get online users using SCAN (non-blocking)
const getOnlineUsers = async () => {
  let cursor = '0';  // Redis SCAN cursor must be a string
  const result = [];

  do {
    // SCAN with MATCH pattern and COUNT hint
    const reply = await redis.scan(cursor, {
      MATCH: "active:user:*",
      COUNT: 50
    });

    cursor = reply.cursor;
    const keys = reply.keys;

    for (const key of keys) {
      const userData = await redis.hGetAll(key);
      if (!userData || Object.keys(userData).length === 0) continue;

      const userId = key.split(":")[2];

      result.push({
        user_id: parseInt(userId),
        username: userData.username,
        full_name: userData.full_name,
        profile_pic: userData.profile_pic,
        status: userData.status,
        lastSeen: userData.lastSeen
      });
    }
  } while (cursor !== '0'); // continue until SCAN wraps around (cursor is string '0')

  return result;
};


const cleanupRegistrationBySocket = async (socket) => {
  const authController = require('../controller/auth.controller');
  const pendingRegistrations = authController.getPendingRegistrations();

  let cursor = '0';  // Redis SCAN cursor must be a string

  do {
    // scan Redis for keys matching registration:socket:*
    const reply = await redis.scan(cursor, {
      MATCH: "registration:socket:*",
      COUNT: 50
    });

    cursor = reply.cursor;
    const keys = reply.keys;

    for (const key of keys) {
      const storedSocketId = await redis.get(key);

      if (storedSocketId === socket.id) {

        // extract username from key => registration:socket:<username>
        const parts = key.split(":");
        const username = parts[2];

        // clear pending registration timeout
        const registrationData = pendingRegistrations.get(username);
        if (registrationData) {
          clearTimeout(registrationData.timeoutId);
          pendingRegistrations.delete(username);
        }

        // delete Redis key
        await redis.del(key);

        return; // done
      }
    }
  } while (cursor !== '0');  // cursor is string '0'
};

const cleanupLoginBySocket = async (socket) => {
  const authController = require('../controller/auth.controller');
  const pendingLogins = authController.getPendingLogins();

  let cursor = '0';  // Redis SCAN cursor must be a string

  do {
    // scan Redis for keys matching registration:socket:*
    const reply = await redis.scan(cursor, {
      MATCH: "login:socket:*",
      COUNT: 50
    });

    cursor = reply.cursor;
    const keys = reply.keys;

    for (const key of keys) {
      const storedSocketId = await redis.get(key);

      if (storedSocketId === socket.id) {

        // extract username from key => registration:socket:<username>
        const parts = key.split(":");
        const userId = parseInt(parts[2]);

        // clear pending registration timeout
        const loginData = pendingLogins.get(userId);
        if (loginData) {
          clearTimeout(loginData.timeoutId);
          pendingLogins.delete(userId);
        }

        // delete Redis key
        await redis.del(key);

        return; // done
      }
    }
  } while (cursor !== '0');  // cursor is string '0'
};




// Helper function to check if user is online
const isUserOnline = async (userId) => {
  const exists = await redis.exists(`active:user:${userId}`);
  return exists === 1;
};


// Helper function to send notification to specific user
const sendNotificationToUser = async (userId, notification) => {
  const userData = await redis.hGetAll(`active:user:${userId}`);
  if (userData && userData.socketId && ioInstance) {
    ioInstance.to(userData.socketId).emit('notification', notification);
    return true;
  }
  return false;
};

// Helper function to broadcast event to a chat room
const sendNotificationToChat = (chatId, event, data) => {
  if (ioInstance) {
    ioInstance.to(`chat_${chatId}`).emit(event, data);
    return true;
  }
  return false;
};

// Helper function to emit file upload message to chat
const emitFileMessage = async (chatId, messageData) => {
  if (ioInstance) {
    ioInstance.to(`chat_${chatId}`).emit('new_message', messageData);
    return true;
  }
  return false;
};

module.exports = { 
  initializeSocket, 
  getOnlineUsers, 
  isUserOnline, 
  sendNotificationToUser,
  sendNotificationToChat,
  emitFileMessage
};
