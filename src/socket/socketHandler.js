const { PrismaClient } = require('@prisma/client');
const jwtService = require('../services/jwt.service');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

// Store active users and their socket connections
const activeUsers = new Map(); // userId -> { socketId, username, status }
const userSockets = new Map(); // socketId -> userId

// Store registration socket connections (username -> socketId)
const registrationSockets = new Map();

// Store login socket connections (userId -> socketId)
const loginSockets = new Map();

// Store io instance for use in helper functions
let ioInstance = null;

// Helper function to process complete file messages (used for both chunked and regular uploads)
const _processCompleteFileMessage = async (fileData, socket, io, userId) => {
  try {
    const { chat_id, message_text, fileBuffer, fileName, fileType, fileSize, tempId } = fileData;
    const sender_id = userId;

    console.log(`🔧 Processing complete file message: ${fileName} (${fileSize} bytes)`);

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
      console.log(`✅ File saved: ${serverFilename} at path: ${filePath}`);
    } catch (writeErr) {
      console.error(`❌ Failed to write file to disk:`, writeErr);
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

    console.log(`✅ Message created: ${message.message_id}`);

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

    console.log(`✅ Attachment created: ${attachment.attachment_id} with file_url: ${fileUrl}`);

    // Create message status for all chat members
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
        attachments: true,
        status: true
      }
    });

    console.log(`✅ Complete message fetched with ${completeMessage.attachments.length} attachment(s)`);

    // Broadcast to all users in the chat room
    io.to(`chat_${chat_id}`).emit('new_message', {
      ...completeMessage,
      tempId // Include temp ID for client matching
    });

    // Send confirmation to sender
    socket.emit('file_upload_success', {
      message_id: completeMessage.message_id,
      tempId,
      file_url: fileUrl,
      original_filename: fileName,
      status: 'sent',
      timestamp: completeMessage.created_at
    });

    console.log(`✅ File message ${completeMessage.message_id} sent in chat ${chat_id} by user ${sender_id}`);

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
    console.log('Registration socket connected:', socket.id);

    // Handle registration monitoring
    socket.on('monitor_registration', (data) => {
      const { username } = data;
      if (username) {
        registrationSockets.set(username, socket.id);
        console.log(`👀 Monitoring registration for: ${username}`);
        
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
          console.log(`❌ Registration canceled via socket for: ${username}`);
          
          socket.emit('registration_cancelled', { username });
        }
        
        registrationSockets.delete(username);
      }
    });

    // Handle disconnection - auto-cancel registration
    socket.on('disconnect', () => {
      console.log('Registration socket disconnected:', socket.id);
      
      // Find and cancel any registration associated with this socket
      for (const [username, socketId] of registrationSockets.entries()) {
        if (socketId === socket.id) {
          const authController = require('../controller/auth.controller');
          const pendingRegistrations = authController.getPendingRegistrations();
          
          const registrationData = pendingRegistrations.get(username);
          if (registrationData) {
            clearTimeout(registrationData.timeoutId);
            pendingRegistrations.delete(username);
            console.log(`🔌 Registration auto-canceled on disconnect for: ${username}`);
          }
          
          registrationSockets.delete(username);
          break;
        }
      }
    });
  });

  // Create a separate namespace for login OTP (no auth required)
  const loginNamespace = io.of('/login');
  
  loginNamespace.on('connection', (socket) => {
    console.log('Login socket connected:', socket.id);

    // Handle login OTP monitoring
    socket.on('monitor_login', (data) => {
      const { userId } = data;
      if (userId) {
        loginSockets.set(parseInt(userId), socket.id);
        console.log(`👀 Monitoring login OTP for userId: ${userId}`);
        
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
          console.log(`❌ Login canceled via socket for userId: ${userId}`);
          
          socket.emit('login_cancelled', { userId });
        }
        
        loginSockets.delete(parseInt(userId));
      }
    });

    // Handle disconnection - auto-cancel login
    socket.on('disconnect', () => {
      console.log('Login socket disconnected:', socket.id);
      
      // Find and cancel any login associated with this socket
      for (const [userId, socketId] of loginSockets.entries()) {
        if (socketId === socket.id) {
          const authController = require('../controller/auth.controller');
          const pendingLogins = authController.getPendingLogins();
          
          const loginData = pendingLogins.get(userId);
          if (loginData) {
            clearTimeout(loginData.timeoutId);
            pendingLogins.delete(userId);
            console.log(`🔌 Login auto-canceled on disconnect for userId: ${userId}`);
          }
          
          loginSockets.delete(userId);
          break;
        }
      }
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

    // Store user connection
    activeUsers.set(userId, {
      socketId: socket.id,
      username: user.username,
      full_name: user.full_name,
      profile_pic: user.profile_pic,
      status: 'online',
      lastSeen: new Date()
    });

    userSockets.set(socket.id, userId);

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
      console.log(`👥 User ${userId} joined room: chat_${chatMember.chat_id}`);
    });
    console.log(`✅ User ${userId} joined ${userChats.length} chat rooms`);

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

    console.log(`User ${user.username} (${userId}) connected with JWT`);


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

        // Create message in database
        const message = await prisma.message.create({
          data: {
            chat_id: parseInt(chat_id),
            sender_id: parseInt(sender_id),
            message_text: message_text.trim(),
            message_type,
            created_at: new Date()
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

        // Get all chat members for message status creation
        const chatMembers = await prisma.chatMember.findMany({
          where: { chat_id: parseInt(chat_id) },
          select: { user_id: true }
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
                chat_type: true
              }
            },
            status: true,
            attachments: true
          }
        });

        // Emit message to all users in the chat room (including sender)
        io.to(`chat_${chat_id}`).emit('new_message', {
          ...completeMessage,
          tempId: messageData.tempId // Send back temp ID for client matching
        });
        console.log(`📡 Broadcasting 'new_message' to room chat_${chat_id}`, {
          message_id: completeMessage.message_id,
          sender_id: sender_id,
          chat_id: chat_id,
          room_size: io.sockets.adapter.rooms.get(`chat_${chat_id}`)?.size || 0
        });

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

        console.log(`✓ Message ${completeMessage.message_id} sent in chat ${chat_id} by user ${sender_id}`);

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

        // Update message status
        const updatedStatus = await prisma.messageStatus.update({
          where: {
            message_id_user_id: {
              message_id: parseInt(message_id),
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
          where: { message_id: parseInt(message_id) },
          select: { chat_id: true, sender_id: true }
        });

        // Broadcast status update to chat members
        io.to(`chat_${message.chat_id}`).emit('message_status_updated', {
          message_id: parseInt(message_id),
          user_id: userId,
          status: status,
          updated_at: updatedStatus.updated_at
        });

        console.log(`✓ Message ${message_id} marked as ${status} by user ${userId}`);

      } catch (error) {
        console.error('Error in update_message_status:', error);
        socket.emit('status_error', { 
          error: 'Failed to update message status',
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
        const { chat_id, user_id } = data;

        // Verify user is a member of the chat
        const chatMember = await prisma.chatMember.findUnique({
          where: {
            chat_id_user_id: {
              chat_id: parseInt(chat_id),
              user_id: parseInt(user_id)
            }
          }
        });

        if (chatMember) {
          socket.join(`chat_${chat_id}`);
          socket.emit('chat_joined', { chat_id });
          
          // Notify others in the chat
          socket.to(`chat_${chat_id}`).emit('user_joined_chat', {
            user_id,
            chat_id
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
      const { chat_id, user_id } = data;
      socket.leave(`chat_${chat_id}`);
      socket.to(`chat_${chat_id}`).emit('user_left_chat', {
        user_id,
        chat_id
      });
    });

    // Handle user status updates
    socket.on('update_status', async (data) => {
      try {
        const { user_id, status_message } = data;
        
        // Update status in database
        await prisma.user.update({
          where: { user_id: parseInt(user_id) },
          data: { status_message }
        });

        // Update in active users
        if (activeUsers.has(parseInt(user_id))) {
          const userData = activeUsers.get(parseInt(user_id));
          userData.status_message = status_message;
          activeUsers.set(parseInt(user_id), userData);
        }

        // Broadcast status update
        socket.broadcast.emit('user_status_updated', {
          user_id: parseInt(user_id),
          status_message
        });

      } catch (error) {
        console.error('Error in update_status:', error);
        socket.emit('error', { message: 'Failed to update status' });
      }
    });

    // Handle getting online users
    socket.on('get_online_users', () => {
      const onlineUsers = Array.from(activeUsers.entries()).map(([userId, userData]) => ({
        user_id: userId,
        username: userData.username,
        full_name: userData.full_name,
        profile_pic: userData.profile_pic,
        status: userData.status,
        lastSeen: userData.lastSeen
      }));

      socket.emit('online_users', onlineUsers);
    });

    // ========== FILE UPLOAD VIA WEBSOCKET ==========
    // Handle file upload with attachment and message
    socket.on('send_file_message', async (fileData, ack) => {
      try {
        const { chat_id, message_text, fileBuffer, fileName, fileType, fileSize, tempId } = fileData;

        console.log(`📤 File upload started: ${fileName} (${fileSize} bytes) from user ${userId}`);

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

    // ========== CHUNKED FILE UPLOAD VIA WEBSOCKET ==========
    // Store chunk data temporarily (in production, use Redis or database)
    const fileChunks = new Map(); // tempId -> { chunks: [], metadata: {...} }

    socket.on('send_file_message_chunk', async (chunkData, ack) => {
      try {
        const { 
          tempId, 
          chunkData: chunk, 
          chunkIndex, 
          totalChunks, 
          isFirstChunk,
          isLastChunk,
          // First chunk includes metadata
          chat_id,
          fileName,
          fileSize,
          fileType,
          message_text
        } = chunkData;

        console.log(`📦 Received chunk ${chunkIndex}/${totalChunks} for tempId: ${tempId}`);

        // Initialize chunk storage on first chunk
        if (isFirstChunk) {
          fileChunks.set(tempId, {
            chunks: [],
            metadata: {
              chat_id,
              fileName,
              fileSize,
              fileType,
              message_text,
              userId: userId
            },
            receivedChunks: 0
          });
        }

        // Store the chunk
        const fileData = fileChunks.get(tempId);
        if (fileData) {
          fileData.chunks[chunkIndex] = chunk;
          fileData.receivedChunks++;

          // Send ack for this chunk
          if (typeof ack === 'function') {
            ack({ success: true, chunkIndex });
          }

          // If all chunks received, combine and process
          if (isLastChunk && fileData.receivedChunks === totalChunks) {
            console.log(`✅ All ${totalChunks} chunks received for tempId: ${tempId}`);
            
            // Combine all chunks
            const completeBase64 = fileData.chunks.join('');
            
            // Process the complete file (same as regular file upload)
            await _processCompleteFileMessage({
              ...fileData.metadata,
              fileBuffer: completeBase64,
              tempId
            }, socket, io, userId);
            
            // Clean up
            fileChunks.delete(tempId);
          }
        } else {
          console.error(`❌ No file data found for tempId: ${tempId}`);
          if (typeof ack === 'function') {
            ack({ success: false, error: 'File data not found' });
          }
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
      console.log(`📊 Upload progress: ${progress}% for tempId: ${tempId}`);
    });

    // ========== USER DISCONNECT ==========
    socket.on('disconnect', async () => {
      try {
        const userId = userSockets.get(socket.id);
        
        if (userId) {
          // Update last seen time
          const userData = activeUsers.get(userId);
          if (userData) {
            // Update user offline status in database
            await prisma.user.update({
              where: { user_id: userId },
              data: {
                is_online: false,
                last_seen: new Date()
              }
            });

            // Update session last activity
            await prisma.session.updateMany({
              where: { user_id: userId },
              data: { last_active: new Date() }
            });

            // Notify others that user is offline
            socket.broadcast.emit('user_offline', {
              user_id: userId,
              username: userData.username,
              lastSeen: new Date()
            });

            console.log(`User ${userData.username} (${userId}) disconnected`);
          }

          // Clean up
          activeUsers.delete(userId);
          userSockets.delete(socket.id);
        }

      } catch (error) {
        console.error('Error in disconnect:', error);
      }

      console.log('User disconnected:', socket.id);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });
};

// Helper function to get online users
const getOnlineUsers = () => {
  return Array.from(activeUsers.entries()).map(([userId, userData]) => ({
    user_id: userId,
    username: userData.username,
    full_name: userData.full_name,
    status: userData.status,
    lastSeen: userData.lastSeen
  }));
};

// Helper function to check if user is online
const isUserOnline = (userId) => {
  return activeUsers.has(parseInt(userId));
};

// Helper function to send notification to specific user
const sendNotificationToUser = (userId, notification) => {
  const userData = activeUsers.get(parseInt(userId));
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
