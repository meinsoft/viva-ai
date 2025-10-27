// DOM Selector Utilities

/**
 * Safely find element by CSS selector
 * @param {string} selector - CSS selector
 * @param {Document|Element} context - Context to search within
 * @returns {Element|null} Found element or null
 */
export function findElement(selector, context = document) {
  try {
    return context.querySelector(selector);
  } catch (error) {
    console.error('[Viva.AI] Invalid selector:', selector, error);
    return null;
  }
}

/**
 * Find all elements matching selector
 * @param {string} selector - CSS selector
 * @param {Document|Element} context - Context to search within
 * @returns {Element[]} Array of elements
 */
export function findAllElements(selector, context = document) {
  try {
    return Array.from(context.querySelectorAll(selector));
  } catch (error) {
    console.error('[Viva.AI] Invalid selector:', selector, error);
    return [];
  }
}

/**
 * Find element by text content
 * @param {string} text - Text to search for
 * @param {string} tagName - Optional tag name to filter by
 * @returns {Element|null} Found element or null
 */
export function findByText(text, tagName = '*') {
  const elements = Array.from(document.querySelectorAll(tagName));
  return elements.find(el => el.textContent.trim().includes(text)) || null;
}

/**
 * Get element's visible text
 * @param {Element} element - Element to extract text from
 * @returns {string} Visible text content
 */
export function getVisibleText(element) {
  if (!element) return '';
  return element.innerText || element.textContent || '';
}

/**
 * Check if element is visible
 * @param {Element} element - Element to check
 * @returns {boolean} True if element is visible
 */
export function isVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' &&
         style.visibility !== 'hidden' &&
         style.opacity !== '0';
}

export default {
  findElement,
  findAllElements,
  findByText,
  getVisibleText,
  isVisible
};
