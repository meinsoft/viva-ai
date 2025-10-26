// Intent Schema - Validates user intent and context structure for accessibility-first AI

export const intentSchema = {
  type: 'object',
  required: ['utterance'],
  properties: {
    utterance: {
      type: 'string',
      minLength: 1,
      description: 'User\'s voice input (exact transcription)'
    },
    pageMap: {
      type: 'object',
      description: 'Structured page content (headings, buttons, forms, etc.)'
    },
    memory: {
      type: 'object',
      description: 'User preferences, mode, recent context'
    },
    locale: {
      type: 'string',
      description: 'User language code (az, en, tr, etc.)',
      default: 'az'
    }
  }
};

/**
 * Validate intent request structure
 * @param {object} data - Intent data to validate
 * @returns {object} { valid: boolean, errors: array }
 */
export function validateIntent(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('Intent data must be an object');
    return { valid: false, errors };
  }

  if (!data.utterance || typeof data.utterance !== 'string' || data.utterance.trim().length === 0) {
    errors.push('Utterance must be a non-empty string');
  }

  if (data.pageMap && typeof data.pageMap !== 'object') {
    errors.push('PageMap must be an object if provided');
  }

  if (data.memory && typeof data.memory !== 'object') {
    errors.push('Memory must be an object if provided');
  }

  if (data.locale && typeof data.locale !== 'string') {
    errors.push('Locale must be a string if provided');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate intent response from AI
 * @param {object} response - AI intent response to validate
 * @returns {object} { valid: boolean, errors: array }
 */
export function validateIntentResponse(response) {
  const errors = [];

  if (!response || typeof response !== 'object') {
    errors.push('Intent response must be an object');
    return { valid: false, errors };
  }

  const validIntents = [
    'page_insight',
    'search',
    'summarize',
    'vision_describe',
    'interact_click',
    'interact_scroll',
    'interact_fill',
    'navigate',
    'tab_switch',
    'unknown'
  ];

  if (!response.intent || !validIntents.includes(response.intent)) {
    errors.push(`Intent must be one of: ${validIntents.join(', ')}`);
  }

  if (!response.language || typeof response.language !== 'string') {
    errors.push('Language must be a non-empty string (ISO 639-1 code)');
  }

  if (response.confidence === undefined || typeof response.confidence !== 'number') {
    errors.push('Confidence must be a number');
  } else if (response.confidence < 0.0 || response.confidence > 1.0) {
    errors.push('Confidence must be between 0.0 and 1.0');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default intentSchema;
