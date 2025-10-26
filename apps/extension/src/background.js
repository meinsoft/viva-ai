// Viva.AI Background Service Worker

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

console.log('[Viva.AI] Background service worker started');
debugLog('Diagnostics mode enabled');

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

  if (message.type === 'REQUEST_PLAN') {
    requestPlanFromPage(message.tabId, message.intent, message.utterance, message.pageMap, message.memory)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'REQUEST_EXECUTE_ACTION') {
    executeActionOnTab(message.tabId, message.action, message.language)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'EXECUTE_PLAN') {
    executePlan(message.tabId, message.plan, message.language)
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

// Request action plan using Chrome Prompt API with backend fallback
async function requestPlanFromPage(tabId, intent, utterance, pageMap, memory) {
  console.log('[Viva.AI] Requesting plan for intent:', intent);

  try {
    // Try local Chrome Prompt API first
    const localResult = await callLocalPromptInPage(tabId, intent, utterance, pageMap, memory);

    if (localResult && localResult.plan && isValidPlan(localResult.plan)) {
      console.log('[Viva.AI] Plan generated with local Prompt API');
      return { success: true, plan: localResult.plan, source: 'local' };
    }

    console.warn('[Viva.AI] Local Prompt API failed or returned invalid plan, falling back to backend');
  } catch (error) {
    console.warn('[Viva.AI] Local Prompt API error:', error.message);
  }

  // Fallback to backend
  try {
    const response = await fetch(`${BACKEND_URL}/ai/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ intent, utterance, pageMap, memory })
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.plan && isValidPlan(result.plan)) {
      console.log('[Viva.AI] Plan generated with backend API');
      return { success: true, plan: result.plan, source: 'backend' };
    }

    throw new Error('Backend returned invalid plan');
  } catch (error) {
    console.error('[Viva.AI] Backend plan generation failed:', error);
    return { success: false, error: error.message };
  }
}

// Call Chrome Prompt API in page context using executeScript
async function callLocalPromptInPage(tabId, intent, utterance, pageMap, memory) {
  try {
    const inputData = { intent, utterance, pageMap, memory };

    // Import plan prompt (in production this would be bundled)
    const PLAN_PROMPT_STR = `You are Viva.AI — an intelligent, HUMAN-SAFE, voice-first assistant for blind users.

You have ALREADY received the user's INTENT.
Now your job is to PLAN THE NEXT ACTION — what Viva should DO next — based on:
- the user's utterance (intent already classified)
- the pageMap (structure of the current webpage)
- the memory/preferences of the user

INPUT: ${JSON.stringify(inputData)}

OUTPUT FORMAT (STRICT JSON — NO EXPLANATION TEXT):
{
  "actions": [
    {
      "type": "SCROLL_TO" | "CLICK" | "SUMMARIZE" | "DESCRIBE" | "ANNOUNCE" | "FILL" | "NAVIGATE",
      "target": { "selector": "...", "metadata": { ... } },
      "value": "...",
      "confirmation": true
    }
  ],
  "speak": "short voice response to user"
}

Return ONLY the JSON, no additional text.`;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: async (promptStr) => {
        try {
          // Check if Chrome AI Prompt API is available
          if (!self.ai || !self.ai.languageModel) {
            throw new Error('Chrome AI Prompt API not available');
          }

          const session = await self.ai.languageModel.create({
            temperature: 0.7,
            topK: 3
          });

          const result = await session.prompt(promptStr);

          // Parse JSON response
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('No JSON found in response');
          }

          const plan = JSON.parse(jsonMatch[0]);
          return { success: true, plan };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
      args: [PLAN_PROMPT_STR]
    });

    if (results && results[0] && results[0].result) {
      return results[0].result;
    }

    throw new Error('No result from executeScript');
  } catch (error) {
    console.error('[Viva.AI] Error calling local Prompt API:', error);
    throw error;
  }
}

// Validate plan structure
function isValidPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return false;
  }

  if (!Array.isArray(plan.actions)) {
    return false;
  }

  if (typeof plan.speak !== 'string' || plan.speak.trim().length === 0) {
    return false;
  }

  // Validate each action
  const validActionTypes = ['SCROLL_TO', 'CLICK', 'SUMMARIZE', 'DESCRIBE', 'ANNOUNCE', 'FILL', 'NAVIGATE', 'TAB_SWITCH'];

  for (const action of plan.actions) {
    if (!action.type || !validActionTypes.includes(action.type)) {
      debugLog('Invalid action type:', action.type);
      return false;
    }

    // Actions that modify the page should have confirmation flag
    const modifyingActions = ['CLICK', 'FILL', 'NAVIGATE', 'TAB_SWITCH'];
    if (modifyingActions.includes(action.type) && action.confirmation === undefined) {
      console.warn('[Viva.AI] Modifying action missing confirmation flag:', action);
    }
  }

  return true;
}

// Execute action on specific tab (FULL TRUST MODE - no confirmation checks)
async function executeActionOnTab(tabId, action, language = 'az') {
  try {
    debugLog('executeActionOnTab [FULL TRUST]:', action.type, 'on tab', tabId);

    // Handle TAB_SWITCH - requires chrome.tabs API (background only)
    if (action.type === 'TAB_SWITCH') {
      return await executeTabSwitch(action);
    }

    // Handle NAVIGATE - requires chrome.tabs API (background only)
    if (action.type === 'NAVIGATE') {
      return await executeNavigate(tabId, action);
    }

    // Send other actions to content script for execution
    const result = await chrome.tabs.sendMessage(tabId, {
      type: 'EXECUTE_ACTION',
      action: action,
      language: language
    });

    debugLog('Action executed on content script:', action.type, result);
    return result;
  } catch (error) {
    console.error('[Viva.AI] Error executing action:', error);
    debugLog('Action execution error:', action.type, error.message);
    return { success: false, error: error.message };
  }
}

// Execute TAB_SWITCH action
async function executeTabSwitch(action) {
  try {
    debugLog('Executing TAB_SWITCH:', action.value);

    if (!action.value) {
      throw new Error('TAB_SWITCH requires a value');
    }

    // Parse value: {by: "title"|"url", query: "..."}
    let searchCriteria;
    if (typeof action.value === 'string') {
      // Simple string query - search by title
      searchCriteria = { by: 'title', query: action.value };
    } else {
      searchCriteria = action.value;
    }

    // Query tabs based on criteria
    let tabs;
    if (searchCriteria.by === 'url') {
      tabs = await chrome.tabs.query({ url: `*://*/*${searchCriteria.query}*` });
    } else {
      // Search by title
      tabs = await chrome.tabs.query({});
      tabs = tabs.filter(tab =>
        tab.title && tab.title.toLowerCase().includes(searchCriteria.query.toLowerCase())
      );
    }

    if (tabs.length === 0) {
      throw new Error(`No tabs found matching: ${searchCriteria.query}`);
    }

    // Switch to first matching tab
    const targetTab = tabs[0];
    await chrome.tabs.update(targetTab.id, { active: true });
    await chrome.windows.update(targetTab.windowId, { focused: true });

    debugLog('Switched to tab:', targetTab.title);

    return {
      success: true,
      executed: true,
      type: 'TAB_SWITCH',
      tab: { id: targetTab.id, title: targetTab.title, url: targetTab.url }
    };
  } catch (error) {
    console.error('[Viva.AI] TAB_SWITCH error:', error);
    throw new Error(`TAB_SWITCH failed: ${error.message}`);
  }
}

// Execute NAVIGATE action
async function executeNavigate(tabId, action) {
  try {
    debugLog('Executing NAVIGATE:', action.value);

    if (!action.value) {
      throw new Error('NAVIGATE requires a URL value');
    }

    // Validate URL
    let url;
    try {
      url = new URL(action.value, 'https://');
    } catch (e) {
      // Try as search query if not valid URL
      url = new URL(`https://www.google.com/search?q=${encodeURIComponent(action.value)}`);
    }

    // Navigate the tab
    await chrome.tabs.update(tabId, { url: url.href });

    debugLog('Navigated to:', url.href);

    return {
      success: true,
      executed: true,
      type: 'NAVIGATE',
      url: url.href
    };
  } catch (error) {
    console.error('[Viva.AI] NAVIGATE error:', error);
    throw new Error(`NAVIGATE failed: ${error.message}`);
  }
}

// Execute entire plan with multiple actions (FULL TRUST MODE - auto-execute all)
async function executePlan(tabId, plan, language = 'az') {
  try {
    debugLog('Executing plan [FULL TRUST] with', plan.actions.length, 'actions');
    debugLog('Plan:', JSON.stringify(plan, null, 2));

    const results = [];

    for (const action of plan.actions) {
      try {
        const result = await executeActionOnTab(tabId, action, language);
        results.push(result);

        // Continue even if action fails (non-fatal errors)
        if (!result.success) {
          debugLog('Action failed but continuing:', action.type, result.error || result.message);
        }

        // Small delay between actions for safety
        await new Promise(resolve => setTimeout(resolve, 250));
      } catch (actionError) {
        console.error('[Viva.AI] Action execution error:', actionError);
        results.push({ success: false, error: actionError.message, type: action.type });
        // Continue to next action
      }
    }

    return {
      success: true,
      results,
      executed: results.filter(r => r.success).length,
      total: plan.actions.length,
      speak: plan.speak
    };
  } catch (error) {
    console.error('[Viva.AI] Error executing plan:', error);
    debugLog('Plan execution error:', error.message);
    return { success: false, error: error.message };
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
