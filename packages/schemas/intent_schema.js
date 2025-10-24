// Intent Schema - Validates user intent and context structure

export const intentSchema = {
  type: 'object',
  required: ['intent'],
  properties: {
    intent: {
      type: 'string',
      minLength: 1,
      description: 'User\'s natural language request'
    },
    context: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        title: { type: 'string' },
        heading: { type: 'string' }
      }
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

  if (!data.intent || typeof data.intent !== 'string' || data.intent.trim().length === 0) {
    errors.push('Intent must be a non-empty string');
  }

  if (data.context && typeof data.context !== 'object') {
    errors.push('Context must be an object if provided');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default intentSchema;
