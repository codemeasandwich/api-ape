/**
 * @fileoverview Schema Manager for api-ape LSP
 *
 * Manages fetching and caching of api-ape schema from either
 * a running server or local controller files.
 */

const fs = require("fs");
const path = require("path");
const { URL } = require("url");

/**
 * Schema Manager
 *
 * Handles fetching schema from server or generating from local files.
 */
class SchemaManager {
  /**
   * Create a new SchemaManager
   *
   * @param {object} [options] - Configuration options
   * @param {string} [options.workspaceRoot] - Workspace root URI
   * @param {string} [options.serverUrl] - Server URL for fetching schema
   * @param {string} [options.controllersPath] - Path to controllers directory
   */
  constructor(options = {}) {
    this.workspaceRoot = options.workspaceRoot
      ? new URL(options.workspaceRoot).pathname
      : null;
    this.serverUrl = options.serverUrl || "http://localhost:3000";
    this.controllersPath = options.controllersPath || "api";
    this.schema = null;
    this.lastFetch = 0;
    this.cacheDuration = 5000; // 5 seconds
  }

  /**
   * Update settings
   *
   * @param {object} settings - New settings
   * @param {string} [settings.serverUrl] - Server URL
   * @param {string} [settings.controllersPath] - Controllers path
   */
  updateSettings(settings) {
    if (settings.serverUrl) this.serverUrl = settings.serverUrl;
    if (settings.controllersPath) this.controllersPath = settings.controllersPath;
    this.schema = null; // Invalidate cache
  }

  /**
   * Get schema (cached or fresh)
   *
   * @returns {Promise<object|null>} The schema object or null
   */
  async getSchema() {
    const now = Date.now();

    // Return cached if fresh enough
    if (this.schema && now - this.lastFetch < this.cacheDuration) {
      return this.schema;
    }

    // Try to fetch from server first
    try {
      this.schema = await this.fetchFromServer();
      this.lastFetch = now;
      return this.schema;
    } catch (err) {
      // Fall back to local schema file
      return this.loadFromFile();
    }
  }

  /**
   * Force refresh schema
   *
   * @returns {Promise<object|null>} The refreshed schema object or null
   */
  async refresh() {
    this.schema = null;
    this.lastFetch = 0;
    return this.getSchema();
  }

  /**
   * Fetch schema from running server
   *
   * @returns {Promise<object>} The schema from server
   */
  async fetchFromServer() {
    const schemaUrl = `${this.serverUrl}/${this.controllersPath}/ape/schema`;

    // Dynamic import for node-fetch (ESM module)
    const response = await fetch(schemaUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch schema: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Load schema from local file (.api-ape/schema.json)
   *
   * @returns {object|null} The schema object or null if not found
   */
  loadFromFile() {
    if (!this.workspaceRoot) return null;

    const schemaPath = path.join(this.workspaceRoot, ".api-ape", "schema.json");

    if (!fs.existsSync(schemaPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(schemaPath, "utf-8");
      this.schema = JSON.parse(content);
      this.lastFetch = Date.now();
      return this.schema;
    } catch (err) {
      return null;
    }
  }

  /**
   * Get endpoint by path
   *
   * @param {string} endpointPath - Endpoint path to find
   * @returns {object|null} The endpoint object or null
   */
  getEndpoint(endpointPath) {
    if (!this.schema || !this.schema.endpoints) return null;
    return this.schema.endpoints.find((e) => e.path === endpointPath);
  }

  /**
   * Find endpoints matching a prefix
   *
   * @param {string} prefix - Prefix to match
   * @returns {Array} Array of matching endpoints
   */
  findEndpointsByPrefix(prefix) {
    if (!this.schema || !this.schema.endpoints) return [];

    if (!prefix) return this.schema.endpoints;

    return this.schema.endpoints.filter(
      (e) => e.path === prefix || e.path.startsWith(prefix + "/")
    );
  }
}

module.exports = { SchemaManager };
