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

export const sessionMemory = new SessionMemory();
