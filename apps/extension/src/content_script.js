// Viva.AI Content Script - DOM awareness and safe action execution

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

console.log('[Viva.AI] Content script loaded');

// Build comprehensive pageMap for context-aware AI prompts
function buildPageMap() {
  try {
    const pageMap = {
      headings: [],
      buttons: [],
      inputs: [],
      images: [],
      firstParagraph: null,
      url: window.location.href,
      title: document.title,
      pageType: 'general',
      metadata: {}
    };

    // Detect page type and extract specialized metadata
    const url = window.location.href;

    // YouTube video page detection
    if (url.includes('youtube.com/watch')) {
      pageMap.pageType = 'youtube_video';

      // Extract video title
      const videoTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title');
      if (videoTitle) {
        pageMap.metadata.videoTitle = videoTitle.textContent.trim();
      }

      // Extract channel name
      const channelName = document.querySelector('ytd-channel-name a, #channel-name a, #owner-name a');
      if (channelName) {
        pageMap.metadata.channel = channelName.textContent.trim();
      }

      // Extract view count and upload date
      const viewInfo = document.querySelector('#info-strings yt-formatted-string, #count');
      if (viewInfo) {
        pageMap.metadata.viewInfo = viewInfo.textContent.trim();
      }

      // Extract description preview
      const description = document.querySelector('#description yt-formatted-string, #description-text');
      if (description) {
        pageMap.metadata.description = description.textContent.trim().substring(0, 300);
      }

      debugLog('YouTube video detected:', pageMap.metadata);
    }

    // Article/blog page detection
    if (document.querySelector('article, [role="article"], .post-content, .article-content, .entry-content')) {
      pageMap.pageType = 'article';

      // Extract article content for summarization
      const articleElement = document.querySelector('article, [role="article"], .post-content, .article-content, .entry-content');
      if (articleElement) {
        const paragraphs = articleElement.querySelectorAll('p');
        const contentPreviews = Array.from(paragraphs).slice(0, 5).map(p => p.textContent.trim()).filter(t => t.length > 50);
        pageMap.metadata.contentPreview = contentPreviews.join(' ').substring(0, 500);
      }

      // Extract author if available
      const author = document.querySelector('[rel="author"], .author-name, .byline');
      if (author) {
        pageMap.metadata.author = author.textContent.trim();
      }

      debugLog('Article page detected:', pageMap.metadata);
    }

    // Extract h1-h3 headings
    document.querySelectorAll('h1, h2, h3').forEach((heading, index) => {
      const text = heading.textContent.trim();
      if (text) {
        pageMap.headings.push({
          level: heading.tagName.toLowerCase(),
          text: text.substring(0, 100), // Limit length
          index
        });
      }
    });

    // Extract buttons with labels and selectors
    document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"]').forEach((button, index) => {
      const label = button.textContent.trim() || button.value || button.getAttribute('aria-label') || button.getAttribute('title');
      if (label && index < 20) { // Limit to first 20 buttons
        const id = button.id;
        const classes = button.className;
        let selector = button.tagName.toLowerCase();
        if (id) selector = `#${id}`;
        else if (classes) selector = `${button.tagName.toLowerCase()}.${classes.split(' ')[0]}`;

        pageMap.buttons.push({
          label: label.substring(0, 50),
          selector,
          index
        });
      }
    });

    // Extract inputs with name/placeholder
    document.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach((input, index) => {
      if (index < 15) { // Limit to first 15 inputs
        const name = input.name || input.id || input.getAttribute('aria-label');
        const placeholder = input.placeholder;
        const type = input.type || 'text';
        const id = input.id;
        let selector = input.tagName.toLowerCase();
        if (id) selector = `#${id}`;
        else if (name) selector = `${input.tagName.toLowerCase()}[name="${name}"]`;

        pageMap.inputs.push({
          name: name || 'unnamed',
          placeholder: placeholder || null,
          type,
          selector,
          index
        });
      }
    });

    // Extract images with alt text
    document.querySelectorAll('img[alt]').forEach((img, index) => {
      if (index < 10) { // Limit to first 10 images
        const alt = img.alt.trim();
        if (alt) {
          pageMap.images.push({
            alt: alt.substring(0, 100),
            src: img.src.substring(0, 100),
            index
          });
        }
      }
    });

    // Extract first paragraph
    const firstP = document.querySelector('p');
    if (firstP) {
      const text = firstP.textContent.trim();
      if (text) {
        pageMap.firstParagraph = text.substring(0, 200); // Limit length
      }
    }

    debugLog('PageMap built:', JSON.stringify(pageMap, null, 2));

    return pageMap;
  } catch (error) {
    console.error('[Viva.AI] Error building pageMap:', error);
    return {
      headings: [],
      buttons: [],
      inputs: [],
      images: [],
      firstParagraph: null,
      url: window.location.href,
      title: document.title,
      error: error.message
    };
  }
}

// Detect first <h1> on page (legacy support)
function detectPageHeading() {
  const firstH1 = document.querySelector('h1');
  if (firstH1) {
    debugLog('First H1 detected:', firstH1.textContent);
    return firstH1.textContent;
  } else {
    debugLog('No H1 found on page');
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
  debugLog('Message received:', message.type);

  if (message.type === 'GET_PAGE_CONTEXT') {
    const pageMap = buildPageMap();
    debugLog('Sending pageMap to background:', pageMap);
    sendResponse({ pageMap });
    return false;
  }

  if (message.type === 'EXECUTE_ACTION') {
    const action = message.action;
    const language = message.language || 'en'; // Default to English

    debugLog('Executing action [FULL TRUST]:', action.type, 'with language:', language);

    // FULL TRUST MODE: Execute all actions immediately without confirmation
    try {
      const result = executeAction(action, language);
      debugLog('Action executed:', action.type, result);
      sendResponse({ success: true, result });
    } catch (error) {
      console.error('[Viva.AI] Error executing action:', error);
      debugLog('Action execution error:', action.type, error.message);
      sendResponse({ success: false, error: error.message });
    }

    return true; // Keep channel open for async response
  }

  return false;
});

// Execute DOM actions safely
function executeAction(action, language = 'en') {
  debugLog('executeAction called:', action.type);

  try {
    switch (action.type) {
      case 'SCROLL_TO':
        return executeScrollTo(action);

      case 'CLICK':
        return executeClick(action);

      case 'FILL':
        return executeFill(action);

      case 'ANNOUNCE':
        return executeAnnounce(action, language);

      case 'SUMMARIZE':
        return executeSummarize(action, language);

      case 'DESCRIBE':
        // These are informational actions, return success
        debugLog('Informational action completed:', action.type);
        return { executed: true, type: action.type, message: 'Informational action completed' };

      case 'ANSWER_QUESTION':
        return executeAnswerQuestion(action, language);

      case 'YOUTUBE_CONTROL':
        return executeYouTubeControl(action);

      case 'YOUTUBE_SELECT':
        return executeYouTubeSelect(action);

      case 'NAVIGATE':
        // NAVIGATE should be handled by background.js (requires tab API)
        debugLog('NAVIGATE action passed to background');
        return { executed: false, type: 'NAVIGATE', message: 'Navigation handled by background script' };

      case 'TAB_SWITCH':
        // TAB_SWITCH must be handled by background.js (requires tabs API)
        debugLog('TAB_SWITCH action passed to background');
        return { executed: false, type: 'TAB_SWITCH', message: 'Tab switch handled by background script' };

      case 'SEARCH':
        // SEARCH handled by background.js (requires tabs API)
        debugLog('SEARCH action passed to background');
        return { executed: false, type: 'SEARCH', message: 'Search handled by background script' };

      case 'YOUTUBE_SEARCH':
        // YOUTUBE_SEARCH handled by background.js (requires tabs API)
        debugLog('YOUTUBE_SEARCH action passed to background');
        return { executed: false, type: 'YOUTUBE_SEARCH', message: 'YouTube search handled by background script' };

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
    // If specific selector provided, try to scroll to element
    if (action.target && action.target.selector && action.target.selector !== 'body') {
      const element = document.querySelector(action.target.selector);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        debugLog('Scrolled to element:', action.target.selector);
        return { executed: true, type: 'SCROLL_TO', target: action.target.selector };
      }
      // Element not found, fallback to viewport scroll
      debugLog('Element not found, falling back to viewport scroll:', action.target.selector);
    }

    // Default: smooth scroll down by viewport height
    const scrollAmount = window.innerHeight * 0.8;
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    debugLog('Viewport scrolled by:', scrollAmount);
    return { executed: true, type: 'SCROLL_TO', scrolled: 'viewport', amount: scrollAmount };
  } catch (error) {
    // Fatal failure, try emergency fallback
    try {
      window.scrollBy(0, window.innerHeight * 0.8);
      return { executed: true, type: 'SCROLL_TO', scrolled: 'fallback' };
    } catch (fallbackError) {
      throw new Error(`SCROLL_TO failed: ${error.message}`);
    }
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

// Map ISO 639-1 language codes to BCP 47 tags for TTS (TOP 3 LANGUAGES ONLY)
// Only English, Spanish, French supported - all others use English
function mapLanguageToVoice(isoCode) {
  const supportedLanguages = {
    'en': 'en-US',
    'es': 'es-ES',
    'fr': 'fr-FR'
  };

  if (supportedLanguages[isoCode]) {
    return supportedLanguages[isoCode];
  }

  debugLog('Unsupported TTS language:', isoCode, '→ using English');
  return 'en-US';
}

// ANNOUNCE: Use SpeechSynthesis to speak text with language awareness
function executeAnnounce(action, language = 'en') {
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

    // Map language code to BCP 47 tag
    const voiceLang = mapLanguageToVoice(language);

    // Create utterance with detected language
    const utterance = new SpeechSynthesisUtterance(action.value);
    utterance.lang = voiceLang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    debugLog('Announcing in', voiceLang, ':', action.value);

    // Speak
    window.speechSynthesis.speak(utterance);

    return { executed: true, type: 'ANNOUNCE', value: action.value, language: voiceLang };
  } catch (error) {
    throw new Error(`ANNOUNCE failed: ${error.message}`);
  }
}

// SUMMARIZE: Extract page content and generate summary
function executeSummarize(action, language = 'en') {
  try {
    debugLog('Executing SUMMARIZE');

    // Extract main content from the page
    const pageContent = extractPageContent();

    if (!pageContent || pageContent.length === 0) {
      throw new Error('No content found to summarize');
    }

    debugLog('Extracted content for summarization:', pageContent.substring(0, 200) + '...');

    // Return the extracted content - backend will handle AI summarization
    return {
      executed: true,
      type: 'SUMMARIZE',
      content: pageContent,
      message: 'Content extracted for summarization'
    };
  } catch (error) {
    throw new Error(`SUMMARIZE failed: ${error.message}`);
  }
}

// ANSWER_QUESTION: Answer question about current page content
function executeAnswerQuestion(action, language = 'en') {
  try {
    debugLog('Executing ANSWER_QUESTION:', action.value);

    if (!action.value) {
      throw new Error('ANSWER_QUESTION requires a question value');
    }

    // Extract page content for context
    const pageContent = extractPageContent();

    if (!pageContent || pageContent.length === 0) {
      throw new Error('No page content available to answer question');
    }

    debugLog('Extracted content for Q&A:', pageContent.substring(0, 200) + '...');

    // Return question and content - backend will handle AI response
    return {
      executed: true,
      type: 'ANSWER_QUESTION',
      question: action.value,
      content: pageContent,
      message: 'Question and content extracted for AI processing'
    };
  } catch (error) {
    throw new Error(`ANSWER_QUESTION failed: ${error.message}`);
  }
}

// YOUTUBE_CONTROL: Control YouTube video playback
function executeYouTubeControl(action) {
  try {
    debugLog('Executing YOUTUBE_CONTROL:', action.value);

    if (!action.value) {
      throw new Error('YOUTUBE_CONTROL requires a control value (play, pause, next, previous)');
    }

    const control = action.value.toLowerCase();

    // Check if we're on YouTube
    if (!window.location.hostname.includes('youtube.com')) {
      throw new Error('YOUTUBE_CONTROL only works on YouTube pages');
    }

    // Get the video element
    const video = document.querySelector('video');
    if (!video) {
      throw new Error('No video element found on page');
    }

    switch (control) {
      case 'play':
        video.play();
        debugLog('Video playing');
        return { executed: true, type: 'YOUTUBE_CONTROL', action: 'play' };

      case 'pause':
        video.pause();
        debugLog('Video paused');
        return { executed: true, type: 'YOUTUBE_CONTROL', action: 'pause' };

      case 'next':
        // Click the next button in playlist
        const nextButton = document.querySelector('.ytp-next-button');
        if (nextButton) {
          nextButton.click();
          debugLog('Next video clicked');
          return { executed: true, type: 'YOUTUBE_CONTROL', action: 'next' };
        } else {
          throw new Error('Next button not found (may not be in a playlist)');
        }

      case 'previous':
        // Click the previous button in playlist
        const prevButton = document.querySelector('.ytp-prev-button');
        if (prevButton) {
          prevButton.click();
          debugLog('Previous video clicked');
          return { executed: true, type: 'YOUTUBE_CONTROL', action: 'previous' };
        } else {
          throw new Error('Previous button not found (may not be in a playlist)');
        }

      default:
        throw new Error(`Unknown YouTube control: ${control} (use: play, pause, next, previous)`);
    }
  } catch (error) {
    throw new Error(`YOUTUBE_CONTROL failed: ${error.message}`);
  }
}

// YOUTUBE_SELECT: Select a specific video from YouTube search results
function executeYouTubeSelect(action) {
  try {
    debugLog('Executing YOUTUBE_SELECT:', action.value);

    // Check if we're on YouTube
    if (!window.location.hostname.includes('youtube.com')) {
      throw new Error('YOUTUBE_SELECT only works on YouTube pages');
    }

    // Get video results on the page
    const videoLinks = document.querySelectorAll('a#video-title');

    if (!videoLinks || videoLinks.length === 0) {
      throw new Error('No video results found on page');
    }

    // Default to first video if no specific selection criteria
    let selectedIndex = 0;

    // If action.value is a number, use it as index
    if (action.value && !isNaN(action.value)) {
      selectedIndex = parseInt(action.value) - 1; // Convert 1-based to 0-based
      if (selectedIndex < 0 || selectedIndex >= videoLinks.length) {
        selectedIndex = 0; // Fallback to first video
      }
    }

    // Click the selected video
    const selectedVideo = videoLinks[selectedIndex];
    selectedVideo.click();

    debugLog('Selected video:', selectedIndex + 1, selectedVideo.title);

    return {
      executed: true,
      type: 'YOUTUBE_SELECT',
      index: selectedIndex + 1,
      title: selectedVideo.title
    };
  } catch (error) {
    throw new Error(`YOUTUBE_SELECT failed: ${error.message}`);
  }
}

// Extract main content from the page for summarization/Q&A
function extractPageContent() {
  let content = '';

  // Try to find main article/content area
  const mainContent = document.querySelector('article, main, [role="main"], .content, #content');

  if (mainContent) {
    // Extract text from paragraphs, headings, and list items
    const elements = mainContent.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
    elements.forEach(el => {
      const text = el.textContent.trim();
      if (text && text.length > 10) { // Skip very short text
        content += text + '\n\n';
      }
    });
  }

  // Fallback: extract from body if no main content found
  if (!content) {
    const paragraphs = document.querySelectorAll('p');
    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      if (text && text.length > 10) {
        content += text + '\n\n';
      }
    });
  }

  // Limit content size (max ~5000 chars for AI processing)
  if (content.length > 5000) {
    content = content.substring(0, 5000) + '...';
  }

  return content.trim();
}

// Initialize - build pageMap on load for faster responses
debugLog('Building initial pageMap...');
const initialPageMap = buildPageMap();
debugLog('Initial pageMap complete:', initialPageMap.headings.length, 'headings,', initialPageMap.buttons.length, 'buttons');
