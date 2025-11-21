const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const aiService = require('../services/ai.service');
const { Receive } = require('twilio/lib/twiml/FaxResponse');

/**
 * Generate smart reply suggestions
 * POST /api/ai/smart-replies
 * Body: { chat_id: number, limit?: number }
 */
exports.generateSmartReplies = async (req, res) => {
  try {
    const { chat_id, limit = 3 } = req.body;
    const userId = req.user.user_id; // From auth middleware

    if (!chat_id) {
      return res.status(400).json({ error: 'chat_id is required' });
    }

    // Verify user is a member of the chat
    const chatMember = await prisma.chatMember.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chat_id),
          user_id: userId,
        },
      },
    });

    if (!chatMember) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    // Fetch recent messages for context (last 10 messages)
    const messages = await prisma.message.findMany({
      where: {
        chat_id: parseInt(chat_id),
        message_type: 'text', // Only use text messages for context
      },
      include: {
        sender: {
          select: {
            username: true,
            full_name: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 10,
    });

    if (messages.length === 0) {
      return res.status(400).json({ 
        error: 'No messages found in this chat',
        suggestions: [],
      });
    }

    // Format messages for AI service
    const messageHistory = messages.reverse().map(msg => ({
      sender: msg.sender.username || msg.sender.full_name || 'User',
      text: msg.message_text,
    }));

    // Generate smart replies
    const suggestions = await aiService.generateSmartReplies(
      messageHistory,
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      chat_id: parseInt(chat_id),
      suggestions,
      context_messages: messages.length,
    });
  } catch (error) {
    console.error('Error in generateSmartReplies:', error);
    res.status(500).json({ 
      error: 'Failed to generate smart replies',
      details: error.message,
    });
  }
};

/**
 * Translate a message
 * POST /api/ai/translate
 * Body: { message_id?: number, text?: string, target_language: string, source_language?: string }
 */
exports.translateMessage = async (req, res) => {
  try {
    const { message_id, text, target_language, source_language = 'auto' } = req.body;
    const userId = req.user.user_id; // From auth middleware

    if (!target_language) {
      return res.status(400).json({ error: 'target_language is required' });
    }

    let messageText = text;

    // If message_id provided, fetch the message
    if (message_id) {
      const message = await prisma.message.findUnique({
        where: { message_id: parseInt(message_id) },
        include: {
          chat: {
            include: {
              members: {
                where: { user_id: userId },
              },
            },
          },
        },
      });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Verify user has access to this message's chat
      if (message.chat.members.length === 0) {
        return res.status(403).json({ error: 'You do not have access to this message' });
      }

      messageText = message.message_text;
    }

    if (!messageText || !messageText.trim()) {
      return res.status(400).json({ error: 'text or message_id is required' });
    }

    // Translate the message
    const translation = await aiService.translateMessage(
      messageText,
      target_language,
      source_language
    );

    res.status(200).json({
      success: true,
      original_text: messageText,
      ...translation,
    });
  } catch (error) {
    console.error('Error in translateMessage:', error);
    res.status(500).json({ 
      error: 'Failed to translate message',
      details: error.message,
    });
  }
};

/**
 * Summarize conversation
 * POST /api/ai/summarize
 * Body: { chat_id: number, message_count?: number, summary_type?: 'brief'|'detailed'|'bullet' }
 */
exports.summarizeConversation = async (req, res) => {
  try {
    const { chat_id, message_count = 50, summary_type = 'brief' } = req.body;
    const userId = req.user.user_id; // From auth middleware

    if (!chat_id) {
      return res.status(400).json({ error: 'chat_id is required' });
    }

    // Verify user is a member of the chat
    const chatMember = await prisma.chatMember.findUnique({
      where: {
        chat_id_user_id: {
          chat_id: parseInt(chat_id),
          user_id: userId,
        },
      },
    });

    if (!chatMember) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    // Fetch messages to summarize
    const messages = await prisma.message.findMany({
      where: {
        chat_id: parseInt(chat_id),
        message_type: 'text', // Only summarize text messages
      },
      include: {
        sender: {
          select: {
            username: true,
            full_name: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: parseInt(message_count),
    });

    if (messages.length === 0) {
      return res.status(400).json({ 
        error: 'No messages found to summarize',
      });
    }

    // Format messages for AI service
    const formattedMessages = messages.reverse().map(msg => ({
      sender: msg.sender.username || msg.sender.full_name || 'User',
      text: msg.message_text,
      timestamp: msg.created_at,
    }));

    // Generate summary
    const summary = await aiService.summarizeConversation(
      formattedMessages,
      summary_type
    );

    res.status(200).json({
      success: true,
      chat_id: parseInt(chat_id),
      summary,
      summary_type,
      messages_analyzed: messages.length,
      time_range: {
        from: messages[0].created_at,
        to: messages[messages.length - 1].created_at,
      },
    });
  } catch (error) {
    console.error('Error in summarizeConversation:', error);
    res.status(500).json({ 
      error: 'Failed to summarize conversation',
      details: error.message,
    });
  }
};

/**
 * Detect language of text
 * POST /api/ai/detect-language
 * Body: { text: string }
 */
exports.detectLanguage = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }

    // Detect language
    const result = await aiService.detectLanguage(text);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error in detectLanguage:', error);
    res.status(500).json({ 
      error: 'Failed to detect language',
      details: error.message,
    });
  }
};

/**
 * Generate conversation starters
 * POST /api/ai/conversation-starters
 * Body: { chat_id: number }
 */
exports.generateConversationStarters = async (req, res) => {
  try {
    const { chat_id } = req.body;
    const userId = req.user.user_id; // From auth middleware

    if (!chat_id) {
      return res.status(400).json({ error: 'chat_id is required' });
    }

    // Fetch chat details
    const chat = await prisma.chat.findUnique({
      where: { chat_id: parseInt(chat_id) },
      include: {
        members: true,
      },
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Verify user is a member
    if (chat.members.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    recipientName = '';

    if(chat.chat_type == 'private') {
      const otherMember = chat.members.find(member => member.user_id !== userId);
      const otherUserId = otherMember ? otherMember.user_id : null;

      const users = await prisma.user.findUnique({
        where: { user_id: otherUserId },
        select: { full_name: true }
      });

      recipientName = users.full_name.split(' ')[0];
    }

    // Prepare context
    const context = {
      chatType: chat.is_group_chat ? 'group' : 'direct',
      chatName: chat.chat_name,
      recipientName: recipientName
    };

    // Generate starters
    const starters = await aiService.generateConversationStarters(context);

    res.status(200).json({
      success: true,
      chat_id: parseInt(chat_id),
      starters,
    });
  } catch (error) {
    console.error('Error in generateConversationStarters:', error);
    res.status(500).json({ 
      error: 'Failed to generate conversation starters',
      details: error.message,
    });
  }
};

/**
 * Check AI service status
 * GET /api/ai/status
 */
exports.checkStatus = async (req, res) => {
  try {
    const isConfigured = aiService.isConfigured();
    
    res.status(200).json({
      success: true,
      ai_enabled: isConfigured,
      features: isConfigured ? [
        'smart_replies',
        'translation',
        'summarization',
        'language_detection',
        'conversation_starters',
      ] : [],
      message: isConfigured 
        ? 'AI service is configured and ready (powered by Google Gemini)'
        : 'AI service is not configured. Please add GEMINI_API_KEY to environment variables.',
    });
  } catch (error) {
    console.error('Error checking AI status:', error);
    res.status(500).json({ 
      error: 'Failed to check AI service status',
      details: error.message,
    });
  }
};
