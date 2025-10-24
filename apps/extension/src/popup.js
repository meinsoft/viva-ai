// Viva.AI Popup Script

console.log('[Viva.AI] Popup loaded');

const statusEl = document.getElementById('status');
const voiceInputEl = document.getElementById('voiceInput');
const processBtnEl = document.getElementById('processBtn');

// Update status display
function updateStatus(message) {
  statusEl.textContent = message;
  console.log('[Viva.AI]', message);
}

// Process user request
async function processRequest() {
  const input = voiceInputEl.value.trim();

  if (!input) {
    updateStatus('Please enter a request');
    return;
  }

  updateStatus('Processing...');

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Get page context
    const pageContext = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });

    // Build pageMap from context
    const pageMap = {
      url: pageContext.url,
      title: pageContext.title,
      heading: pageContext.heading
    };

    // Get user preferences from localStorage
    const memory = {
      userMode: 'voice',
      recentContext: []
    };

    // Get user locale (default to 'az')
    const locale = 'az';

    // Send to background for AI processing
    const result = await chrome.runtime.sendMessage({
      type: 'PROCESS_INTENT',
      utterance: input,
      pageMap,
      memory,
      locale
    });

    if (result.error) {
      updateStatus(`Error: ${result.error}`);
    } else {
      updateStatus('Request processed successfully');
      console.log('[Viva.AI] Result:', result);
    }
  } catch (error) {
    updateStatus(`Error: ${error.message}`);
    console.error('[Viva.AI] Error:', error);
  }
}

// Event listeners
processBtnEl.addEventListener('click', processRequest);
voiceInputEl.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    processRequest();
  }
});

// Initialize
updateStatus('Ready to assist');
