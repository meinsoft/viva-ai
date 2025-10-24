// Viva.AI Popup Script - Voice Input

console.log('[Viva.AI] Popup loaded');

const statusEl = document.getElementById('status');
const listenBtnEl = document.getElementById('listenBtn');
const transcriptEl = document.getElementById('transcript');

let recognition = null;

// Initialize Web Speech API
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.error('[Viva.AI] SpeechRecognition not supported');
    updateStatus('Speech recognition not supported');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'az-AZ'; // Azerbaijani
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.onstart = () => {
    console.log('[Viva.AI] Speech recognition started');
    updateStatus('Listening...');
    listenBtnEl.textContent = '🔴 Listening...';
    listenBtnEl.disabled = true;
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log('[Viva.AI] Speech recognized:', transcript);

    transcriptEl.textContent = `You said: "${transcript}"`;
    updateStatus('Processing...');

    // Send to background for plan generation
    processUtterance(transcript);
  };

  recognition.onerror = (event) => {
    console.error('[Viva.AI] Speech recognition error:', event.error);
    updateStatus(`Error: ${event.error}`);
    listenBtnEl.textContent = '🎤 Start Listening';
    listenBtnEl.disabled = false;
  };

  recognition.onend = () => {
    console.log('[Viva.AI] Speech recognition ended');
    listenBtnEl.textContent = '🎤 Start Listening';
    listenBtnEl.disabled = false;
  };

  return recognition;
}

// Update status display
function updateStatus(message) {
  statusEl.textContent = message;
  console.log('[Viva.AI]', message);
}

// Process utterance by sending to background for plan generation
async function processUtterance(utterance) {
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    console.log('[Viva.AI] Sending REQUEST_PLAN for utterance:', utterance);

    // Send REQUEST_PLAN to background
    const result = await chrome.runtime.sendMessage({
      type: 'REQUEST_PLAN',
      tabId: tab.id,
      intent: 'unknown', // Will be classified by backend
      utterance: utterance,
      pageMap: {}, // Empty for now
      memory: {}   // Empty for now
    });

    if (result.error) {
      updateStatus(`Error: ${result.error}`);
      console.error('[Viva.AI] Plan error:', result.error);
    } else if (result.success && result.plan) {
      updateStatus('Plan ready');
      console.log('[Viva.AI] Plan received:', result.plan);

      // Execute actions if they don't require confirmation
      await executeActions(tab.id, result.plan.actions);

      // Announce the response
      if (result.plan.speak) {
        console.log('[Viva.AI] Speaking:', result.plan.speak);
        updateStatus(result.plan.speak);
      }
    } else {
      updateStatus('No plan generated');
    }
  } catch (error) {
    updateStatus(`Error: ${error.message}`);
    console.error('[Viva.AI] Error:', error);
  }
}

// Execute actions from plan
async function executeActions(tabId, actions) {
  if (!actions || actions.length === 0) {
    return;
  }

  for (const action of actions) {
    try {
      console.log('[Viva.AI] Executing action:', action);

      const result = await chrome.runtime.sendMessage({
        type: 'REQUEST_EXECUTE_ACTION',
        tabId: tabId,
        action: action
      });

      if (result.requiresConfirmation) {
        console.log('[Viva.AI] Action requires confirmation:', action);
        updateStatus('Action requires confirmation');
      } else if (result.success) {
        console.log('[Viva.AI] Action executed:', result);
      } else if (result.cancelled) {
        console.log('[Viva.AI] Action cancelled by user');
        updateStatus('Action cancelled');
      } else {
        console.error('[Viva.AI] Action failed:', result);
      }
    } catch (error) {
      console.error('[Viva.AI] Error executing action:', error);
    }
  }
}

// Start listening on button click
listenBtnEl.addEventListener('click', () => {
  if (!recognition) {
    recognition = initSpeechRecognition();
  }

  if (recognition) {
    try {
      recognition.start();
    } catch (error) {
      console.error('[Viva.AI] Error starting recognition:', error);
      updateStatus('Error starting recognition');
    }
  }
});

// Initialize
recognition = initSpeechRecognition();
updateStatus('Ready');
