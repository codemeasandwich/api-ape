/**
 * @fileoverview Stream Buffer Parser for api-ape HTTP Streaming Transport
 *
 * This module provides utilities for parsing JSON objects from streaming
 * HTTP response data. When using HTTP streaming as a fallback transport,
 * the server sends multiple JSON objects over a single connection. This
 * parser extracts complete JSON objects from the incoming byte stream.
 *
 * ## The Challenge
 *
 * HTTP streaming delivers data in arbitrary chunks - a single JSON object
 * might span multiple chunks, or one chunk might contain multiple objects.
 * This parser maintains a buffer and uses brace-counting to detect complete
 * JSON objects.
 *
 * ## Parsing Strategy
 *
 * The parser counts `{` and `}` characters while properly handling:
 * - String literals (braces inside strings don't count)
 * - Escape sequences (backslash escaping)
 * - Nested objects and arrays
 *
 * When brace depth returns to zero, a complete JSON object has been found.
 *
 * @module client/transports/streamParser
 * @see {@link module:client/transports/streaming} for the streaming transport
 *
 * @example
 * import { parseStreamBuffer } from './streamParser'
 *
 * let buffer = ''
 *
 * // As chunks arrive from the stream
 * socket.on('data', (chunk) => {
 *   buffer += chunk
 *   const { messages, remaining } = parseStreamBuffer(buffer)
 *   buffer = remaining
 *
 *   for (const msg of messages) {
 *     handleMessage(msg)
 *   }
 * })
 */

import jss from "../../utils/jss";

/**
 * Parse JSON objects from a streaming buffer using brace counting
 *
 * This function extracts complete JSON objects from a buffer that may
 * contain partial data. It correctly handles strings containing braces
 * by tracking the in-string state.
 *
 * ## Algorithm
 *
 * 1. Iterate through each character in the buffer
 * 2. Track escape sequences (`\`) to handle `\"` properly
 * 3. Track string boundaries (`"`) to ignore braces inside strings
 * 4. Count `{` as +1 depth, `}` as -1 depth
 * 5. When depth returns to 0, extract and parse the complete JSON
 * 6. Continue parsing for more objects
 * 7. Return unparsed remainder for the next chunk
 *
 * ## Edge Cases Handled
 *
 * - Escaped quotes: `\"` doesn't toggle string state
 * - Nested objects: `{"a":{"b":1}}` parses as one object
 * - Multiple objects: `{}{}{}` yields three objects
 * - Partial data: `{"a":1` returns empty messages, full buffer as remaining
 * - Braces in strings: `{"text":"{hello}"}` parses correctly
 *
 * @param {string} buffer - Raw streaming buffer content (accumulated chunks)
 * @returns {{messages: Object[], remaining: string}} Parse result object
 * @property {Object[]} messages - Array of successfully parsed JSON objects
 * @property {string} remaining - Unparsed portion of the buffer (partial JSON)
 *
 * @example
 * // Single complete object
 * const result = parseStreamBuffer('{"type":"ping"}')
 * // result.messages = [{ type: 'ping' }]
 * // result.remaining = ''
 *
 * @example
 * // Multiple complete objects
 * const result = parseStreamBuffer('{"a":1}{"b":2}{"c":3}')
 * // result.messages = [{ a: 1 }, { b: 2 }, { c: 3 }]
 * // result.remaining = ''
 *
 * @example
 * // Partial object at end
 * const result = parseStreamBuffer('{"a":1}{"b":')
 * // result.messages = [{ a: 1 }]
 * // result.remaining = '{"b":'
 *
 * @example
 * // Object with nested structure
 * const result = parseStreamBuffer('{"user":{"name":"Alice","age":30}}')
 * // result.messages = [{ user: { name: 'Alice', age: 30 } }]
 *
 * @example
 * // String containing braces (handled correctly)
 * const result = parseStreamBuffer('{"template":"{name} says {message}"}')
 * // result.messages = [{ template: '{name} says {message}' }]
 *
 * @example
 * // Continuous streaming usage
 * let buffer = ''
 *
 * function onChunk(chunk) {
 *   buffer += chunk
 *   const { messages, remaining } = parseStreamBuffer(buffer)
 *   buffer = remaining  // Save partial data for next chunk
 *
 *   messages.forEach(msg => {
 *     if (msg.type === '__heartbeat__') return  // Skip heartbeats
 *     processMessage(msg)
 *   })
 * }
 *
 * @example
 * // Escaped characters in strings
 * const result = parseStreamBuffer('{"quote":"\\"Hello\\""}')
 * // result.messages = [{ quote: '"Hello"' }]
 */
export function parseStreamBuffer(buffer) {
  /** @type {Object[]} Array of successfully parsed messages */
  const messages = [];

  /** @type {number} Start index of current JSON object (-1 if not in object) */
  let start = -1;

  /** @type {number} Current brace nesting depth */
  let depth = 0;

  /** @type {boolean} Whether currently inside a string literal */
  let inString = false;

  /** @type {boolean} Whether the previous character was a backslash escape */
  let escaped = false;

  // Process each character in the buffer
  for (let i = 0; i < buffer.length; i++) {
    const char = buffer[i];

    // If previous char was backslash, this char is escaped - skip it
    if (escaped) {
      escaped = false;
      continue;
    }

    // Backslash inside string starts an escape sequence
    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }

    // Toggle string state on unescaped quotes
    if (char === '"') {
      inString = !inString;
      continue;
    }

    // Skip brace counting while inside strings
    if (inString) continue;

    // Track brace depth
    if (char === "{") {
      if (depth === 0) start = i; // Mark start of new JSON object
      depth++;
    } else if (char === "}") {
      depth--;

      // Depth returning to 0 means we have a complete object
      if (depth === 0 && start !== -1) {
        const jsonStr = buffer.slice(start, i + 1);

        try {
          // Parse with JSS to handle extended types (Date, RegExp, etc.)
          messages.push(jss.parse(jsonStr));
        } catch (e) {
          console.error("🦍 Failed to parse stream message:", e);
        }

        start = -1; // Reset for next object
      }
    }
  }

  // Calculate remaining unparsed data
  // If we're mid-object (start !== -1), keep from start
  // Otherwise, buffer is empty or only whitespace
  const remaining = start !== -1 ? buffer.slice(start) : "";

  return { messages, remaining };
}
