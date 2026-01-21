/**
 * @fileoverview String Matching Utilities for api-ape LSP
 *
 * Provides string comparison and similarity functions for endpoint suggestions.
 */

/**
 * Calculate Levenshtein distance between two strings
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find similar endpoints using Levenshtein distance
 *
 * @param {string} path - Endpoint path to match
 * @param {Array} endpoints - Array of endpoint objects
 * @returns {string[]} Array of similar endpoint paths
 */
function findSimilarEndpoints(path, endpoints) {
  const results = endpoints
    .map((e) => ({
      path: e.path,
      distance: levenshteinDistance(path, e.path),
    }))
    .filter((r) => r.distance <= 3) // Max 3 edits
    .sort((a, b) => a.distance - b.distance)
    .map((r) => r.path);

  return results.slice(0, 3);
}

module.exports = {
  levenshteinDistance,
  findSimilarEndpoints,
};
