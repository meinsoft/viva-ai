// Persistent Memory System for Viva.AI
// Remembers articles, summaries, conversations forever

/**
 * PersistentMemory - Long-term memory storage using Chrome Storage API
 * Stores summaries, articles, conversations, and facts for eternal recall
 */
class PersistentMemory {
  constructor() {
    this.storageKey = 'viva_persistent_memory';
    this.indexKey = 'viva_memory_index';
  }

  /**
   * Save an article summary to long-term memory
   * @param {object} articleData - Article information and summary
   */
  async saveArticle(articleData) {
    try {
      const { url, title, summary, content, timestamp } = articleData;

      if (!url || !title || !summary) {
        console.warn('[PersistentMemory] Missing required fields for article');
        return { success: false, error: 'Missing required fields' };
      }

      // Create memory entry
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

      // Save to storage
      const memories = await this.getMemories();
      memories.push(memoryEntry);

      await chrome.storage.local.set({ [this.storageKey]: memories });

      // Update search index
      await this.updateIndex(memoryEntry);

      console.log('[PersistentMemory] Article saved:', title);

      return { success: true, id: memoryEntry.id };
    } catch (error) {
      console.error('[PersistentMemory] Error saving article:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save a Q&A conversation to long-term memory
   * @param {object} qaData - Question and answer data
   */
  async saveQA(qaData) {
    try {
      const { question, answer, url, title, context, timestamp } = qaData;

      if (!question || !answer) {
        console.warn('[PersistentMemory] Missing question or answer');
        return { success: false, error: 'Missing question or answer' };
      }

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
      console.error('[PersistentMemory] Error saving Q&A:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search memories by query
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching memories
   */
  async searchMemories(query) {
    try {
      const memories = await this.getMemories();

      if (!query || query.trim().length === 0) {
        // Return recent memories if no query
        return memories.slice(-20).reverse();
      }

      const queryKeywords = this.extractKeywords(query);
      const queryLower = query.toLowerCase();

      // Score and rank memories
      const scored = memories.map(memory => {
        let score = 0;

        // Exact text match in title/question/summary
        if (memory.title && memory.title.toLowerCase().includes(queryLower)) {
          score += 50;
        }

        if (memory.question && memory.question.toLowerCase().includes(queryLower)) {
          score += 50;
        }

        if (memory.summary && memory.summary.toLowerCase().includes(queryLower)) {
          score += 30;
        }

        if (memory.answer && memory.answer.toLowerCase().includes(queryLower)) {
          score += 30;
        }

        // Keyword matching
        if (memory.keywords) {
          for (const keyword of queryKeywords) {
            if (memory.keywords.includes(keyword)) {
              score += 10;
            }
          }
        }

        // Recency bonus (more recent = higher score)
        const age = Date.now() - (memory.timestamp || 0);
        const recencyScore = Math.max(0, 20 - (age / (1000 * 60 * 60 * 24))); // Decays over days
        score += recencyScore;

        return { ...memory, score };
      });

      // Filter and sort
      const matches = scored
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // Top 10 results

      console.log('[PersistentMemory] Found', matches.length, 'matches for:', query);

      return matches;
    } catch (error) {
      console.error('[PersistentMemory] Error searching memories:', error);
      return [];
    }
  }

  /**
   * Get all memories from storage
   * @returns {Promise<Array>} All memories
   */
  async getMemories() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      return result[this.storageKey] || [];
    } catch (error) {
      console.error('[PersistentMemory] Error getting memories:', error);
      return [];
    }
  }

  /**
   * Get memory statistics
   * @returns {Promise<object>} Memory stats
   */
  async getStats() {
    try {
      const memories = await this.getMemories();

      const stats = {
        total: memories.length,
        articles: memories.filter(m => m.type === 'article').length,
        qas: memories.filter(m => m.type === 'qa').length,
        oldestTimestamp: memories.length > 0 ? Math.min(...memories.map(m => m.timestamp || 0)) : null,
        newestTimestamp: memories.length > 0 ? Math.max(...memories.map(m => m.timestamp || 0)) : null
      };

      return stats;
    } catch (error) {
      console.error('[PersistentMemory] Error getting stats:', error);
      return { total: 0, articles: 0, qas: 0 };
    }
  }

  /**
   * Clear all memories (use with caution!)
   */
  async clearAll() {
    try {
      await chrome.storage.local.remove([this.storageKey, this.indexKey]);
      console.log('[PersistentMemory] All memories cleared');
      return { success: true };
    } catch (error) {
      console.error('[PersistentMemory] Error clearing memories:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Extract keywords from text for indexing
   * @param {string} text - Text to extract keywords from
   * @returns {Array<string>} Keywords
   */
  extractKeywords(text) {
    if (!text) return [];

    // Remove common stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i',
      'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when',
      'where', 'why', 'how'
    ]);

    // Extract words
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Get unique keywords
    return [...new Set(words)];
  }

  /**
   * Update search index for memory entry
   * @param {object} entry - Memory entry
   */
  async updateIndex(entry) {
    try {
      const result = await chrome.storage.local.get([this.indexKey]);
      const index = result[this.indexKey] || {};

      // Index by keywords
      for (const keyword of entry.keywords) {
        if (!index[keyword]) {
          index[keyword] = [];
        }
        index[keyword].push(entry.id);
      }

      await chrome.storage.local.set({ [this.indexKey]: index });
    } catch (error) {
      console.error('[PersistentMemory] Error updating index:', error);
    }
  }

  /**
   * Generate unique ID for memory entry
   * @param {string} seed - Seed string for ID generation
   * @returns {string} Unique ID
   */
  generateId(seed) {
    return seed.replace(/[^a-z0-9]/gi, '_').substring(0, 50) + '_' + Date.now();
  }
}

// Export singleton instance
export const persistentMemory = new PersistentMemory();
