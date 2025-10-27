// JSON Extraction Utility

/**
 * Extract JSON from text that may contain markdown code fences
 * @param {string} text - Text that may contain JSON with or without fences
 * @returns {object|null} Parsed JSON object or null
 */
export function extractJson(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch (e) {
    // Continue to fence extraction
  }

  // Try to extract from markdown code fences
  const fencePatterns = [
    /```json\s*\n?([\s\S]*?)\n?```/,
    /```\s*\n?([\s\S]*?)\n?```/,
    /`([^`]+)`/
  ];

  for (const pattern of fencePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (e) {
        // Continue to next pattern
      }
    }
  }

  // Try to find any JSON object in the text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      // Failed to parse
    }
  }

  return null;
}

/**
 * Safe JSON parse with detailed error
 * @param {string} text - Text to parse
 * @returns {object} { success: boolean, data: object|null, error: string|null }
 */
export function safeJsonParse(text) {
  const data = extractJson(text);
  if (data) {
    return { success: true, data, error: null };
  }
  return { success: false, data: null, error: 'Failed to extract valid JSON from response' };
}

export default { extractJson, safeJsonParse };
