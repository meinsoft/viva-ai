// Viva.AI Background Service Worker

import { persistentMemory } from './memory.js';

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

// ===== PERSISTENT MEMORY SYSTEM =====
// Long-term memory storage for eternal recall

class PersistentMemory {
  constructor() {
    this.storageKey = 'viva_persistent_memory';
    this.indexKey = 'viva_memory_index';
  }

  async saveArticle(articleData) {
    try {
      const { url, title, summary, content, timestamp } = articleData;
      if (!url || !title || !summary) return { success: false, error: 'Missing fields' };

      const memoryEntry = {
        type: 'article',
        id: this.generateId(url),
        url,
        title,
        summary,
        contentPreview: content ? content.substring(0, 500) : '',
        timestamp: timestamp || Date.now(),
        keywords: this.extractKeywords(title + ' ' + summary)
      };

      const memories = await this.getMemories();
      memories.push(memoryEntry);
      await chrome.storage.local.set({ [this.storageKey]: memories });
      await this.updateIndex(memoryEntry);

      console.log('[PersistentMemory] Article saved:', title);
      return { success: true, id: memoryEntry.id };
    } catch (error) {
      console.error('[PersistentMemory] Error:', error);
      return { success: false, error: error.message };
    }
  }

  async saveQA(qaData) {
    try {
      const { question, answer, url, title, context, timestamp } = qaData;
      if (!question || !answer) return { success: false, error: 'Missing Q/A' };

      const memoryEntry = {
        type: 'qa',
        id: this.generateId(question + Date.now()),
        question,
        answer,
        url: url || 'unknown',
        title: title || 'Unknown page',
        context: context ? context.substring(0, 300) : '',
        timestamp: timestamp || Date.now(),
        keywords: this.extractKeywords(question + ' ' + answer)
      };

      const memories = await this.getMemories();
      memories.push(memoryEntry);
      await chrome.storage.local.set({ [this.storageKey]: memories });
      await this.updateIndex(memoryEntry);

      console.log('[PersistentMemory] Q&A saved:', question);
      return { success: true, id: memoryEntry.id };
    } catch (error) {
      console.error('[PersistentMemory] Error:', error);
      return { success: false, error: error.message };
    }
  }

  async searchMemories(query) {
    try {
      const memories = await this.getMemories();
      if (!query || query.trim().length === 0) {
        return memories.slice(-20).reverse();
      }

      const queryKeywords = this.extractKeywords(query);
      const queryLower = query.toLowerCase();

      const scored = memories.map(memory => {
        let score = 0;
        if (memory.title && memory.title.toLowerCase().includes(queryLower)) score += 50;
        if (memory.question && memory.question.toLowerCase().includes(queryLower)) score += 50;
        if (memory.summary && memory.summary.toLowerCase().includes(queryLower)) score += 30;
        if (memory.answer && memory.answer.toLowerCase().includes(queryLower)) score += 30;
        if (memory.keywords) {
          for (const keyword of queryKeywords) {
            if (memory.keywords.includes(keyword)) score += 10;
          }
        }
        const age = Date.now() - (memory.timestamp || 0);
        const recencyScore = Math.max(0, 20 - (age / (1000 * 60 * 60 * 24)));
        score += recencyScore;
        return { ...memory, score };
      });

      const matches = scored.filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
      console.log('[PersistentMemory] Found', matches.length, 'matches');
      return matches;
    } catch (error) {
      console.error('[PersistentMemory] Search error:', error);
      return [];
    }
  }

  async getMemories() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      return result[this.storageKey] || [];
    } catch (error) {
      console.error('[PersistentMemory] Get error:', error);
      return [];
    }
  }

  extractKeywords(text) {
    if (!text) return [];
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how']);
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(word => word.length > 2 && !stopWords.has(word));
    return [...new Set(words)];
  }

  async updateIndex(entry) {
    try {
      const result = await chrome.storage.local.get([this.indexKey]);
      const index = result[this.indexKey] || {};
      for (const keyword of entry.keywords) {
        if (!index[keyword]) index[keyword] = [];
        index[keyword].push(entry.id);
      }
      await chrome.storage.local.set({ [this.indexKey]: index });
    } catch (error) {
      console.error('[PersistentMemory] Index error:', error);
    }
  }

  generateId(seed) {
    return seed.replace(/[^a-z0-9]/gi, '_').substring(0, 50) + '_' + Date.now();
  }
}

const persistentMemory = new PersistentMemory();

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

  if (message.type === 'SAVE_ARTICLE') {
    persistentMemory.saveArticle(message.data)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'SAVE_CONVERSATION') {
    persistentMemory.saveConversation(message.data)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'SEARCH_MEMORIES') {
    persistentMemory.searchMemories(message.query)
      .then(results => sendResponse({ success: true, results }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  return false;
});

// Send intent to backend for AI processing
async function processIntent(utterance, pageMap, memory = {}, locale = 'en') {
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
  const validActionTypes = ['SCROLL_TO', 'CLICK', 'SUMMARIZE', 'DESCRIBE', 'ANNOUNCE', 'FILL', 'NAVIGATE', 'TAB_SWITCH', 'SEARCH', 'ANSWER_QUESTION', 'YOUTUBE_SEARCH', 'YOUTUBE_SELECT', 'YOUTUBE_CONTROL'];

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
async function executeActionOnTab(tabId, action, language = 'en') {
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

    // Handle SEARCH - requires chrome.tabs API (background only)
    if (action.type === 'SEARCH') {
      return await executeSearch(tabId, action);
    }

    // Handle YOUTUBE_SEARCH - requires chrome.tabs API (background only)
    if (action.type === 'YOUTUBE_SEARCH') {
      return await executeYouTubeSearch(tabId, action);
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

// Phonetic similarity for speech recognition errors (e.g., "get up" → "github")
function phoneticSimilarity(str1, str2) {
  // Remove spaces and special characters for phonetic comparison
  const clean1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const clean2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Common speech recognition patterns
  const patterns = [
    // "get up" → "github"
    { spoken: 'getup', written: 'github' },
    { spoken: 'git hub', written: 'github' },
    // "you tube" → "youtube"
    { spoken: 'youtoo', written: 'youtube' },
    { spoken: 'youtube', written: 'youtube' },
    // "slack" variations
    { spoken: 'slak', written: 'slack' },
    // "chrome" variations
    { spoken: 'krome', written: 'chrome' }
  ];

  for (const pattern of patterns) {
    if (clean1.includes(pattern.spoken) && clean2.includes(pattern.written)) {
      return 95;
    }
    if (clean1.includes(pattern.written) && clean2.includes(pattern.spoken)) {
      return 95;
    }
  }

  // Levenshtein distance for phonetic similarity
  const maxLen = Math.max(clean1.length, clean2.length);
  if (maxLen === 0) return 0;

  const distance = levenshteinDistance(clean1, clean2);
  const similarity = ((maxLen - distance) / maxLen) * 100;

  return similarity;
}

// Levenshtein distance for edit distance calculation
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

// Enhanced fuzzy match score with phonetic awareness (0-100)
function fuzzyMatchScore(query, text) {
  if (!text) return 0;

  const queryLower = query.toLowerCase().trim();
  const textLower = text.toLowerCase();

  // Exact match
  if (textLower === queryLower) return 100;

  // Starts with
  if (textLower.startsWith(queryLower)) return 90;

  // Contains exact substring
  if (textLower.includes(queryLower)) return 85;

  // Phonetic similarity check (for speech recognition errors)
  const phoneticScore = phoneticSimilarity(queryLower, textLower);
  if (phoneticScore > 80) return phoneticScore;

  // Word boundary match
  const words = queryLower.split(/\s+/);
  const textWords = textLower.split(/\s+/);
  const matchingWords = words.filter(w => textWords.some(tw => tw.includes(w)));
  if (matchingWords.length === words.length) return 70;
  if (matchingWords.length > 0) return 50 + (matchingWords.length / words.length) * 20;

  // Character-level fuzzy (phonetic/typo tolerance)
  let matches = 0;
  let pos = 0;
  for (const char of queryLower) {
    const idx = textLower.indexOf(char, pos);
    if (idx >= 0) {
      matches++;
      pos = idx + 1;
    }
  }
  const fuzzyScore = (matches / queryLower.length) * 40;

  return Math.max(fuzzyScore, phoneticScore * 0.5);
}

// Execute TAB_SWITCH action with smart fuzzy matching
async function executeTabSwitch(action) {
  try {
    debugLog('Executing TAB_SWITCH:', action.value);

    if (!action.value) {
      throw new Error('TAB_SWITCH requires a value');
    }

    // Parse value
    let searchQuery;
    if (typeof action.value === 'string') {
      searchQuery = action.value;
    } else if (action.value.query) {
      searchQuery = action.value.query;
    } else {
      throw new Error('Invalid TAB_SWITCH value');
    }

    // Get all tabs
    const allTabs = await chrome.tabs.query({});

    // Score each tab based on title and URL
    const scoredTabs = allTabs.map(tab => {
      const titleScore = fuzzyMatchScore(searchQuery, tab.title);
      const urlScore = fuzzyMatchScore(searchQuery, tab.url);
      const maxScore = Math.max(titleScore, urlScore);
      return { tab, score: maxScore };
    });

    // Sort by score descending
    scoredTabs.sort((a, b) => b.score - a.score);

    debugLog('Tab match scores:', scoredTabs.slice(0, 3).map(s => ({ title: s.tab.title, score: s.score })));

    // Get best match (threshold: score > 30)
    const bestMatch = scoredTabs[0];
    if (bestMatch.score < 30) {
      throw new Error(`No good tab match for: ${searchQuery} (best score: ${bestMatch.score})`);
    }

    // Switch to best matching tab
    const targetTab = bestMatch.tab;
    await chrome.tabs.update(targetTab.id, { active: true });
    await chrome.windows.update(targetTab.windowId, { focused: true });

    debugLog('Switched to tab:', targetTab.title, 'score:', bestMatch.score);

    return {
      success: true,
      executed: true,
      type: 'TAB_SWITCH',
      tab: { id: targetTab.id, title: targetTab.title, url: targetTab.url },
      matchScore: bestMatch.score
    };
  } catch (error) {
    console.error('[Viva.AI] TAB_SWITCH error:', error);
    throw new Error(`TAB_SWITCH failed: ${error.message}`);
  }
}

// Popular site mapping for smart navigation
const POPULAR_SITES = {
  'youtube': 'https://www.youtube.com',
  'gmail': 'https://mail.google.com',
  'google': 'https://www.google.com',
  'facebook': 'https://www.facebook.com',
  'instagram': 'https://www.instagram.com',
  'twitter': 'https://twitter.com',
  'x': 'https://twitter.com',
  'linkedin': 'https://www.linkedin.com',
  'reddit': 'https://www.reddit.com',
  'github': 'https://github.com',
  'stackoverflow': 'https://stackoverflow.com',
  'chatgpt': 'https://chat.openai.com',
  'openai': 'https://chat.openai.com',
  'claude': 'https://claude.ai',
  'anthropic': 'https://claude.ai',
  'netflix': 'https://www.netflix.com',
  'amazon': 'https://www.amazon.com',
  'ebay': 'https://www.ebay.com',
  'wikipedia': 'https://www.wikipedia.org',
  'medium': 'https://medium.com',
  'notion': 'https://www.notion.so',
  'figma': 'https://www.figma.com',
  'canva': 'https://www.canva.com',
  'spotify': 'https://www.spotify.com',
  'twitch': 'https://www.twitch.tv',
  'discord': 'https://discord.com',
  'slack': 'https://slack.com',
  'zoom': 'https://zoom.us',
  'drive': 'https://drive.google.com',
  'docs': 'https://docs.google.com',
  'sheets': 'https://sheets.google.com'
};

// Resolve navigation target to actual URL
function resolveNavigationURL(input) {
  const inputLower = input.toLowerCase().trim();

  // Check if it's already a valid URL
  try {
    const url = new URL(input);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }
  } catch (e) {
    // Not a valid URL, continue
  }

  // Check if it starts with www. or has domain pattern
  if (inputLower.startsWith('www.') || /^[\w-]+\.[\w]{2,}/.test(inputLower)) {
    return `https://${input}`;
  }

  // Check popular sites mapping
  for (const [keyword, url] of Object.entries(POPULAR_SITES)) {
    if (inputLower.includes(keyword)) {
      debugLog('Matched popular site:', keyword, '→', url);
      return url;
    }
  }

  // Check if it's a domain-like pattern (e.g., "github.com", "instagram.com")
  if (/^[\w-]+\.com|\.org|\.net|\.io|\.ai|\.dev/.test(inputLower)) {
    return `https://${input}`;
  }

  // Fallback: treat as search query only if nothing else matches
  debugLog('No direct URL match, using search fallback for:', input);
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}

// Execute NAVIGATE action with smart URL resolution
async function executeNavigate(tabId, action) {
  try {
    debugLog('Executing NAVIGATE:', action.value);

    if (!action.value) {
      throw new Error('NAVIGATE requires a URL value');
    }

    // Resolve to actual URL
    const targetURL = resolveNavigationURL(action.value);

    // Navigate the tab
    await chrome.tabs.update(tabId, { url: targetURL });

    debugLog('Navigated to:', targetURL);

    return {
      success: true,
      executed: true,
      type: 'NAVIGATE',
      url: targetURL,
      original: action.value
    };
  } catch (error) {
    console.error('[Viva.AI] NAVIGATE error:', error);
    throw new Error(`NAVIGATE failed: ${error.message}`);
  }
}

// Execute SEARCH action - perform intelligent web search with AI analysis
async function executeSearch(tabId, action) {
  try {
    debugLog('Executing SEARCH:', action.value);

    if (!action.value) {
      throw new Error('SEARCH requires a search query value');
    }

    // Perform Google search by navigating to search results
    const searchQuery = encodeURIComponent(action.value);
    const searchURL = `https://www.google.com/search?q=${searchQuery}`;

    // Navigate the tab to search results
    await chrome.tabs.update(tabId, { url: searchURL });

    debugLog('Search performed:', action.value);

    // Wait for page to load completely
    await waitForPageLoad(tabId);

    // Extract search results from Google search page
    let searchResults = [];
    try {
      const extractResponse = await chrome.tabs.sendMessage(tabId, {
        type: 'EXTRACT_SEARCH_RESULTS'
      });

      if (extractResponse && extractResponse.success) {
        searchResults = extractResponse.results || [];
        debugLog('Extracted search results:', searchResults.length, 'results');
      }
    } catch (extractError) {
      console.warn('[Viva.AI] Could not extract search results:', extractError.message);
    }

    // Call AI to analyze search results and generate voice announcement
    let voiceAnnouncement = null;
    if (searchResults.length > 0) {
      try {
        const analyzeResponse = await fetch(`${BACKEND_URL}/ai/search-analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: action.value,
            results: searchResults
          })
        });

        if (analyzeResponse.ok) {
          const analyzeResult = await analyzeResponse.json();
          if (analyzeResult.success && analyzeResult.analysis) {
            voiceAnnouncement = analyzeResult.analysis.voiceAnnouncement;
            debugLog('AI search analysis:', voiceAnnouncement);

            // Speak the announcement via content script
            if (voiceAnnouncement) {
              await chrome.tabs.sendMessage(tabId, {
                type: 'SPEAK_TEXT',
                text: voiceAnnouncement,
                language: 'en'
              });
            }
          }
        }
      } catch (analyzeError) {
        console.warn('[Viva.AI] Search analysis failed:', analyzeError.message);
      }
    }

    return {
      success: true,
      executed: true,
      type: 'SEARCH',
      query: action.value,
      url: searchURL,
      resultsFound: searchResults.length,
      voiceAnnouncement: voiceAnnouncement
    };
  } catch (error) {
    console.error('[Viva.AI] SEARCH error:', error);
    throw new Error(`SEARCH failed: ${error.message}`);
  }
}

// Wait for page to finish loading
async function waitForPageLoad(tabId, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkStatus = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);

        if (tab.status === 'complete') {
          // Give extra 500ms for dynamic content
          setTimeout(resolve, 500);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Page load timeout'));
        } else {
          setTimeout(checkStatus, 100);
        }
      } catch (error) {
        reject(error);
      }
    };

    checkStatus();
  });
}

// Execute YOUTUBE_SEARCH action - search YouTube and navigate to results
async function executeYouTubeSearch(tabId, action) {
  try {
    debugLog('Executing YOUTUBE_SEARCH:', action.value);

    if (!action.value) {
      throw new Error('YOUTUBE_SEARCH requires a search query value');
    }

    // Perform YouTube search by navigating to search results
    const searchQuery = encodeURIComponent(action.value);
    const youtubeSearchURL = `https://www.youtube.com/results?search_query=${searchQuery}`;

    // Navigate the tab to YouTube search results
    await chrome.tabs.update(tabId, { url: youtubeSearchURL });

    debugLog('YouTube search performed:', action.value);

    return {
      success: true,
      executed: true,
      type: 'YOUTUBE_SEARCH',
      query: action.value,
      url: youtubeSearchURL
    };
  } catch (error) {
    console.error('[Viva.AI] YOUTUBE_SEARCH error:', error);
    throw new Error(`YOUTUBE_SEARCH failed: ${error.message}`);
  }
}

// Execute entire plan with multiple actions (FULL TRUST MODE - auto-execute all)
async function executePlan(tabId, plan, language = 'en') {
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
