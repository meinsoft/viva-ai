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

// POST /ai/clarify - Conversational AI layer that thinks before acting
router.post('/clarify', async (req, res) => {
  try {
    const { utterance, pageMap, memory, locale } = req.body;

    logger.info('Conversational AI analyzing:', { utterance, locale });

    if (!utterance || typeof utterance !== 'string' || utterance.trim().length === 0) {
      return res.status(400).json({ error: 'Utterance is required' });
    }

    // Build conversational analysis prompt
    const prompt = `You are Viva.AI, an intelligent conversational assistant for blind and visually impaired users.

Your job is to THINK BEFORE ACTING. Analyze if the user's request makes sense and if you need clarification.

**CONTEXT:**
- User said: "${utterance}"
- Current page: ${pageMap?.title || 'Unknown page'}
- Page URL: ${pageMap?.url || 'Unknown'}
- Page type: ${pageMap?.pageType || 'general'}
- Recent conversation: ${memory?.recentConversation ? JSON.stringify(memory.recentConversation.slice(-3)) : 'None'}

**YOUR TASK:**
Analyze if this utterance is:
1. CLEAR - Makes complete sense, you know exactly what to do
2. VAGUE - Somewhat unclear, but you can infer the intent with reasonable confidence
3. UNCLEAR - Confusing or nonsensical, needs clarification

**DECISION RULES:**

CLEAR (confidence >= 0.8):
- Specific commands: "scroll down", "summarize this page", "search for how to grow carrots"
- Navigation: "go to youtube", "open instagram"
- Clear questions: "what is this article about?", "how do I water plants?"
- YouTube controls: "play the video", "pause", "next video"

VAGUE (confidence 0.5-0.8):
- Generic searches that might be incomplete: "search for it", "find that"
- Pronouns without clear antecedent: "open it", "tell me about this"
- Partial commands: "search", "find"

UNCLEAR (confidence < 0.5):
- Nonsensical: "asdfgh", "blah blah", random words
- Incomplete fragments: "how to", "I want"
- Recognition errors that don't make sense in context
- Too vague to act on: "do something", "help me"

**OUTPUT FORMAT:**
Return ONLY raw JSON:
{
  "clarity": "clear" | "vague" | "unclear",
  "confidence": 0.0-1.0,
  "inferredIntent": "brief description of what you think they want",
  "needsClarification": true | false,
  "clarificationQuestion": "What do you want me to search for?" (only if needsClarification is true),
  "reasoning": "brief explanation of your analysis"
}

**EXAMPLES:**

Input: "search for how to grow carrots at home"
Output: {"clarity":"clear","confidence":0.95,"inferredIntent":"User wants to perform web search for carrot growing instructions","needsClarification":false,"clarificationQuestion":null,"reasoning":"Specific search query with clear intent"}

Input: "search for it"
Output: {"clarity":"vague","confidence":0.6,"inferredIntent":"User wants to search but subject is unclear from context","needsClarification":true,"clarificationQuestion":"What would you like me to search for?","reasoning":"Pronoun 'it' has no clear antecedent in recent conversation"}

Input: "blah blah something"
Output: {"clarity":"unclear","confidence":0.2,"inferredIntent":"Unclear speech recognition or random input","needsClarification":true,"clarificationQuestion":"I didn't understand that. Could you please repeat what you'd like me to do?","reasoning":"Utterance appears nonsensical or is speech recognition error"}

Input: "summarize this page"
Output: {"clarity":"clear","confidence":0.98,"inferredIntent":"User wants AI summary of current page content","needsClarification":false,"clarificationQuestion":null,"reasoning":"Clear command with specific action"}

NOW ANALYZE THIS INPUT AND RETURN ONLY RAW JSON:`;

    // Use Gemini to analyze
    const result = await processWithGemini(prompt);

    let analysis;
    if (typeof result.text === 'string') {
      analysis = extractJson(result.text);
      if (!analysis) {
        logger.error('Failed to extract JSON from clarify response:', result.text);
        // Fallback: assume clear
        analysis = {
          clarity: 'clear',
          confidence: 0.7,
          inferredIntent: 'Proceeding with user request',
          needsClarification: false,
          clarificationQuestion: null,
          reasoning: 'AI analysis failed, assuming clear intent'
        };
      }
    } else {
      throw new Error('Invalid AI response format');
    }

    logger.info('Conversational analysis result:', analysis);

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in conversational AI:', error);
    // Fallback: assume clear to avoid blocking user
    res.json({
      success: true,
      analysis: {
        clarity: 'clear',
        confidence: 0.7,
        inferredIntent: 'Proceeding with user request',
        needsClarification: false,
        clarificationQuestion: null,
        reasoning: 'Error in analysis, proceeding anyway'
      },
      timestamp: new Date().toISOString()
    });
  }
});

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

// POST /ai/search-analyze - Intelligent search that analyzes and recommends results
router.post('/search-analyze', async (req, res) => {
  try {
    const { query } = req.body;

    logger.info('Intelligent search for:', { query });

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Note: In production, you'd actually scrape Google results here
    // For now, we'll simulate intelligent search analysis
    // TODO: Add actual Google search scraping using a service or API

    const prompt = `You are Viva.AI, an intelligent search assistant for blind users.

The user wants to search for: "${query}"

**YOUR TASK:**
1. Analyze this search query
2. Predict what kind of sources would be most helpful
3. Recommend search strategy

**OUTPUT FORMAT:**
Return ONLY raw JSON:
{
  "analysis": "brief analysis of what user is looking for",
  "recommendedSourceTypes": ["article", "tutorial", "video", "documentation"],
  "searchRefinements": ["alternative search term 1", "alternative search term 2"],
  "expectedResultCount": "estimated number like '10-50'",
  "voiceAnnouncement": "What you will say to the user about the search"
}

**EXAMPLE:**

Input: "how to grow carrots at home"
Output: {
  "analysis": "User wants practical gardening instructions for growing carrots in a home setting",
  "recommendedSourceTypes": ["tutorial", "article", "video"],
  "searchRefinements": ["beginner carrot growing guide", "home vegetable gardening carrots"],
  "expectedResultCount": "20-30",
  "voiceAnnouncement": "I found several helpful guides on growing carrots at home. I see tutorials from gardening websites, step-by-step articles, and instructional videos. Would you like me to open the top-rated beginner's guide?"
}

NOW ANALYZE THIS QUERY AND RETURN ONLY RAW JSON:`;

    // Use Gemini to analyze search
    const result = await processWithGemini(prompt);

    let searchAnalysis;
    if (typeof result.text === 'string') {
      searchAnalysis = extractJson(result.text);
      if (!searchAnalysis) {
        logger.error('Failed to extract JSON from search analysis:', result.text);
        searchAnalysis = {
          analysis: `Searching for: ${query}`,
          recommendedSourceTypes: ['article', 'website'],
          searchRefinements: [],
          expectedResultCount: '10-20',
          voiceAnnouncement: `I'll search for ${query} and find the best results for you.`
        };
      }
    } else {
      throw new Error('Invalid AI response format');
    }

    logger.info('Search analysis complete:', searchAnalysis);

    // Generate search URL
    const searchURL = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    res.json({
      success: true,
      query,
      searchURL,
      analysis: searchAnalysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error analyzing search:', error);
    res.status(500).json({ error: 'Failed to analyze search', message: error.message });
  }
});

export default router;
