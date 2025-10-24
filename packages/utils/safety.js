// Safety Utilities - Validate and sanitize actions

/**
 * Determine if an action is safe to execute without confirmation
 * @param {object} action - Action to evaluate
 * @returns {boolean} True if safe, false if requires confirmation
 */
export function isSafeAction(action) {
  if (!action || !action.type) return false;

  // Safe actions that don't modify the page
  const safeActionTypes = ['scroll', 'extract', 'read', 'navigate'];

  if (safeActionTypes.includes(action.type)) {
    return true;
  }

  // Potentially destructive actions require confirmation
  const destructiveActionTypes = ['click', 'fill', 'submit', 'delete'];

  return !destructiveActionTypes.includes(action.type);
}

/**
 * Check if a URL is safe to navigate to
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is safe
 */
export function isSafeURL(url) {
  if (!url || typeof url !== 'string') return false;

  try {
    const parsed = new URL(url);

    // Block dangerous protocols
    const blockedProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
    if (blockedProtocols.some(protocol => parsed.protocol === protocol)) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Sanitize user input to prevent XSS
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';

  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Check if selector is safe (no dangerous patterns)
 * @param {string} selector - CSS selector to validate
 * @returns {boolean} True if selector appears safe
 */
export function isSafeSelector(selector) {
  if (!selector || typeof selector !== 'string') return false;

  // Block selectors that might be used maliciously
  const dangerousPatterns = [
    /javascript:/i,
    /on\w+=/i,  // Event handlers
    /<script/i
  ];

  return !dangerousPatterns.some(pattern => pattern.test(selector));
}

export default {
  isSafeAction,
  isSafeURL,
  sanitizeInput,
  isSafeSelector
};
