const express = require('express');
const router = express.Router();
const aiController = require('../controller/ai.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// All AI routes require authentication
router.use(verifyToken);

/**
 * @route   POST /api/ai/smart-replies
 * @desc    Generate smart reply suggestions based on chat context
 * @access  Private
 * @body    { chat_id: number, limit?: number }
 */
router.post('/smart-replies', aiController.generateSmartReplies);

/**
 * @route   POST /api/ai/translate
 * @desc    Translate a message to another language
 * @access  Private
 * @body    { message_id?: number, text?: string, target_language: string, source_language?: string }
 */
router.post('/translate', aiController.translateMessage);

/**
 * @route   POST /api/ai/summarize
 * @desc    Summarize a conversation in a chat
 * @access  Private
 * @body    { chat_id: number, message_count?: number, summary_type?: 'brief'|'detailed'|'bullet' }
 */
router.post('/summarize', aiController.summarizeConversation);

/**
 * @route   POST /api/ai/detect-language
 * @desc    Detect the language of given text
 * @access  Private
 * @body    { text: string }
 */
router.post('/detect-language', aiController.detectLanguage);

/**
 * @route   POST /api/ai/conversation-starters
 * @desc    Generate conversation starter suggestions
 * @access  Private
 * @body    { chat_id: number }
 */
router.post('/conversation-starters', aiController.generateConversationStarters);

/**
 * @route   GET /api/ai/status
 * @desc    Check AI service configuration status
 * @access  Private
 */
router.get('/status', aiController.checkStatus);

module.exports = router;
