// Action Schema - Validates AI-generated actions before execution

export const actionTypes = [
  'scroll',
  'click',
  'fill',
  'navigate',
  'extract',
  'highlight',
  'read'
];

export const safetyLevels = [
  'safe',
  'requires_confirmation',
  'blocked'
];

export const actionSchema = {
  type: 'object',
  required: ['type', 'description'],
  properties: {
    type: {
      type: 'string',
      enum: actionTypes,
      description: 'Type of action to perform'
    },
    target: {
      type: 'string',
      description: 'CSS selector or target description'
    },
    value: {
      type: 'string',
      description: 'Value for fill/input actions'
    },
    description: {
      type: 'string',
      description: 'Human-readable action description'
    }
  }
};

/**
 * Validate action structure
 * @param {object} action - Action to validate
 * @returns {object} { valid: boolean, errors: array }
 */
export function validateAction(action) {
  const errors = [];

  if (!action || typeof action !== 'object') {
    errors.push('Action must be an object');
    return { valid: false, errors };
  }

  if (!action.type || !actionTypes.includes(action.type)) {
    errors.push(`Action type must be one of: ${actionTypes.join(', ')}`);
  }

  if (!action.description || typeof action.description !== 'string') {
    errors.push('Action must have a description');
  }

  // Actions that modify the page require a target
  if (['click', 'fill', 'highlight'].includes(action.type) && !action.target) {
    errors.push(`Action type "${action.type}" requires a target`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default actionSchema;
