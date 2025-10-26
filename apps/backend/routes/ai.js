// AI Intent Processing Routes
import express from 'express';
import { intentPrompt } from '@viva-ai/prompts/intent_prompt.js';
import { planPrompt } from '@viva-ai/prompts/plan_prompt.js';
import { validateIntent, validateIntentResponse } from '@viva-ai/schemas/intent_schema.js';
import { validatePlan, normalizePlan } from '@viva-ai/schemas/plan_schema.js';
import { logger } from '@viva-ai/utils/logger.js';
import { extractJson } from '@viva-ai/utils/json.js';
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

    // Parse the AI response (use extractJson to handle markdown fences)
    let intentResponse;
    if (typeof result.text === 'string') {
      intentResponse = extractJson(result.text);
      if (!intentResponse) {
        logger.error('Failed to extract JSON from AI intent response:', result.text);
        return res.status(500).json({ error: 'Invalid intent format from AI (no JSON found)' });
      }
    } else {
      intentResponse = result;
    }

    // Validate intent response structure
    const responseValidation = validateIntentResponse(intentResponse);
    if (!responseValidation.valid) {
      logger.error('Invalid intent response structure:', responseValidation.errors);
      return res.status(500).json({ error: 'AI generated invalid intent', details: responseValidation.errors });
    }

    res.json({
      success: true,
      intent: intentResponse.intent,
      language: intentResponse.language,
      confidence: intentResponse.confidence,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error processing intent:', error);
    res.status(500).json({ error: 'Failed to process intent', message: error.message });
  }
});

// POST /ai/plan - Generate action plan based on classified intent
router.post('/plan', async (req, res) => {
  try {
    const { intent, utterance, pageMap, memory } = req.body;

    logger.info('Planning actions:', { intent, utterance, pageMap, memory });

    // Validate input
    if (!intent || typeof intent !== 'string') {
      return res.status(400).json({ error: 'Intent is required and must be a string' });
    }

    if (!utterance || typeof utterance !== 'string') {
      return res.status(400).json({ error: 'Utterance is required and must be a string' });
    }

    // Build prompt using shared template
    const prompt = planPrompt(intent, utterance, pageMap, memory);

    // Try Chrome Built-in AI first, fallback to Gemini
    let result;
    try {
      result = await processWithChromeAI(prompt);
      logger.info('Plan generated with Chrome Built-in AI');
    } catch (chromeError) {
      logger.warn('Chrome AI unavailable, falling back to Gemini:', chromeError.message);
      result = await processWithGemini(prompt);
      logger.info('Plan generated with Gemini API');
    }

    // Parse the AI response (use extractJson to handle markdown fences)
    let plan;
    if (typeof result.text === 'string') {
      plan = extractJson(result.text);
      if (!plan) {
        logger.error('Failed to extract JSON from AI plan response:', result.text);
        return res.status(500).json({ error: 'Invalid plan format from AI (no JSON found)' });
      }
    } else {
      plan = result;
    }

    // Normalize plan (FULL TRUST MODE: set confirmation:false, ensure speak/confidence)
    plan = normalizePlan(plan);
    logger.info('Plan normalized for FULL TRUST MODE');

    // Validate plan structure
    const validation = validatePlan(plan);
    if (!validation.valid) {
      logger.error('Invalid plan structure:', validation.errors);
      return res.status(500).json({ error: 'AI generated invalid plan', details: validation.errors });
    }

    // Inject ANNOUNCE action if informational intent without one
    const informationalIntents = ['page_insight', 'summarize', 'vision_describe', 'search', 'answer_question', 'youtube_search'];
    if (informationalIntents.includes(intent)) {
      const hasAnnounce = plan.actions.some(a => a.type === 'ANNOUNCE');
      if (!hasAnnounce && plan.speak) {
        // Auto-inject ANNOUNCE using speak field
        plan.actions.unshift({
          type: 'ANNOUNCE',
          confirmation: false,
          value: plan.speak
        });
        logger.info('Auto-injected ANNOUNCE action for informational intent');
      }
    }

    res.json({
      success: true,
      plan,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error generating plan:', error);
    res.status(500).json({ error: 'Failed to generate plan', message: error.message });
  }
});

export default router;
