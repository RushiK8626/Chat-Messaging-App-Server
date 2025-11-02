const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { upload } = require('../config/upload');

// Profile picture upload (non-message, authenticated)
exports.uploadProfilePic = [
  upload.single('profilePic'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const userId = req.user.user_id;
      const filename = req.file.filename;
      const fileUrl = `/uploads/${filename}`;

      // Update user profile_pic in DB
      await prisma.user.update({
        where: { user_id: userId },
        data: { profile_pic: fileUrl }
      });

      res.status(200).json({ message: 'Profile picture uploaded successfully', profile_pic: fileUrl });
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      res.status(500).json({ error: 'Error uploading profile picture' });
    }
  }
];

// Group image upload (authenticated, admin-only check in handler)
exports.uploadGroupImage = [
  upload.fields([
    { name: 'chat_image', maxCount: 1 },
    { name: 'groupImage', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const file = req.files?.chat_image?.[0] || req.files?.groupImage?.[0];
      
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded. Use field name: chat_image or groupImage' });
      }

      const { chatId } = req.body;
      if (!chatId) {
        return res.status(400).json({ error: 'chatId is required in request body' });
      }

      const chat = await prisma.chat.findUnique({ where: { chat_id: parseInt(chatId) } });
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }

      if (chat.chat_type !== 'group') {
        return res.status(400).json({ error: 'Group image can only be set for group chats' });
      }

      // Verify requester is an admin
      const adminRecord = await prisma.groupAdmin.findUnique({
        where: {
          chat_id_user_id: {
            chat_id: parseInt(chatId),
            user_id: req.user.user_id
          }
        }
      });

      if (!adminRecord) {
        return res.status(403).json({ error: 'Only group admins can upload the group image' });
      }

      const filename = file.filename;
      const fileUrl = `/uploads/${filename}`;

      // Update chat image in DB
      await prisma.chat.update({
        where: { chat_id: parseInt(chatId) },
        data: { chat_image: fileUrl }
      });

      res.status(200).json({ message: 'Group image uploaded successfully', chat_image: fileUrl });
    } catch (error) {
      console.error('Error uploading group image:', error);
      res.status(500).json({ error: 'Error uploading group image' });
    }
  }
];

// Message attachment upload (authenticated)
exports.uploadAttachment = [
  upload.single('attachment'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const filename = req.file.filename;
      const fileUrl = `/uploads/${filename}`;
      const fileType = req.file.mimetype;
      const fileSize = req.file.size;

      res.status(200).json({
        message: 'Attachment uploaded successfully',
        file_url: fileUrl,
        file_type: fileType,
        file_size: fileSize,
        filename: filename
      });
    } catch (error) {
      console.error('Error uploading attachment:', error);
      res.status(500).json({ error: 'Error uploading attachment' });
    }
  }
];

// Serve group chat images (protected - requires authentication + member verification)
exports.getChatImage = async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../../uploads', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Verify this file is a group chat image and user is a member
    const chat = await prisma.chat.findFirst({
      where: {
        OR: [
          { chat_image: `/uploads/${filename}` },
          { chat_image: `uploads/${filename}` },
          { chat_image: filename }
        ]
      },
      include: {
        members: {
          where: {
            user_id: req.user.user_id
          }
        }
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat image not found' });
    }

    if (chat.members.length === 0) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this chat.' });
    }

    // Serve the file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving chat image:', error);
    res.status(500).json({ error: 'Error serving file' });
  }
};

// Serve message attachment files (protected - requires authentication + access verification)
exports.getAttachment = async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../../uploads', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Verify user has access to this file by checking attachment ownership
    const attachment = await prisma.attachment.findFirst({
      where: {
        OR: [
          { file_url: `/uploads/${filename}` },
          { file_url: `uploads/${filename}` },
          { file_url: filename }
        ]
      },
      include: {
        message: {
          include: {
            chat: {
              include: {
                members: {
                  where: {
                    user_id: req.user.user_id
                  }
                }
              }
            }
          }
        }
      }
    });

    // If file is attached to a message, verify user is a member of the chat
    if (!attachment) {
      return res.status(404).json({ error: 'File not found in any accessible conversation' });
    }

    if (attachment.message.chat.members.length === 0) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this conversation.' });
    }

    // Serve the file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving attachment:', error);
    res.status(500).json({ error: 'Error serving file' });
  }
};

// Serve profile pictures (public - no authentication required)
exports.getProfilePicture = async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../../uploads', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Profile picture not found' });
    }

    // Verify this is actually a profile picture
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { profile_pic: `/uploads/${filename}` },
          { profile_pic: `uploads/${filename}` },
          { profile_pic: filename }
        ]
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Profile picture not found' });
    }

    // Serve the file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving profile picture:', error);
    res.status(500).json({ error: 'Error serving file' });
  }
};

// Direct file access (protected - legacy support with auto-detection)
exports.getFile = async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../../uploads', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if it's a profile picture (public access)
    const userWithProfilePic = await prisma.user.findFirst({
      where: {
        OR: [
          { profile_pic: `/uploads/${filename}` },
          { profile_pic: `uploads/${filename}` },
          { profile_pic: filename }
        ]
      }
    });

    if (userWithProfilePic) {
      // It's a profile pic, allow access
      return res.sendFile(filePath);
    }

    // Check if it's a group chat image (public access)
    const chatWithImage = await prisma.chat.findFirst({
      where: {
        OR: [
          { chat_image: `/uploads/${filename}` },
          { chat_image: `uploads/${filename}` },
          { chat_image: filename }
        ]
      }
    });

    if (chatWithImage) {
      return res.sendFile(filePath);
    }

    // Check if it's a message attachment
    const attachment = await prisma.attachment.findFirst({
      where: {
        OR: [
          { file_url: `/uploads/${filename}` },
          { file_url: `uploads/${filename}` },
          { file_url: filename }
        ]
      },
      include: {
        message: {
          include: {
            chat: {
              include: {
                members: {
                  where: {
                    user_id: req.user.user_id
                  }
                }
              }
            }
          }
        }
      }
    });

    if (attachment && attachment.message.chat.members.length > 0) {
      return res.sendFile(filePath);
    }

    // File not associated with any known entity or user not authorized
    return res.status(404).json({ error: 'File not found' });

  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Error serving file' });
  }
};
