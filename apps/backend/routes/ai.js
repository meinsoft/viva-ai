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

// POST /ai/summarize - Generate summary of page content using AI
router.post('/summarize', async (req, res) => {
  try {
    const { content, url, title } = req.body;

    logger.info('Summarizing content:', { url, title, contentLength: content?.length });

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required and must be a non-empty string' });
    }

    // Build prompt for summarization
    const prompt = `You are Viva.AI, an intelligent assistant for blind and visually impaired users.

Your task is to summarize the following article/page content in a clear, concise, and accessible way.

**REQUIREMENTS:**
1. Create a summary that is 3-5 sentences long
2. Focus on the main points and key takeaways
3. Use natural, conversational language
4. Highlight any important facts, data, or conclusions
5. Make it easy to understand when read aloud

**PAGE INFORMATION:**
Title: ${title || 'Unknown'}
URL: ${url || 'Unknown'}

**CONTENT TO SUMMARIZE:**
${content}

**YOUR SUMMARY:**`;

    // Use Gemini to generate summary
    const result = await processWithGemini(prompt);

    let summary;
    if (typeof result.text === 'string') {
      summary = result.text.trim();
    } else {
      throw new Error('Invalid AI response format');
    }

    logger.info('Summary generated:', { summaryLength: summary.length });

    res.json({
      success: true,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate summary', message: error.message });
  }
});

// POST /ai/answer - Answer question about page content using AI
router.post('/answer', async (req, res) => {
  try {
    const { question, content, url, title } = req.body;

    logger.info('Answering question:', { question, url, title, contentLength: content?.length });

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required and must be a non-empty string' });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required and must be a non-empty string' });
    }

    // Build prompt for Q&A
    const prompt = `You are Viva.AI, an intelligent assistant for blind and visually impaired users.

Your task is to answer the user's question based on the page content provided.

**REQUIREMENTS:**
1. Answer the question directly and concisely (2-3 sentences)
2. Use only information from the provided content
3. If the answer is not in the content, say "I couldn't find that information on this page"
4. Use natural, conversational language
5. Make it easy to understand when read aloud

**PAGE INFORMATION:**
Title: ${title || 'Unknown'}
URL: ${url || 'Unknown'}

**USER'S QUESTION:**
${question}

**PAGE CONTENT:**
${content}

**YOUR ANSWER:**`;

    // Use Gemini to generate answer
    const result = await processWithGemini(prompt);

    let answer;
    if (typeof result.text === 'string') {
      answer = result.text.trim();
    } else {
      throw new Error('Invalid AI response format');
    }

    logger.info('Answer generated:', { answerLength: answer.length });

    res.json({
      success: true,
      answer,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error generating answer:', error);
    res.status(500).json({ error: 'Failed to generate answer', message: error.message });
  }
});

export default router;
