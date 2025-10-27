// Viva.AI Session Memory - Cognitive Context Tracking

class SessionMemory {
  constructor() {
    this.context = {
      currentPage: null,
      pageHistory: [],
      lastIntent: null,
      lastAction: null,
      conversationContext: [],
      userPreferences: {},
      activeTask: null
    };
    this.maxHistorySize = 10;
    this.maxConversationSize = 5;
  }

  updatePageContext(pageMap) {
    if (!pageMap) return;

    const newPage = {
      url: pageMap.url,
      title: pageMap.title,
      pageType: pageMap.pageType,
      metadata: pageMap.metadata,
      timestamp: Date.now()
    };

    if (this.context.currentPage?.url !== newPage.url) {
      if (this.context.currentPage) {
        this.context.pageHistory.unshift(this.context.currentPage);
        if (this.context.pageHistory.length > this.maxHistorySize) {
          this.context.pageHistory.pop();
        }
      }
      this.context.currentPage = newPage;
    }
  }

  addConversationTurn(utterance, intent, response) {
    this.context.conversationContext.push({
      utterance,
      intent,
      response,
      timestamp: Date.now()
    });

    if (this.context.conversationContext.length > this.maxConversationSize) {
      this.context.conversationContext.shift();
    }

    this.context.lastIntent = intent;
  }

  updateLastAction(action, result) {
    this.context.lastAction = {
      action,
      result,
      timestamp: Date.now()
    };
  }

  getRelevantContext() {
    return {
      currentPage: this.context.currentPage,
      recentPages: this.context.pageHistory.slice(0, 3),
      recentConversation: this.context.conversationContext,
      lastIntent: this.context.lastIntent,
      lastAction: this.context.lastAction,
      activeTask: this.context.activeTask
    };
  }

  inferUserIntent(utterance) {
    const lowerUtterance = utterance.toLowerCase();

    // Context-aware intent inference
    if (lowerUtterance.includes('continue') || lowerUtterance.includes('go on') || lowerUtterance.includes('next')) {
      if (this.context.lastAction?.action?.type === 'SCROLL_TO') {
        return { suggestedIntent: 'interact_scroll', reason: 'continuation of scrolling' };
      }
      if (this.context.currentPage?.pageType === 'youtube_video') {
        return { suggestedIntent: 'page_insight', reason: 'continue video discussion' };
      }
    }

    if (lowerUtterance.includes('what') || lowerUtterance.includes('about') || lowerUtterance.includes('this')) {
      return { suggestedIntent: 'page_insight', reason: 'page understanding query' };
    }

    return null;
  }

  setActiveTask(task) {
    this.context.activeTask = task;
  }

  clearActiveTask() {
    this.context.activeTask = null;
  }

  exportMemory() {
    return JSON.stringify(this.context);
  }

  importMemory(jsonStr) {
    try {
      this.context = JSON.parse(jsonStr);
    } catch (e) {
      console.error('[Memory] Failed to import:', e);
    }
  }
}

// Persistent Memory - Eternal storage for articles and Q&A (remembers forever)
class PersistentMemory {
  constructor() {
    this.storageKey = 'viva_persistent_memory';
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize storage structure if it doesn't exist
      const stored = await chrome.storage.local.get(this.storageKey);
      if (!stored[this.storageKey]) {
        await chrome.storage.local.set({
          [this.storageKey]: {
            articles: [],
            conversations: [],
            version: 1,
            createdAt: Date.now()
          }
        });
      }
      this.initialized = true;
      console.log('[PersistentMemory] Initialized');
    } catch (error) {
      console.error('[PersistentMemory] Initialization failed:', error);
    }
  }

  /**
   * Save an article summary permanently
   * @param {object} articleData - { url, title, summary, content }
   */
  async saveArticle(articleData) {
    await this.initialize();

    try {
      const stored = await chrome.storage.local.get(this.storageKey);
      const memory = stored[this.storageKey];

      const article = {
        id: `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        url: articleData.url,
        title: articleData.title,
        summary: articleData.summary,
        contentPreview: articleData.content?.substring(0, 500) || null,
        savedAt: Date.now(),
        savedAtReadable: new Date().toISOString(),
        accessCount: 0,
        lastAccessedAt: Date.now()
      };

      memory.articles.unshift(article);

      // Keep last 1000 articles (storage limit consideration)
      if (memory.articles.length > 1000) {
        memory.articles = memory.articles.slice(0, 1000);
      }

      await chrome.storage.local.set({ [this.storageKey]: memory });

      console.log('[PersistentMemory] Article saved:', article.id, article.title);
      return article;
    } catch (error) {
      console.error('[PersistentMemory] Failed to save article:', error);
      return null;
    }
  }

  /**
   * Save a Q&A conversation permanently
   * @param {object} qaData - { url, title, question, answer }
   */
  async saveConversation(qaData) {
    await this.initialize();

    try {
      const stored = await chrome.storage.local.get(this.storageKey);
      const memory = stored[this.storageKey];

      const conversation = {
        id: `qa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        url: qaData.url,
        title: qaData.title,
        question: qaData.question,
        answer: qaData.answer,
        savedAt: Date.now(),
        savedAtReadable: new Date().toISOString()
      };

      memory.conversations.unshift(conversation);

      // Keep last 2000 conversations
      if (memory.conversations.length > 2000) {
        memory.conversations = memory.conversations.slice(0, 2000);
      }

      await chrome.storage.local.set({ [this.storageKey]: memory });

      console.log('[PersistentMemory] Conversation saved:', conversation.id);
      return conversation;
    } catch (error) {
      console.error('[PersistentMemory] Failed to save conversation:', error);
      return null;
    }
  }

  /**
   * Search articles and conversations by query
   * @param {string} query - Search query
   * @returns {Promise<object>} - { articles: [], conversations: [] }
   */
  async search(query) {
    await this.initialize();

    try {
      const stored = await chrome.storage.local.get(this.storageKey);
      const memory = stored[this.storageKey];

      const queryLower = query.toLowerCase();

      // Search articles
      const matchingArticles = memory.articles.filter(article => {
        return article.title?.toLowerCase().includes(queryLower) ||
               article.summary?.toLowerCase().includes(queryLower) ||
               article.url?.toLowerCase().includes(queryLower);
      }).slice(0, 10); // Limit to 10 results

      // Search conversations
      const matchingConversations = memory.conversations.filter(conv => {
        return conv.question?.toLowerCase().includes(queryLower) ||
               conv.answer?.toLowerCase().includes(queryLower) ||
               conv.title?.toLowerCase().includes(queryLower);
      }).slice(0, 10);

      console.log('[PersistentMemory] Search results:', {
        query,
        articlesFound: matchingArticles.length,
        conversationsFound: matchingConversations.length
      });

      return {
        articles: matchingArticles,
        conversations: matchingConversations
      };
    } catch (error) {
      console.error('[PersistentMemory] Search failed:', error);
      return { articles: [], conversations: [] };
    }
  }

  /**
   * Get recent articles (last N articles)
   * @param {number} limit - Number of articles to retrieve
   */
  async getRecentArticles(limit = 10) {
    await this.initialize();

    try {
      const stored = await chrome.storage.local.get(this.storageKey);
      const memory = stored[this.storageKey];

      return memory.articles.slice(0, limit);
    } catch (error) {
      console.error('[PersistentMemory] Failed to get recent articles:', error);
      return [];
    }
  }

  /**
   * Get article by URL
   * @param {string} url - Article URL
   */
  async getArticleByUrl(url) {
    await this.initialize();

    try {
      const stored = await chrome.storage.local.get(this.storageKey);
      const memory = stored[this.storageKey];

      const article = memory.articles.find(a => a.url === url);

      if (article) {
        // Update access count
        article.accessCount = (article.accessCount || 0) + 1;
        article.lastAccessedAt = Date.now();
        await chrome.storage.local.set({ [this.storageKey]: memory });
      }

      return article || null;
    } catch (error) {
      console.error('[PersistentMemory] Failed to get article by URL:', error);
      return null;
    }
  }

  /**
   * Get all memories (for export/debugging)
   */
  async getAllMemories() {
    await this.initialize();

    try {
      const stored = await chrome.storage.local.get(this.storageKey);
      return stored[this.storageKey];
    } catch (error) {
      console.error('[PersistentMemory] Failed to get all memories:', error);
      return null;
    }
  }

  /**
   * Clear all persistent memory (use with caution!)
   */
  async clearAll() {
    await chrome.storage.local.remove(this.storageKey);
    this.initialized = false;
    console.log('[PersistentMemory] All memories cleared');
  }
}

export const sessionMemory = new SessionMemory();
export const persistentMemory = new PersistentMemory();
