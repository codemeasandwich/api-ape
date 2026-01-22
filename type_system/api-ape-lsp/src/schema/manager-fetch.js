/**
 * @fileoverview Fetch utilities for Schema Manager
 *
 * Server communication and schema fetching logic.
 */

/**
 * Fetch schema from running server (single attempt)
 *
 * @param {string} serverUrl - Server URL
 * @param {string} controllersPath - Controllers path
 * @param {number} fetchTimeout - Fetch timeout in ms
 * @returns {Promise<object>} The schema from server
 */
async function fetchFromServer(serverUrl, controllersPath, fetchTimeout) {
  const schemaUrl = `${serverUrl}/${controllersPath}/ape/schema`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), fetchTimeout);

  try {
    const response = await fetch(schemaUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`Connection timed out after ${fetchTimeout}ms`);
    }
    throw err;
  }
}

/**
 * Fetch schema from server with retry logic
 *
 * @param {string} serverUrl - Server URL
 * @param {string} controllersPath - Controllers path
 * @param {number} fetchTimeout - Fetch timeout in ms
 * @param {number} maxRetries - Max retry attempts
 * @param {number} baseRetryDelay - Base retry delay in ms
 * @returns {Promise<object>} The schema from server
 */
async function fetchFromServerWithRetry(serverUrl, controllersPath, fetchTimeout, maxRetries, baseRetryDelay) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFromServer(serverUrl, controllersPath, fetchTimeout);
    } catch (err) {
      lastError = err;

      // Don't retry on 4xx errors (not retryable)
      if (/^HTTP 4\d{2}:/.test(err.message)) {
        throw err;
      }

      if (attempt < maxRetries) {
        const delay = baseRetryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

module.exports = {
  fetchFromServer,
  fetchFromServerWithRetry,
};
