/**
 * @fileoverview Schema Manager for api-ape LSP
 *
 * Manages fetching and caching of api-ape schema from either
 * a running server or local controller files.
 */

const path = require("path");
const { URL } = require("url");
const { fetchFromServerWithRetry } = require("./manager-fetch");
const {
  getSchemaPackage,
  findProjectRoot,
  loadFromFile,
  generateFromControllers,
  generateTypes,
} = require("./manager-generate");

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
   * @param {object} [options.logger] - Logger instance with log/warn/error methods
   */
  constructor(options = {}) {
    this.logger = options.logger || console;

    const rawWorkspaceRoot = options.workspaceRoot
      ? new URL(options.workspaceRoot).pathname
      : null;
    this.workspaceRoot = findProjectRoot(rawWorkspaceRoot, options.controllersPath || "api", this.logger);
    this.serverUrl = options.serverUrl || "http://localhost:3000";
    this.controllersPath = options.controllersPath || "api";
    this.schema = null;
    this.lastFetch = 0;
    this.baseCacheDuration = options.cacheDuration || 5000;
    this.maxCacheDuration = 60000;
    this.lastError = null;
    this.schemaSource = null;

    this.fetchTimeout = options.fetchTimeout || 5000;
    this.maxRetries = options.maxRetries || 2;
    this.baseRetryDelay = 1000;

    this.consecutiveFailures = 0;
    this.lastLoggedError = null;
    this.lastLoggedErrorTime = 0;
    this.errorLogSuppressionMs = 30000;

    this.logger.log?.(`[MGR] SchemaManager created:`);
    this.logger.log?.(`[MGR]   workspaceRoot: ${this.workspaceRoot}`);
    this.logger.log?.(`[MGR]   serverUrl: ${this.serverUrl}`);
    this.logger.log?.(`[MGR]   controllersPath: ${this.controllersPath}`);
  }

  /**
   * Update settings
   *
   * @param {object} settings - New settings
   */
  updateSettings(settings) {
    if (settings.serverUrl) this.serverUrl = settings.serverUrl;
    if (settings.controllersPath) this.controllersPath = settings.controllersPath;
    if (typeof settings.fetchTimeout === "number" && settings.fetchTimeout > 0) {
      this.fetchTimeout = Math.min(settings.fetchTimeout, 30000);
    }
    if (typeof settings.maxRetries === "number") {
      this.maxRetries = Math.max(0, Math.min(settings.maxRetries, 5));
    }
    this.schema = null;
  }

  /**
   * Get effective cache duration based on consecutive failures
   * @returns {number} Cache duration in milliseconds
   */
  getCacheDuration() {
    if (this.consecutiveFailures > 0) {
      const multiplier = Math.min(this.consecutiveFailures, 4);
      return Math.min(this.baseCacheDuration * Math.pow(2, multiplier), this.maxCacheDuration);
    }
    return this.baseCacheDuration;
  }

  /**
   * Log error with deduplication
   * @param {string} level - Log level
   * @param {string} message - Error message
   */
  logWithDeduplication(level, message) {
    const now = Date.now();
    const shouldLog = message !== this.lastLoggedError ||
      now - this.lastLoggedErrorTime > this.errorLogSuppressionMs;

    if (shouldLog) {
      if (level === "error") {
        this.logger.error?.(message);
      } else {
        this.logger.warn?.(message);
      }
      this.lastLoggedError = message;
      this.lastLoggedErrorTime = now;
    }
  }

  /**
   * Get schema (cached or fresh)
   * @returns {Promise<object|null>} The schema object or null
   */
  async getSchema() {
    const now = Date.now();
    const cacheDuration = this.getCacheDuration();

    this.logger.log?.(`[MGR] getSchema() called`);

    if (this.schema && now - this.lastFetch < cacheDuration) {
      this.logger.log?.(`[MGR]   CACHE HIT: returning cached schema`);
      return this.schema;
    }

    try {
      this.schema = await fetchFromServerWithRetry(
        this.serverUrl, this.controllersPath, this.fetchTimeout, this.maxRetries, this.baseRetryDelay
      );
      this.lastFetch = now;
      this.schemaSource = "server";
      this.lastError = null;
      this.consecutiveFailures = 0;
      this.logger.log?.(`[MGR]   SUCCESS: Schema fetched from server`);
      return this.schema;
    } catch (err) {
      this.lastError = err.message;
      this.consecutiveFailures++;
      this.logWithDeduplication("warn", `Failed to fetch schema from server: ${err.message}`);

      const fileSchema = loadFromFile(this.workspaceRoot, this.logger);
      if (fileSchema) {
        this.schema = fileSchema;
        this.schemaSource = "file";
        this.lastFetch = now;
        return fileSchema;
      }

      const generatedSchema = generateFromControllers(this.workspaceRoot, this.controllersPath, this.logger);
      if (generatedSchema) {
        this.schema = generatedSchema;
        this.schemaSource = "generated";
        this.lastFetch = now;
        return generatedSchema;
      }

      this.schemaSource = null;
      this.logWithDeduplication("error", "No schema available from any source");
      return null;
    }
  }

  /**
   * Get current status information
   * @returns {Promise<object>} Status object with connection info
   */
  async getStatus() {
    await this.getSchema();
    const cacheDuration = this.getCacheDuration();
    return {
      serverConnected: this.schemaSource === "server",
      schemaSource: this.schemaSource || "none",
      endpointCount: this.schema?.endpoints?.length || 0,
      lastError: this.lastError,
      serverUrl: this.serverUrl,
      cacheAge: this.lastFetch ? Date.now() - this.lastFetch : null,
      consecutiveFailures: this.consecutiveFailures,
      effectiveCacheDuration: cacheDuration,
      isStale: this.lastFetch ? Date.now() - this.lastFetch > cacheDuration : true,
    };
  }

  /**
   * Force refresh schema
   * @param {object} [options] - Refresh options
   * @returns {Promise<object|null>} The refreshed schema object or null
   */
  async refresh(options = {}) {
    this.schema = null;
    this.lastFetch = 0;

    if (options.fromControllers) {
      try {
        this.schema = await fetchFromServerWithRetry(
          this.serverUrl, this.controllersPath, this.fetchTimeout, this.maxRetries, this.baseRetryDelay
        );
        this.lastFetch = Date.now();
        this.schemaSource = "server";
        this.lastError = null;
        this.consecutiveFailures = 0;
        return this.schema;
      } catch (err) {
        this.lastError = err.message;
        this.consecutiveFailures++;
      }

      const generatedSchema = generateFromControllers(this.workspaceRoot, this.controllersPath, this.logger);
      if (generatedSchema) {
        this.schema = generatedSchema;
        this.schemaSource = "generated";
        this.lastFetch = Date.now();
        return generatedSchema;
      }

      return loadFromFile(this.workspaceRoot, this.logger);
    }

    return this.getSchema();
  }

  /**
   * Get endpoint by path
   * @param {string} endpointPath - Endpoint path to find
   * @returns {object|null} The endpoint object or null
   */
  getEndpoint(endpointPath) {
    if (!this.schema || !this.schema.endpoints) return null;
    return this.schema.endpoints.find((e) => e.path === endpointPath);
  }

  /**
   * Find endpoints matching a prefix
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

  /**
   * Generate TypeScript declaration files from schema
   * @param {string} [outputDir='.api-ape'] - Output directory
   * @returns {Promise<{outputPath: string, typesPath: string, schemaPath: string}>}
   */
  async generateTypes(outputDir = ".api-ape") {
    const schema = await this.getSchema();
    return generateTypes(this.workspaceRoot, this.controllersPath, schema, outputDir, this.logger);
  }
}

module.exports = { SchemaManager, getSchemaPackage };
