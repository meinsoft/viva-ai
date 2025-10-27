// Logger Utility

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

/**
 * Simple logger for consistent logging across the application
 */
export const logger = {
  /**
   * Log error message
   */
  error(...args) {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      console.error('[VIVA.AI ERROR]', new Date().toISOString(), ...args);
    }
  },

  /**
   * Log warning message
   */
  warn(...args) {
    if (currentLevel >= LOG_LEVELS.WARN) {
      console.warn('[VIVA.AI WARN]', new Date().toISOString(), ...args);
    }
  },

  /**
   * Log info message
   */
  info(...args) {
    if (currentLevel >= LOG_LEVELS.INFO) {
      console.log('[VIVA.AI INFO]', new Date().toISOString(), ...args);
    }
  },

  /**
   * Log debug message
   */
  debug(...args) {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      console.log('[VIVA.AI DEBUG]', new Date().toISOString(), ...args);
    }
  }
};

export default logger;
