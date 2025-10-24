// Plan Schema - Validates action plan structure

export const actionTypes = [
  'SCROLL_TO',
  'CLICK',
  'SUMMARIZE',
  'DESCRIBE',
  'ANNOUNCE',
  'FILL',
  'NAVIGATE'
];

export const planSchema = {
  type: 'object',
  required: ['actions', 'speak'],
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type'],
        properties: {
          type: {
            type: 'string',
            enum: actionTypes
          },
          target: {
            type: 'object',
            properties: {
              selector: { type: 'string' },
              metadata: { type: 'object' }
            }
          },
          value: {
            type: 'string',
            description: 'Value for FILL or ANNOUNCE actions'
          },
          confirmation: {
            type: 'boolean',
            description: 'Whether user confirmation is required before execution'
          }
        }
      }
    },
    speak: {
      type: 'string',
      description: 'Short voice response to user (max 1 sentence)'
    }
  }
};

/**
 * Validate action plan structure
 * @param {object} plan - Plan data to validate
 * @returns {object} { valid: boolean, errors: array }
 */
export function validatePlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== 'object') {
    errors.push('Plan must be an object');
    return { valid: false, errors };
  }

  if (!Array.isArray(plan.actions)) {
    errors.push('Plan.actions must be an array');
  } else {
    // Validate each action
    plan.actions.forEach((action, index) => {
      if (!action.type || !actionTypes.includes(action.type)) {
        errors.push(`Action ${index}: type must be one of ${actionTypes.join(', ')}`);
      }

      // FILL and ANNOUNCE require a value
      if (['FILL', 'ANNOUNCE'].includes(action.type) && !action.value) {
        errors.push(`Action ${index}: ${action.type} requires a value`);
      }

      // Actions that target elements should have a target
      if (['SCROLL_TO', 'CLICK', 'FILL'].includes(action.type) && !action.target) {
        errors.push(`Action ${index}: ${action.type} requires a target`);
      }

      // Confirmation should be boolean if present
      if (action.confirmation !== undefined && typeof action.confirmation !== 'boolean') {
        errors.push(`Action ${index}: confirmation must be a boolean`);
      }
    });
  }

  if (!plan.speak || typeof plan.speak !== 'string') {
    errors.push('Plan.speak must be a non-empty string');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check if a plan requires user confirmation
 * @param {object} plan - Action plan
 * @returns {boolean} True if any action requires confirmation
 */
export function requiresConfirmation(plan) {
  if (!plan || !Array.isArray(plan.actions)) return false;
  return plan.actions.some(action => action.confirmation === true);
}

export default planSchema;
