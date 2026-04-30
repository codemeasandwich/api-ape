/**
 * @fileoverview Simulated browser client instance for integration tests.
 *
 * Domain context: Mirrors browser/WebSocket client protocol (JSS, query IDs,
 * binary uploads) so scenarios exercise api-ape without a real browser.
 *
 * Technical context: Implementation is split across `client-instance-*-proto.js`
 * modules (transport, messaging, RPC, lifecycle) to satisfy line-count hooks;
 * methods are merged onto the prototype with `Object.assign`.
 *
 * @module simulator/harness/client-instance
 */

const { EventEmitter } = require("events");
const connectProto = require("./client-instance-connect-proto");
const messagingProto = require("./client-instance-messaging-proto");
const rpcProto = require("./client-instance-rpc-proto");
const lifecycleProto = require("./client-instance-lifecycle-proto");

/**
 * Wrapper around a single api-ape client connection.
 *
 * @class ClientInstance
 */
class ClientInstance extends EventEmitter {
  /**
   * Create a ClientInstance
   * @param {Object} config - Instance configuration
   * @param {string} config.id - Unique client id (harness scope)
   * @param {string} config.url - Server base URL
   * @param {string} config.apiPath - Mounted api-ape path segment
   * @param {string} config.transport - `websocket` or `polling`
   * @param {number} config.connectTimeout - Connection timeout (ms)
   * @param {Object} config.cookies - Cookie jar for simulated browser
   * @param {Object} config.manager - Owning client manager (`ClientManager` instance)
   */
  constructor(config) {
    super();

    /**
     * Unique client identifier
     * @type {string}
     */
    this.id = config.id;

    /**
     * Server URL this client connects to
     * @type {string}
     */
    this.url = config.url;

    /**
     * API path on the server
     * @type {string}
     */
    this.apiPath = config.apiPath;

    /**
     * Configured transport mode
     * @type {string}
     */
    this.transportMode = config.transport;

    /**
     * Connection timeout
     * @type {number}
     * @private
     */
    this._connectTimeout = config.connectTimeout;

    /**
     * Cookies to send with requests
     * @type {Object}
     * @private
     */
    this._cookies = config.cookies;

    /**
     * Reference to the client manager
     * @type {object}
     * @private
     */
    this._manager = config.manager;

    /**
     * WebSocket instance
     * @type {import('ws')|null}
     * @private
     */
    this._ws = null;

    /**
     * Current connection state
     * @type {string}
     */
    this.state = "disconnected";

    /**
     * Current transport type (after connection)
     * @type {string|null}
     */
    this.transport = null;

    /**
     * Whether the client is connected
     * @type {boolean}
     */
    this.connected = false;

    /**
     * Buffer of received broadcasts
     * @type {Array<{type: string, data: any, err: any, timestamp: number}>}
     */
    this.receivedMessages = [];

    /**
     * Map of pending request promises by query ID
     * @type {Map<string, {resolve: Function, reject: Function, timeout: NodeJS.Timeout}>}
     * @private
     */
    this._pendingRequests = new Map();

    /**
     * Map of pending waitFor promises by type
     * @type {Map<string, {resolve: Function, reject: Function, timeout: NodeJS.Timeout}>}
     * @private
     */
    this._waiters = new Map();

    /**
     * Message type handlers
     * @type {Map<string, Set<Function>>}
     * @private
     */
    this._handlers = new Map();

    /**
     * HTTP polling state (for polling transport)
     * @type {Object|null}
     * @private
     */
    this._polling = null;

    /**
     * Server-assigned client ID (received via __connected__ message)
     * Used for HTTP requests like binary uploads
     * @type {string|null}
     */
    this.serverClientId = null;
  }
}

Object.assign(ClientInstance.prototype, connectProto);
Object.assign(ClientInstance.prototype, messagingProto);
Object.assign(ClientInstance.prototype, rpcProto);
Object.assign(ClientInstance.prototype, lifecycleProto);

module.exports = { ClientInstance };
