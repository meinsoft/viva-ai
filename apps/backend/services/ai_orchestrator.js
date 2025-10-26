// AI Orchestration Service - Chrome Built-in AI + Gemini fallback
import { logger } from '@viva-ai/utils/logger.js';
import { httpClient } from '@viva-ai/utils/http.js';

// Chrome Built-in AI processing (server-side placeholder)
export async function processWithChromeAI(prompt) {
  // Note: Chrome Built-in AI is client-side only
  // This is a placeholder for server-side orchestration logic
  throw new Error('Chrome Built-in AI not available on server-side');
}

// Gemini API processing
export async function processWithGemini(prompt) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Use gemini-2.5-flash model
  const model = 'models/gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Gemini API HTTP error:', response.status, errorText);
      throw new Error(`Gemini API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      logger.error('Invalid Gemini response structure:', data);
      throw new Error('Invalid response from Gemini API');
    }

    return {
      text,
      model,
      provider: 'google'
    };

  } catch (error) {
    logger.error('Gemini API error:', error);
    throw new Error(`Gemini processing failed: ${error.message}`);
  }
}
