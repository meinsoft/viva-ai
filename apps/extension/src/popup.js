// Viva.AI Popup Script - Autonomous Cognitive Agent Interface

import { sessionMemory } from './memory.js';

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

console.log('[Viva.AI] Autonomous Cognitive Mode - ACTIVE');
debugLog('J.A.R.V.I.S-like intelligence enabled');

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
    updateStatus('Analyzing...');
    try {
      const pageMapResponse = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
      currentPageMap = pageMapResponse.pageMap;
      sessionMemory.updatePageContext(currentPageMap);
      debugLog('PageMap received:', currentPageMap);
    } catch (error) {
      console.warn('[Viva.AI] Could not get pageMap:', error.message);
      currentPageMap = {};
    }

    // Get memory context for cognitive understanding
    const memoryContext = sessionMemory.getRelevantContext();
    debugLog('Memory context:', memoryContext);

    // STAGE 1: Classify intent with autonomous cognitive understanding
    updateStatus('Understanding...');
    debugLog('Calling /ai/intent with memory context');

    const intentResponse = await fetch(`${BACKEND_URL}/ai/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        utterance: utterance,
        pageMap: currentPageMap,
        memory: memoryContext,
        locale: 'en'
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

    // STAGE 3: Execute plan immediately (FULL TRUST MODE - no confirmation)
    updateStatus('Executing...');
    debugLog('Executing plan [FULL TRUST]');

    const executeResult = await chrome.runtime.sendMessage({
      type: 'EXECUTE_PLAN',
      tabId: tab.id,
      plan: plan,
      language: language
    });

    debugLog('Execute result:', executeResult);

    // STAGE 4: Always speak back (TTS)
    if (plan.speak) {
      speakText(plan.speak, language);
      updateStatus(`✓ ${plan.speak}`);
      debugLog(`Executed ${executeResult.executed || 0}/${executeResult.total || plan.actions.length} actions`);
    } else {
      updateStatus('Action completed');
    }

    // Update session memory with conversation turn
    sessionMemory.addConversationTurn(utterance, intent, plan.speak);
    debugLog('Memory updated with conversation turn');

    // Update last action in memory
    if (plan.actions && plan.actions.length > 0) {
      sessionMemory.updateLastAction(plan.actions[plan.actions.length - 1], executeResult);
    }

    if (!executeResult.success) {
      console.warn('[Viva.AI] Some actions failed:', executeResult.error);
    }

  } catch (error) {
    updateStatus(`Error: ${error.message}`);
    console.error('[Viva.AI] Error:', error);
    debugLog('Error processing utterance:', error.message);
  }
}

// Map ISO 639-1 language codes to BCP 47 for TTS (TOP LANGUAGES ONLY)
// Unsupported languages fallback to English automatically
function mapLanguageToVoice(isoCode) {
  const topLanguages = {
    'en': 'en-US',
    'tr': 'tr-TR',
    'ru': 'ru-RU',
    'es': 'es-ES',
    'fr': 'fr-FR',
    'de': 'de-DE'
  };

  // If language is supported, use it; otherwise fallback to English
  if (topLanguages[isoCode]) {
    return topLanguages[isoCode];
  }

  debugLog('Unsupported TTS language:', isoCode, '→ falling back to en-US');
  return 'en-US';
}

// Speak text using Web Speech API TTS
function speakText(text, language = 'az') {
  try {
    if (!window.speechSynthesis) {
      console.warn('[Viva.AI] Speech synthesis not available');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const voiceLang = mapLanguageToVoice(language);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceLang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    debugLog('Speaking in', voiceLang, ':', text);
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.error('[Viva.AI] TTS error:', error);
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
