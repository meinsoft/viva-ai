// Viva.AI Popup Script - Voice Input & Plan Execution

// Diagnostics mode helper
function isDiagnosticsEnabled() {
  try {
    return localStorage.getItem('viva_debug') === '1';
  } catch (e) {
    return false;
  }
}

function debugLog(...args) {
  if (isDiagnosticsEnabled()) {
    console.log('[VIVA]', ...args);
  }
}

console.log('[Viva.AI] Popup loaded');
debugLog('Diagnostics mode active');

const BACKEND_URL = 'http://localhost:5000';

const statusEl = document.getElementById('status');
const listenBtnEl = document.getElementById('listenBtn');
const transcriptEl = document.getElementById('transcript');

let recognition = null;
let currentTabId = null;
let currentPageMap = null;

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

// Process utterance with full two-stage pipeline: STT → Intent → Plan → Execute
async function processUtterance(utterance) {
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;

    debugLog('Processing utterance:', utterance);

    // STAGE 0: Get pageMap from content script
    updateStatus('Reading page...');
    try {
      const pageMapResponse = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
      currentPageMap = pageMapResponse.pageMap;
      debugLog('PageMap received:', currentPageMap);
    } catch (error) {
      console.warn('[Viva.AI] Could not get pageMap:', error.message);
      currentPageMap = {};
    }

    // STAGE 1: Classify intent
    updateStatus('Understanding...');
    debugLog('Calling /ai/intent');

    const intentResponse = await fetch(`${BACKEND_URL}/ai/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        utterance: utterance,
        pageMap: currentPageMap,
        memory: {},
        locale: 'az'
      })
    });

    if (!intentResponse.ok) {
      throw new Error(`Intent classification failed: ${intentResponse.status}`);
    }

    const intentResult = await intentResponse.json();
    debugLog('Intent result:', intentResult);

    if (!intentResult.success || !intentResult.intent) {
      throw new Error('No intent detected');
    }

    const { intent, language, confidence } = intentResult;
    debugLog(`Intent: ${intent}, Language: ${language}, Confidence: ${confidence}`);

    // STAGE 2: Generate action plan
    updateStatus('Planning...');
    debugLog('Calling /ai/plan');

    const planResponse = await fetch(`${BACKEND_URL}/ai/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: intent,
        utterance: utterance,
        pageMap: currentPageMap,
        memory: {}
      })
    });

    if (!planResponse.ok) {
      throw new Error(`Plan generation failed: ${planResponse.status}`);
    }

    const planResult = await planResponse.json();
    debugLog('Plan result:', planResult);

    if (!planResult.success || !planResult.plan) {
      throw new Error('No plan generated');
    }

    const plan = planResult.plan;
    debugLog('Plan:', JSON.stringify(plan, null, 2));

    // STAGE 3: Check for confirmation requirements
    const actionsNeedingConfirmation = plan.actions.filter(a => a.confirmation === true);

    if (actionsNeedingConfirmation.length > 0) {
      debugLog('Actions requiring confirmation:', actionsNeedingConfirmation.length);
      const confirmed = await showConfirmationUI(plan, actionsNeedingConfirmation);

      if (!confirmed) {
        updateStatus('Action cancelled');
        debugLog('User cancelled confirmation');
        return;
      }
    }

    // STAGE 4: Execute plan
    updateStatus('Executing...');
    debugLog('Executing plan');

    const executeResult = await chrome.runtime.sendMessage({
      type: 'EXECUTE_PLAN',
      tabId: tab.id,
      plan: plan,
      language: language
    });

    debugLog('Execute result:', executeResult);

    if (executeResult.success) {
      updateStatus(`✓ ${plan.speak}`);
      debugLog(`Executed ${executeResult.executed}/${executeResult.total} actions`);
    } else {
      updateStatus(`Error: ${executeResult.error}`);
    }

  } catch (error) {
    updateStatus(`Error: ${error.message}`);
    console.error('[Viva.AI] Error:', error);
    debugLog('Error processing utterance:', error.message);
  }
}

// Show confirmation UI for actions requiring user approval
async function showConfirmationUI(plan, actionsNeedingConfirmation) {
  const actionDescriptions = actionsNeedingConfirmation.map(a => {
    switch (a.type) {
      case 'CLICK':
        return `Click: ${a.target?.selector || 'element'}`;
      case 'FILL':
        return `Fill: ${a.target?.selector || 'input'} with "${a.value}"`;
      case 'NAVIGATE':
        return `Navigate to: ${a.value}`;
      case 'TAB_SWITCH':
        return `Switch to tab: ${a.value}`;
      default:
        return `${a.type}: ${a.value || ''}`;
    }
  }).join('\n');

  const message = `[Viva.AI SAFE MODE]\n\n${plan.speak}\n\nActions to perform:\n${actionDescriptions}\n\nAllow?`;

  return confirm(message);
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
