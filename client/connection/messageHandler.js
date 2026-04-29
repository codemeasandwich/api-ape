/**
 * @fileoverview Message handling utilities for api-ape client
 *
 * Handles incoming message processing, including binary data hydration
 * and dispatching to registered handlers and subscription callbacks.
 *
 * @module client/connection/messageHandler
 */

import { apeLog } from "../../utils/apeLogger.js";
import {
  fetchLinkedResources,
  fetchSharedFiles,
} from "./fileDownload";
import {
  hasSubscribers,
  dispatch as dispatchToSubscribers,
} from "./subscriptions";

/**
 * Array of universal message receivers (called for all message types)
 * @type {Array<function({err: any, type: string, data: any}): void>}
 * @private
 */
const receiverArray = [];

/**
 * Map of type-specific message receivers
 * @type {Object.<string, Array<function({err: any, type: string, data: any}): void>>}
 * @private
 */
const ofTypesOb = {};

/**
 * Process incoming message data to hydrate binary resources
 *
 * This function handles two types of binary data references:
 * - L-tagged: Binary data linked from server responses (fetchLinkedResources)
 * - F-tagged: Shared files from other clients (fetchSharedFiles)
 *
 * @param {any} data - Raw data from server message
 * @param {Error|null} err - Error from the message, if any
 * @returns {Promise<any>} Hydrated data with binary resources fetched
 *
 * @example
 * // Server sends: { image<!L>: 'abc123' }
 * // After hydration: { image: ArrayBuffer }
 */
export async function processIncomingData(data, err) {
  if (!data || err) return data;
  try {
    let result = await fetchLinkedResources(data);
    return await fetchSharedFiles(result);
  } catch (e) {
    apeLog.error(`Failed to hydrate data:`, e);
    return data;
  }
}

/**
 * Dispatch a received message to all registered handlers
 *
 * Messages are delivered to:
 * 1. Chained subscription callbacks (new v2 syntax)
 * 2. Type-specific handlers registered via setOnReceiver(type, handler)
 * 3. Universal handlers registered via setOnReceiver(handler)
 *
 * @param {string} type - Message type identifier
 * @param {Error|null} err - Error payload, if any
 * @param {any} data - Message data payload
 */
export function dispatchMessage(type, err, data) {
  // Dispatch to chained subscription callbacks (v2 syntax)
  if (hasSubscribers(type)) {
    dispatchToSubscribers(type, data);
  }

  // Legacy handlers
  if (ofTypesOb[type]) ofTypesOb[type].forEach((w) => w({ err, type, data }));
  receiverArray.forEach((w) => w({ err, type, data }));
}

/**
 * Register a message receiver/handler
 *
 * @param {string|function} onTypeStFn - Message type to listen for, or universal handler function
 * @param {function=} handlerFn - Handler function (if first arg is type string)
 *
 * @example
 * // Type-specific handler
 * setOnReceiver('notification', (msg) => {
 *   console.log('Got notification:', msg.data)
 * })
 *
 * // Universal handler (receives all messages)
 * setOnReceiver((msg) => {
 *   console.log('Got message:', msg.type, msg.data)
 * })
 */
export function setOnReceiver(onTypeStFn, handlerFn) {
  if (typeof onTypeStFn === "string") {
    ofTypesOb[onTypeStFn] = [handlerFn];
  } else if (!receiverArray.includes(onTypeStFn)) {
    receiverArray.push(onTypeStFn);
  }
}
