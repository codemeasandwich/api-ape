/**
 * @fileoverview Fake Browser Environment for api-ape Client Testing
 *
 * This module provides a simulated browser environment that allows api-ape's
 * client code to run in Node.js. It mocks the essential browser globals:
 *
 * - window / document / navigator
 * - WebSocket (using 'ws' package to connect to real servers)
 * - fetch (using native Node.js fetch)
 * - localStorage / sessionStorage
 *
 * @module simulator/harness/fake-browser
 *
 * @example
 * const { FakeBrowser } = require('./fake-browser')
 *
 * // Create and install fake browser
 * const browser = new FakeBrowser()
 * browser.install()
 *
 * // Now api-ape client code can run
 * const api = require('api-ape')
 *
 * // Cleanup when done
 * browser.uninstall()
 */

const WebSocket = require("ws");
const { EventEmitter } = require("events");

/**
 * Simple in-memory storage implementation for localStorage/sessionStorage
 */
class FakeStorage {
  constructor() {
    this._data = new Map();
  }

  getItem(key) {
    return this._data.get(key) ?? null;
  }

  setItem(key, value) {
    this._data.set(key, String(value));
  }

  removeItem(key) {
    this._data.delete(key);
  }

  clear() {
    this._data.clear();
  }

  get length() {
    return this._data.size;
  }

  key(index) {
    return [...this._data.keys()][index] ?? null;
  }
}

/**
 * Fake navigator object with online/offline simulation
 */
class FakeNavigator {
  constructor() {
    this._online = true;
    this.userAgent = "FakeBrowser/1.0 (api-ape simulator)";
    this.language = "en-US";
    this.languages = ["en-US", "en"];
    this.platform = "FakeBrowser";
  }

  get onLine() {
    return this._online;
  }

  setOnline(value) {
    this._online = value;
  }
}

/**
 * Fake document object with minimal DOM support
 */
class FakeDocument extends EventEmitter {
  constructor() {
    super();
    this.cookie = "";
    this.readyState = "complete";
    this.visibilityState = "visible";
    this.hidden = false;
  }

  // Minimal DOM methods that might be called
  createElement(tag) {
    return { tagName: tag.toUpperCase(), style: {} };
  }

  getElementById() {
    return null;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  addEventListener(type, handler) {
    this.on(type, handler);
  }

  removeEventListener(type, handler) {
    this.off(type, handler);
  }
}

/**
 * Fake window object that ties everything together
 */
class FakeWindow extends EventEmitter {
  constructor(options = {}) {
    super();

    this.document = new FakeDocument();
    this.navigator = new FakeNavigator();
    this.localStorage = new FakeStorage();
    this.sessionStorage = new FakeStorage();

    // Location
    this.location = {
      protocol: options.protocol || "http:",
      host: options.host || "localhost:3000",
      hostname: options.hostname || "localhost",
      port: options.port || "3000",
      pathname: options.pathname || "/",
      search: "",
      hash: "",
      href: `${options.protocol || "http:"}//${options.host || "localhost:3000"}/`,
      origin: `${options.protocol || "http:"}//${options.host || "localhost:3000"}`,
    };

    // Timers (pass through to Node.js)
    this.setTimeout = setTimeout;
    this.clearTimeout = clearTimeout;
    this.setInterval = setInterval;
    this.clearInterval = clearInterval;
    this.setImmediate = setImmediate;
    this.clearImmediate = clearImmediate;

    // Console
    this.console = console;

    // WebSocket - use real 'ws' package
    this.WebSocket = WebSocket;

    // Fetch - use native Node.js fetch
    this.fetch = globalThis.fetch;

    // Performance API (basic)
    this.performance = {
      now: () => Date.now(),
      timing: { navigationStart: Date.now() },
    };

    // Request/Response for fetch (if needed)
    this.Request = globalThis.Request;
    this.Response = globalThis.Response;
    this.Headers = globalThis.Headers;

    // Blob and File (use Node.js buffer-based approach)
    this.Blob = globalThis.Blob;
    this.File = globalThis.File;
    this.ArrayBuffer = ArrayBuffer;
    this.Uint8Array = Uint8Array;

    // URL APIs
    this.URL = URL;
    this.URLSearchParams = URLSearchParams;

    // Event constructors
    this.Event = class Event {
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = options.bubbles || false;
        this.cancelable = options.cancelable || false;
        this.defaultPrevented = false;
      }
      preventDefault() {
        this.defaultPrevented = true;
      }
      stopPropagation() {}
    };

    this.CustomEvent = class CustomEvent extends this.Event {
      constructor(type, options = {}) {
        super(type, options);
        this.detail = options.detail || null;
      }
    };

    this.MessageEvent = class MessageEvent extends this.Event {
      constructor(type, options = {}) {
        super(type, options);
        this.data = options.data;
        this.origin = options.origin || "";
        this.lastEventId = options.lastEventId || "";
      }
    };

    this.CloseEvent = class CloseEvent extends this.Event {
      constructor(type, options = {}) {
        super(type, options);
        this.code = options.code || 1000;
        this.reason = options.reason || "";
        this.wasClean = options.wasClean || true;
      }
    };
  }

  addEventListener(type, handler) {
    this.on(type, handler);
  }

  removeEventListener(type, handler) {
    this.off(type, handler);
  }

  dispatchEvent(event) {
    this.emit(event.type, event);
    return !event.defaultPrevented;
  }

  /**
   * Simulate going offline
   */
  goOffline() {
    this.navigator.setOnline(false);
    this.dispatchEvent(new this.Event("offline"));
  }

  /**
   * Simulate coming online
   */
  goOnline() {
    this.navigator.setOnline(true);
    this.dispatchEvent(new this.Event("online"));
  }

  /**
   * Update location (e.g., for testing different server URLs)
   */
  setLocation(url) {
    const parsed = new URL(url);
    this.location.protocol = parsed.protocol;
    this.location.host = parsed.host;
    this.location.hostname = parsed.hostname;
    this.location.port = parsed.port;
    this.location.pathname = parsed.pathname;
    this.location.search = parsed.search;
    this.location.hash = parsed.hash;
    this.location.href = parsed.href;
    this.location.origin = parsed.origin;
  }
}

/**
 * Main FakeBrowser class that manages the simulated environment
 */
class FakeBrowser {
  /**
   * Create a new FakeBrowser instance
   * @param {Object} options - Configuration options
   * @param {string} [options.url='http://localhost:3000'] - Base URL for the browser
   */
  constructor(options = {}) {
    const url = options.url || "http://localhost:3000";
    const parsed = new URL(url);

    this.window = new FakeWindow({
      protocol: parsed.protocol,
      host: parsed.host,
      hostname: parsed.hostname,
      port: parsed.port,
      pathname: parsed.pathname,
    });

    this._installed = false;
    this._originalGlobals = {};
  }

  /**
   * Install the fake browser globals
   * This makes api-ape client code think it's running in a browser
   */
  install() {
    if (this._installed) {
      return this;
    }

    // Save original globals (only the ones we can safely modify)
    this._originalGlobals = {
      window: global.window,
      document: global.document,
      navigator: global.navigator,
      localStorage: global.localStorage,
      sessionStorage: global.sessionStorage,
      WebSocket: global.WebSocket,
    };

    // Install fake globals (avoid read-only globals like MessageEvent)
    global.window = this.window;
    global.document = this.window.document;
    global.navigator = this.window.navigator;
    global.localStorage = this.window.localStorage;
    global.sessionStorage = this.window.sessionStorage;
    global.WebSocket = this.window.WebSocket;

    this._installed = true;
    return this;
  }

  /**
   * Uninstall the fake browser globals
   * Restores the original Node.js environment
   */
  uninstall() {
    if (!this._installed) {
      return this;
    }

    // Restore original globals
    for (const [key, value] of Object.entries(this._originalGlobals)) {
      if (value === undefined) {
        delete global[key];
      } else {
        global[key] = value;
      }
    }

    this._installed = false;
    return this;
  }

  /**
   * Update the browser's URL (affects api-ape's connection target)
   * @param {string} url - The new URL
   */
  setUrl(url) {
    this.window.setLocation(url);
    return this;
  }

  /**
   * Simulate the browser going offline
   */
  goOffline() {
    this.window.goOffline();
    return this;
  }

  /**
   * Simulate the browser coming online
   */
  goOnline() {
    this.window.goOnline();
    return this;
  }

  /**
   * Set a cookie (used for session ID testing)
   * @param {string} name - Cookie name
   * @param {string} value - Cookie value
   */
  setCookie(name, value) {
    const existing = this.window.document.cookie;
    if (existing) {
      this.window.document.cookie = `${existing}; ${name}=${value}`;
    } else {
      this.window.document.cookie = `${name}=${value}`;
    }
    return this;
  }

  /**
   * Clear all cookies
   */
  clearCookies() {
    this.window.document.cookie = "";
    return this;
  }

  /**
   * Get the window object for direct manipulation
   * @returns {FakeWindow}
   */
  getWindow() {
    return this.window;
  }

  /**
   * Get the document object for direct manipulation
   * @returns {FakeDocument}
   */
  getDocument() {
    return this.window.document;
  }

  /**
   * Get the navigator object for direct manipulation
   * @returns {FakeNavigator}
   */
  getNavigator() {
    return this.window.navigator;
  }

  /**
   * Check if the fake browser is currently installed
   * @returns {boolean}
   */
  isInstalled() {
    return this._installed;
  }

  /**
   * Clear all storage
   */
  clearStorage() {
    this.window.localStorage.clear();
    this.window.sessionStorage.clear();
    return this;
  }

  /**
   * Reset the browser to a clean state
   */
  reset() {
    this.clearCookies();
    this.clearStorage();
    this.goOnline();
    return this;
  }
}

/**
 * Create a FakeBrowser instance configured for a specific server
 * @param {number} port - The server port
 * @returns {FakeBrowser}
 */
function createFakeBrowser(port = 3000) {
  return new FakeBrowser({
    url: `http://localhost:${port}`,
  });
}

module.exports = {
  FakeBrowser,
  FakeWindow,
  FakeDocument,
  FakeNavigator,
  FakeStorage,
  createFakeBrowser,
};
