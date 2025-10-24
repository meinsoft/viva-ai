// Viva.AI Content Script - DOM awareness and safe action execution

console.log('[Viva.AI] Content script loaded');

// Detect first <h1> on page
function detectPageHeading() {
  const firstH1 = document.querySelector('h1');
  if (firstH1) {
    console.log('[Viva.AI] First H1 detected:', firstH1.textContent);
    return firstH1.textContent;
  } else {
    console.log('[Viva.AI] No H1 found on page');
    return null;
  }
}

// Safe mode confirmation wrapper
function requireConfirmation(action, actionDescription) {
  return new Promise((resolve) => {
    const userConfirmed = confirm(`[Viva.AI SAFE MODE]\n\n${actionDescription}\n\nAllow this action?`);
    if (userConfirmed) {
      resolve(action());
    } else {
      console.log('[Viva.AI] Action cancelled by user');
      resolve(null);
    }
  });
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Viva.AI] Message received:', message);

  if (message.type === 'GET_PAGE_CONTEXT') {
    const heading = detectPageHeading();
    sendResponse({
      heading,
      url: window.location.href,
      title: document.title
    });
  }

  if (message.type === 'EXECUTE_ACTION') {
    const action = message.action;

    // Check if action requires confirmation
    if (action.confirmation === true) {
      // Require user confirmation before executing
      requireConfirmation(
        () => executeAction(action),
        action.value || action.type || 'Execute AI-generated action'
      ).then(result => {
        if (result) {
          sendResponse({ success: true, result });
        } else {
          sendResponse({ success: false, cancelled: true, message: 'User cancelled action' });
        }
      });
    } else {
      // Execute immediately without confirmation
      try {
        const result = executeAction(action);
        sendResponse({ success: true, result });
      } catch (error) {
        console.error('[Viva.AI] Error executing action:', error);
        sendResponse({ success: false, error: error.message });
      }
    }

    return true; // Keep channel open for async response
  }

  return false;
});

// Execute DOM actions safely
function executeAction(action) {
  console.log('[Viva.AI] Executing action:', action);

  try {
    switch (action.type) {
      case 'SCROLL_TO':
        return executeScrollTo(action);

      case 'CLICK':
        return executeClick(action);

      case 'FILL':
        return executeFill(action);

      case 'ANNOUNCE':
        return executeAnnounce(action);

      case 'SUMMARIZE':
      case 'DESCRIBE':
        // These are informational actions, return success
        return { executed: true, type: action.type, message: 'Informational action completed' };

      case 'NAVIGATE':
        return executeNavigate(action);

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  } catch (error) {
    console.error('[Viva.AI] Action execution error:', error);
    throw error;
  }
}

// SCROLL_TO: Scroll to a specific element or position
function executeScrollTo(action) {
  try {
    if (action.target && action.target.selector) {
      // Scroll to specific element
      const element = document.querySelector(action.target.selector);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { executed: true, type: 'SCROLL_TO', target: action.target.selector };
      } else {
        throw new Error(`Element not found: ${action.target.selector}`);
      }
    } else {
      // Scroll down by viewport height
      window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
      return { executed: true, type: 'SCROLL_TO', scrolled: 'down' };
    }
  } catch (error) {
    throw new Error(`SCROLL_TO failed: ${error.message}`);
  }
}

// CLICK: Click an element
function executeClick(action) {
  try {
    if (!action.target || !action.target.selector) {
      throw new Error('CLICK action requires a target selector');
    }

    const element = document.querySelector(action.target.selector);
    if (!element) {
      throw new Error(`Element not found: ${action.target.selector}`);
    }

    // Check if element is visible and clickable
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      throw new Error('Element is not visible');
    }

    element.click();
    console.log('[Viva.AI] Clicked element:', action.target.selector);

    return { executed: true, type: 'CLICK', target: action.target.selector };
  } catch (error) {
    throw new Error(`CLICK failed: ${error.message}`);
  }
}

// FILL: Fill an input or textarea
function executeFill(action) {
  try {
    if (!action.target || !action.target.selector) {
      throw new Error('FILL action requires a target selector');
    }

    if (!action.value) {
      throw new Error('FILL action requires a value');
    }

    const element = document.querySelector(action.target.selector);
    if (!element) {
      throw new Error(`Element not found: ${action.target.selector}`);
    }

    // Check if element is an input or textarea
    const tagName = element.tagName.toLowerCase();
    if (tagName !== 'input' && tagName !== 'textarea') {
      throw new Error(`Element is not an input or textarea: ${tagName}`);
    }

    // Set value
    element.value = action.value;

    // Trigger input event for React/Vue compatibility
    const inputEvent = new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);

    const changeEvent = new Event('change', { bubbles: true });
    element.dispatchEvent(changeEvent);

    console.log('[Viva.AI] Filled element:', action.target.selector, 'with:', action.value);

    return { executed: true, type: 'FILL', target: action.target.selector, value: action.value };
  } catch (error) {
    throw new Error(`FILL failed: ${error.message}`);
  }
}

// ANNOUNCE: Use SpeechSynthesis to speak text
function executeAnnounce(action) {
  try {
    if (!action.value) {
      throw new Error('ANNOUNCE action requires a value');
    }

    // Check if SpeechSynthesis is available
    if (!window.speechSynthesis) {
      throw new Error('SpeechSynthesis not available in this browser');
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Create utterance
    const utterance = new SpeechSynthesisUtterance(action.value);
    utterance.lang = 'az-AZ'; // Default to Azerbaijani
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Speak
    window.speechSynthesis.speak(utterance);

    console.log('[Viva.AI] Announcing:', action.value);

    return { executed: true, type: 'ANNOUNCE', value: action.value };
  } catch (error) {
    throw new Error(`ANNOUNCE failed: ${error.message}`);
  }
}

// NAVIGATE: Navigate to a URL (requires confirmation)
function executeNavigate(action) {
  try {
    if (!action.value) {
      throw new Error('NAVIGATE action requires a URL value');
    }

    // Validate URL
    let url;
    try {
      url = new URL(action.value, window.location.origin);
    } catch (e) {
      throw new Error(`Invalid URL: ${action.value}`);
    }

    // Navigate
    window.location.href = url.href;

    console.log('[Viva.AI] Navigating to:', url.href);

    return { executed: true, type: 'NAVIGATE', url: url.href };
  } catch (error) {
    throw new Error(`NAVIGATE failed: ${error.message}`);
  }
}

// Initialize
detectPageHeading();
