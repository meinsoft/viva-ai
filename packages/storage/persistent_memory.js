// Persistent Memory System for Viva.AI
// Stores articles, experiments, Q&A sessions with chrome.storage.local

import { logger } from '@viva-ai/utils/logger.js';

/**
 * PersistentMemory - Long-term knowledge storage for articles, experiments, and Q&A
 *
 * Storage Structure:
 * {
 *   articles: {
 *     [articleId]: {
 *       id, url, title, content, summary,
 *       metadata: { author, date, pageType, ... },
 *       experiments: [...],
 *       qaHistory: [...],
 *       visitedAt, summarizedAt, tags
 *     }
 *   },
 *   experiments: {
 *     [experimentId]: {
 *       id, title, description, articleId, articleUrl, extractedAt
 *     }
 *   },
 *   qaIndex: {
 *     [questionHash]: {
 *       question, answer, articleId, timestamp
 *     }
 *   },
 *   searchIndex: {
 *     // Inverted index for fast article search
 *     [keyword]: [articleIds...]
 *   }
 * }
 */
export class PersistentMemory {
  constructor() {
    this.storageKey = 'viva_ai_persistent_memory';
    this.articles = new Map();
    this.experiments = new Map();
    this.qaIndex = new Map();
    this.searchIndex = new Map();
    this.loaded = false;
  }

  /**
   * Initialize and load from chrome.storage.local
   */
  async initialize() {
    if (this.loaded) return;

    try {
      const stored = await this._getFromStorage();

      if (stored && stored.articles) {
        this.articles = new Map(Object.entries(stored.articles));
        this.experiments = new Map(Object.entries(stored.experiments || {}));
        this.qaIndex = new Map(Object.entries(stored.qaIndex || {}));
        this.searchIndex = new Map(Object.entries(stored.searchIndex || {}));
      }

      this.loaded = true;
      logger.info(`Persistent memory loaded: ${this.articles.size} articles, ${this.experiments.size} experiments`);
    } catch (error) {
      logger.error('Failed to load persistent memory:', error);
      // Continue with empty memory
      this.loaded = true;
    }
  }

  /**
   * Save an article with its content and summary
   */
  async saveArticle({ url, title, content, summary, metadata = {} }) {
    await this.initialize();

    const articleId = this._generateArticleId(url);

    const article = {
      id: articleId,
      url,
      title,
      content: content.substring(0, 50000), // Limit to 50k chars
      summary,
      metadata,
      experiments: [],
      qaHistory: [],
      visitedAt: Date.now(),
      summarizedAt: summary ? Date.now() : null,
      tags: this._extractTags(title + ' ' + content)
    };

    this.articles.set(articleId, article);

    // Update search index
    this._updateSearchIndex(articleId, title + ' ' + content);

    await this._saveToStorage();

    logger.info(`Article saved: ${title} (${articleId})`);
    return articleId;
  }

  /**
   * Add an experiment extracted from an article
   */
  async addExperiment({ title, description, articleId, articleUrl }) {
    await this.initialize();

    const experimentId = this._generateId('exp', title);

    const experiment = {
      id: experimentId,
      title,
      description,
      articleId,
      articleUrl,
      extractedAt: Date.now()
    };

    this.experiments.set(experimentId, experiment);

    // Add experiment to article's experiment list
    const article = this.articles.get(articleId);
    if (article) {
      article.experiments.push(experimentId);
      this.articles.set(articleId, article);
    }

    await this._saveToStorage();

    logger.info(`Experiment added: ${title} (${experimentId})`);
    return experimentId;
  }

  /**
   * Save Q&A session for an article
   */
  async saveQA({ question, answer, articleId }) {
    await this.initialize();

    const qaEntry = {
      question,
      answer,
      articleId,
      timestamp: Date.now()
    };

    const questionHash = this._hashString(question);
    this.qaIndex.set(questionHash, qaEntry);

    // Add to article's QA history
    const article = this.articles.get(articleId);
    if (article) {
      article.qaHistory.push(qaEntry);
      this.articles.set(articleId, article);
    }

    await this._saveToStorage();

    logger.info(`Q&A saved for article ${articleId}`);
    return qaEntry;
  }

  /**
   * Find article by URL or ID
   */
  async findArticle(urlOrId) {
    await this.initialize();

    // Try as ID first
    if (this.articles.has(urlOrId)) {
      return this.articles.get(urlOrId);
    }

    // Try as URL
    const articleId = this._generateArticleId(urlOrId);
    return this.articles.get(articleId);
  }

  /**
   * Search articles by keywords
   */
  async searchArticles(query, limit = 10) {
    await this.initialize();

    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
    const scores = new Map();

    // Score articles based on keyword matches
    for (const keyword of keywords) {
      if (this.searchIndex.has(keyword)) {
        const articleIds = this.searchIndex.get(keyword);
        for (const articleId of articleIds) {
          scores.set(articleId, (scores.get(articleId) || 0) + 1);
        }
      }
    }

    // Sort by score and return top results
    const results = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([articleId]) => this.articles.get(articleId))
      .filter(article => article !== undefined);

    return results;
  }

  /**
   * Find experiments related to keywords
   */
  async searchExperiments(query) {
    await this.initialize();

    const queryLower = query.toLowerCase();
    const results = Array.from(this.experiments.values())
      .filter(exp =>
        exp.title.toLowerCase().includes(queryLower) ||
        exp.description.toLowerCase().includes(queryLower)
      );

    return results;
  }

  /**
   * Get all Q&A for an article
   */
  async getArticleQA(articleId) {
    await this.initialize();

    const article = this.articles.get(articleId);
    return article ? article.qaHistory : [];
  }

  /**
   * Get article by URL or create placeholder
   */
  async getOrCreateArticle(url) {
    await this.initialize();

    let article = await this.findArticle(url);

    if (!article) {
      const articleId = this._generateArticleId(url);
      article = {
        id: articleId,
        url,
        title: null,
        content: null,
        summary: null,
        metadata: {},
        experiments: [],
        qaHistory: [],
        visitedAt: Date.now(),
        summarizedAt: null,
        tags: []
      };
      this.articles.set(articleId, article);
      await this._saveToStorage();
    }

    return article;
  }

  /**
   * Get statistics about stored knowledge
   */
  async getStats() {
    await this.initialize();

    return {
      totalArticles: this.articles.size,
      totalExperiments: this.experiments.size,
      totalQAs: this.qaIndex.size,
      articlesWithSummaries: Array.from(this.articles.values()).filter(a => a.summary).length,
      recentArticles: Array.from(this.articles.values())
        .sort((a, b) => b.visitedAt - a.visitedAt)
        .slice(0, 5)
        .map(a => ({ title: a.title, url: a.url, visitedAt: a.visitedAt }))
    };
  }

  /**
   * Clear all stored data (use with caution!)
   */
  async clearAll() {
    this.articles.clear();
    this.experiments.clear();
    this.qaIndex.clear();
    this.searchIndex.clear();
    await this._saveToStorage();
    logger.warn('All persistent memory cleared');
  }

  // Private helper methods

  _generateArticleId(url) {
    return this._hashString(url);
  }

  _generateId(prefix, text) {
    return `${prefix}_${this._hashString(text)}_${Date.now()}`;
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  _extractTags(text, maxTags = 10) {
    // Simple tag extraction: get most common meaningful words
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);

    const freq = new Map();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTags)
      .map(([word]) => word);
  }

  _updateSearchIndex(articleId, text) {
    const keywords = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const uniqueKeywords = [...new Set(keywords)];

    for (const keyword of uniqueKeywords) {
      if (!this.searchIndex.has(keyword)) {
        this.searchIndex.set(keyword, []);
      }
      const articleIds = this.searchIndex.get(keyword);
      if (!articleIds.includes(articleId)) {
        articleIds.push(articleId);
      }
    }
  }

  async _getFromStorage() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([this.storageKey], (result) => {
          resolve(result[this.storageKey] || null);
        });
      } else {
        // Fallback for non-extension environments
        const stored = localStorage.getItem(this.storageKey);
        resolve(stored ? JSON.parse(stored) : null);
      }
    });
  }

  async _saveToStorage() {
    const data = {
      articles: Object.fromEntries(this.articles),
      experiments: Object.fromEntries(this.experiments),
      qaIndex: Object.fromEntries(this.qaIndex),
      searchIndex: Object.fromEntries(this.searchIndex),
      lastUpdated: Date.now()
    };

    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [this.storageKey]: data }, () => {
          resolve();
        });
      } else {
        // Fallback for non-extension environments
        localStorage.setItem(this.storageKey, JSON.stringify(data));
        resolve();
      }
    });
  }
}

// Export singleton instance
export const persistentMemory = new PersistentMemory();
