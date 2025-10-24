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
    // Safe mode - require confirmation before executing
    requireConfirmation(
      () => executeAction(message.action),
      message.action.description || 'Execute AI-generated action'
    ).then(result => sendResponse({ success: true, result }));
    return true; // Keep channel open for async response
  }

  return false;
});

// Execute safe DOM actions
function executeAction(action) {
  console.log('[Viva.AI] Executing action:', action);
  // Stub for action execution logic
  return { executed: true, action: action.type };
}

// Initialize
detectPageHeading();
