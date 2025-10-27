// Plan Schema - Validates action plan structure

export const actionTypes = [
  'SCROLL_TO',
  'CLICK',
  'SUMMARIZE',
  'DESCRIBE',
  'ANNOUNCE',
  'FILL',
  'NAVIGATE',
  'TAB_SWITCH',
  'SEARCH',
  'ANSWER_QUESTION',
  'YOUTUBE_SEARCH',
  'YOUTUBE_SELECT',
  'YOUTUBE_CONTROL'
];

export const planSchema = {
  type: 'object',
  required: ['actions', 'speak', 'confidence'],
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
    },
    confidence: {
      type: 'number',
      minimum: 0.0,
      maximum: 1.0,
      description: 'Confidence score between 0.0 and 1.0'
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

      // NAVIGATE and TAB_SWITCH require a value
      if (['NAVIGATE', 'TAB_SWITCH'].includes(action.type) && !action.value) {
        errors.push(`Action ${index}: ${action.type} requires a value`);
      }

      // CLICK and FILL require a target (SCROLL_TO is optional)
      if (['CLICK', 'FILL'].includes(action.type) && !action.target) {
        errors.push(`Action ${index}: ${action.type} requires a target`);
      }

      // Confirmation should be boolean if present
      if (action.confirmation !== undefined && typeof action.confirmation !== 'boolean') {
        errors.push(`Action ${index}: confirmation must be a boolean`);
      }

      // FULL TRUST MODE: Default all confirmations to false if undefined
      if (action.confirmation === undefined) {
        action.confirmation = false;
      }
    });
  }

  if (!plan.speak || typeof plan.speak !== 'string') {
    errors.push('Plan.speak must be a non-empty string');
  }

  if (plan.confidence === undefined || typeof plan.confidence !== 'number') {
    errors.push('Plan.confidence must be a number');
  } else if (plan.confidence < 0.0 || plan.confidence > 1.0) {
    errors.push('Plan.confidence must be between 0.0 and 1.0');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Normalize plan to FULL TRUST MODE defaults
 * @param {object} plan - Raw plan from AI
 * @returns {object} Normalized plan
 */
export function normalizePlan(plan) {
  if (!plan || !Array.isArray(plan.actions)) {
    return plan;
  }

  // Ensure all actions have confirmation:false by default
  plan.actions.forEach(action => {
    if (action.confirmation === undefined) {
      action.confirmation = false;
    }
  });

  // Ensure speak and confidence exist
  if (!plan.speak) {
    plan.speak = "Action completed.";
  }
  if (plan.confidence === undefined) {
    plan.confidence = 0.8;
  }

  return plan;
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
