// AI Intent Processing Routes
import express from 'express';
import { intentPrompt } from '@viva-ai/prompts/intent_prompt.js';
import { validateIntent } from '@viva-ai/schemas/intent_schema.js';
import { logger } from '@viva-ai/utils/logger.js';
import { processWithChromeAI, processWithGemini } from '../services/ai_orchestrator.js';

const router = express.Router();

// POST /ai/intent - Process user intent with AI orchestration
router.post('/intent', async (req, res) => {
  try {
    const { utterance, pageMap, memory, locale } = req.body;

    logger.info('Processing intent:', { utterance, pageMap, memory, locale });

    // Validate intent schema
    const validation = validateIntent({ utterance, pageMap, memory, locale });
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid intent', details: validation.errors });
    }

    // Build prompt using shared template
    const prompt = intentPrompt(utterance, pageMap, memory, locale);

    // Try Chrome Built-in AI first, fallback to Gemini
    let result;
    try {
      result = await processWithChromeAI(prompt);
      logger.info('Processed with Chrome Built-in AI');
    } catch (chromeError) {
      logger.warn('Chrome AI unavailable, falling back to Gemini:', chromeError.message);
      result = await processWithGemini(prompt);
      logger.info('Processed with Gemini API');
    }

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error processing intent:', error);
    res.status(500).json({ error: 'Failed to process intent', message: error.message });
  }
});

export default router;
