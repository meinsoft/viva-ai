// HTTP Client Utility

/**
 * Simple HTTP client for API calls
 */
export const httpClient = {
  /**
   * Make a GET request
   * @param {string} url - URL to fetch
   * @param {object} options - Fetch options
   * @returns {Promise<any>} Response data
   */
  async get(url, options = {}) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Make a POST request
   * @param {string} url - URL to post to
   * @param {object} data - Data to send
   * @param {object} options - Fetch options
   * @returns {Promise<any>} Response data
   */
  async post(url, data, options = {}) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(data),
      ...options
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }
};

export default httpClient;
