/**
 * @fileoverview Schema Manager for api-ape LSP
 *
 * Manages fetching and caching of api-ape schema from either
 * a running server or local controller files.
 */

const fs = require("fs");
const path = require("path");
const { URL } = require("url");

/** @type {typeof import('@api-ape/schema') | null} */
let schemaPackage = null;

/**
 * Lazily load @api-ape/schema package
 *
 * @returns {typeof import('@api-ape/schema') | null}
 */
function getSchemaPackage() {
  if (schemaPackage === null) {
    try {
      schemaPackage = require("@api-ape/schema");
    } catch {
      // Package not installed, try relative path
      try {
        schemaPackage = require("../../api-ape-schema/src");
      } catch {
        schemaPackage = undefined;
      }
    }
  }
  return schemaPackage || null;
}

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
    this.workspaceRoot = options.workspaceRoot
      ? new URL(options.workspaceRoot).pathname
      : null;
    this.serverUrl = options.serverUrl || "http://localhost:3000";
    this.controllersPath = options.controllersPath || "api";
    this.schema = null;
    this.lastFetch = 0;
    this.cacheDuration = 5000; // 5 seconds
    this.lastError = null;
    this.schemaSource = null; // 'server', 'file', 'generated', or null
    this.logger = options.logger || console;
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
      this.schemaSource = "server";
      this.lastError = null;
      this.logger.log?.(`Schema fetched from server: ${this.schema?.endpoints?.length || 0} endpoints`);
      return this.schema;
    } catch (err) {
      this.logger.warn?.(`Failed to fetch schema from server: ${err.message}`);
      this.lastError = err.message;

      // Fall back to local schema file
      const fileSchema = this.loadFromFile();
      if (fileSchema) {
        this.schemaSource = "file";
        this.logger.log?.(`Schema loaded from file: ${fileSchema?.endpoints?.length || 0} endpoints`);
        return fileSchema;
      }

      // Try to generate from controllers
      const generatedSchema = this.generateFromControllers();
      if (generatedSchema) {
        this.schema = generatedSchema;
        this.schemaSource = "generated";
        this.lastFetch = now;
        this.logger.log?.(`Schema generated from controllers: ${generatedSchema?.endpoints?.length || 0} endpoints`);
        return generatedSchema;
      }

      this.schemaSource = null;
      this.logger.error?.("No schema available from any source");
      return null;
    }
  }

  /**
   * Get current status information
   *
   * @returns {Promise<object>} Status object with connection info
   */
  async getStatus() {
    // Ensure we have fresh schema
    await this.getSchema();

    return {
      serverConnected: this.schemaSource === "server",
      schemaSource: this.schemaSource || "none",
      endpointCount: this.schema?.endpoints?.length || 0,
      lastError: this.lastError,
      serverUrl: this.serverUrl,
      cacheAge: this.lastFetch ? Date.now() - this.lastFetch : null,
    };
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

  /**
   * Generate TypeScript declaration files from schema
   *
   * Creates .api-ape/api-ape.d.ts and .api-ape/schema.json in the workspace
   *
   * @param {string} [outputDir='.api-ape'] - Output directory relative to workspace root
   * @returns {Promise<{outputPath: string, typesPath: string, schemaPath: string}>}
   */
  async generateTypes(outputDir = ".api-ape") {
    if (!this.workspaceRoot) {
      throw new Error("No workspace root configured");
    }

    // Get or fetch schema
    let schema = await this.getSchema();

    // If no schema from server, try to generate from local controllers
    if (!schema) {
      const pkg = getSchemaPackage();
      if (pkg && pkg.generateSchema) {
        const controllersDir = path.join(this.workspaceRoot, this.controllersPath);
        if (fs.existsSync(controllersDir)) {
          schema = pkg.generateSchema(controllersDir);
        }
      }
    }

    if (!schema) {
      throw new Error("No schema available - ensure server is running or controllers exist");
    }

    // Get the type generator
    const pkg = getSchemaPackage();
    if (!pkg || !pkg.generateTypeDeclarations) {
      throw new Error("@api-ape/schema package not found");
    }

    // Generate TypeScript declarations
    const types = pkg.generateTypeDeclarations(schema);

    // Create output directory
    const outputPath = path.join(this.workspaceRoot, outputDir);
    await fs.promises.mkdir(outputPath, { recursive: true });

    // Write files
    const typesPath = path.join(outputPath, "api-ape.d.ts");
    const schemaPath = path.join(outputPath, "schema.json");

    await fs.promises.writeFile(typesPath, types, "utf-8");
    await fs.promises.writeFile(
      schemaPath,
      JSON.stringify(schema, null, 2),
      "utf-8"
    );

    return { outputPath, typesPath, schemaPath };
  }

  /**
   * Generate schema from local controller files
   *
   * @returns {object|null} The generated schema or null
   */
  generateFromControllers() {
    if (!this.workspaceRoot) return null;

    const pkg = getSchemaPackage();
    if (!pkg || !pkg.generateSchema) return null;

    const controllersDir = path.join(this.workspaceRoot, this.controllersPath);
    if (!fs.existsSync(controllersDir)) return null;

    try {
      return pkg.generateSchema(controllersDir);
    } catch {
      return null;
    }
  }
}

module.exports = { SchemaManager, getSchemaPackage };
