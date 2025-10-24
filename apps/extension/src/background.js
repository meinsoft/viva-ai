// Viva.AI Background Service Worker

console.log('[Viva.AI] Background service worker started');

const BACKEND_URL = 'http://localhost:5000';

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[Viva.AI] Extension icon clicked on tab:', tab.id);

  // Get page context from content script
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
    console.log('[Viva.AI] Page context:', response);
  } catch (error) {
    console.error('[Viva.AI] Error getting page context:', error);
  }
});

// Handle messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Viva.AI] Background received message:', message);

  if (message.type === 'PROCESS_INTENT') {
    processIntent(message.utterance, message.pageMap, message.memory, message.locale)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep channel open for async response
  }

  return false;
});

// Send intent to backend for AI processing
async function processIntent(utterance, pageMap, memory = {}, locale = 'az') {
  try {
    const response = await fetch(`${BACKEND_URL}/ai/intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ utterance, pageMap, memory, locale })
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Viva.AI] Error processing intent:', error);
    return { error: error.message };
  }
}

// Initialize Chrome Built-in AI (if available)
async function initializeBuiltInAI() {
  if ('ai' in self) {
    console.log('[Viva.AI] Chrome Built-in AI detected');
    // Future: Initialize summarizer, language detector, etc.
  } else {
    console.log('[Viva.AI] Chrome Built-in AI not available, using backend fallback');
  }
}

initializeBuiltInAI();
