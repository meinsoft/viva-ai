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

export default intentSchema;
