/**
 * Test a call with special characters in payload
 *
 * @param {Object} options - Options
 * @param {Object} options.client - Client instance
 * @param {string} options.endpoint - Endpoint to call
 * @param {number} [options.timeout=1000] - Timeout (ms)
 * @returns {Promise<{matches: boolean}>}
 */
async function callWithSpecialChars({ client, endpoint, timeout = 1000 }) {
  if (!client) {
    throw new Error('callWithSpecialChars: client required');
  }

  const specialStrings = {
    unicode: '日本語 中文 العربية',
    emoji: '😀🎉🚀',
    newlines: 'line1\nline2\r\nline3',
    tabs: 'col1\tcol2\tcol3',
    quotes: '"single\' and "double"',
    backslash: 'path\\to\\file',
    html: '<script>alert("xss")</script>',
    json: '{"nested":"json"}',
  };

  const result = await client.call(endpoint, specialStrings, timeout);

  // Verify all strings preserved
  let matches = true;
  for (const [key, value] of Object.entries(specialStrings)) {
    if (result[key] !== value) {
      matches = false;
      break;
    }
  }

  return { matches, sent: specialStrings, received: result };
}

module.exports = callWithSpecialChars;
