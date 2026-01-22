/**
 * @fileoverview Schema generation utilities for Schema Manager
 *
 * Local file loading and schema generation from controllers.
 */

const fs = require("fs");
const path = require("path");

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
      try {
        schemaPackage = require("../../../api-ape-schema/src");
      } catch {
        schemaPackage = undefined;
      }
    }
  }
  return schemaPackage || null;
}

/**
 * Find the actual api-ape project root within the workspace
 *
 * @param {string|null} workspaceRoot - The VS Code workspace root
 * @param {string} controllersPath - The controllers directory name
 * @param {object} logger - Logger instance
 * @returns {string|null} The actual project root
 */
function findProjectRoot(workspaceRoot, controllersPath, logger) {
  logger.log?.(`[MGR] findProjectRoot() starting`);
  logger.log?.(`[MGR]   workspaceRoot: ${workspaceRoot}`);
  logger.log?.(`[MGR]   controllersPath: ${controllersPath}`);

  if (!workspaceRoot) {
    logger.warn?.(`[MGR]   No workspaceRoot provided, returning null`);
    return null;
  }

  const directPath = path.join(workspaceRoot, controllersPath);
  logger.log?.(`[MGR]   Checking direct path: ${directPath}`);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
    logger.log?.(`[MGR]   Found controllers directly at workspace root`);
    return workspaceRoot;
  }
  logger.log?.(`[MGR]   Controllers not at root, searching subdirectories...`);

  /**
   * Recursively search directories for controllers folder
   * @param {string} dir - Directory to search
   * @param {number} depth - Current search depth
   * @returns {string|null} Path to project root or null if not found
   */
  const searchDirs = (dir, depth = 0) => {
    if (depth > 3) return null;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;

        const subdir = path.join(dir, entry.name);
        const controllersDir = path.join(subdir, controllersPath);
        if (fs.existsSync(controllersDir) && fs.statSync(controllersDir).isDirectory()) {
          logger.log?.(`[MGR]   Found controllers at: ${subdir}`);
          return subdir;
        }

        const found = searchDirs(subdir, depth + 1);
        if (found) return found;
      }
    } catch {
      // Ignore permission errors
    }

    return null;
  };

  const found = searchDirs(workspaceRoot);
  if (found) {
    logger.log?.(`[MGR]   Project root found: ${found}`);
  } else {
    logger.log?.(`[MGR]   No project root found, using workspace root: ${workspaceRoot}`);
  }
  return found || workspaceRoot;
}

/**
 * Load schema from local file (.api-ape/schema.json)
 *
 * @param {string|null} workspaceRoot - Workspace root path
 * @param {object} logger - Logger instance
 * @returns {object|null} The schema object or null if not found
 */
function loadFromFile(workspaceRoot, logger) {
  logger.log?.(`[MGR] loadFromFile() called`);
  if (!workspaceRoot) {
    logger.warn?.(`[MGR]   No workspaceRoot, cannot load from file`);
    return null;
  }

  const schemaPath = path.join(workspaceRoot, ".api-ape", "schema.json");
  logger.log?.(`[MGR]   Checking: ${schemaPath}`);

  if (!fs.existsSync(schemaPath)) {
    logger.log?.(`[MGR]   File does not exist`);
    return null;
  }

  try {
    logger.log?.(`[MGR]   File exists, reading...`);
    const content = fs.readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(content);
    logger.log?.(`[MGR]   Loaded ${schema?.endpoints?.length || 0} endpoints from file`);
    return schema;
  } catch (err) {
    logger.error?.(`[MGR]   Failed to parse schema file: ${err.message}`);
    return null;
  }
}

/**
 * Generate schema from local controller files
 *
 * @param {string|null} workspaceRoot - Workspace root path
 * @param {string} controllersPath - Controllers directory name
 * @param {object} logger - Logger instance
 * @returns {object|null} The generated schema or null
 */
function generateFromControllers(workspaceRoot, controllersPath, logger) {
  logger.log?.(`[MGR] generateFromControllers() called`);

  if (!workspaceRoot) {
    logger.warn?.(`[MGR]   No workspaceRoot, cannot generate from controllers`);
    return null;
  }

  const pkg = getSchemaPackage();
  if (!pkg) {
    logger.error?.(`[MGR]   @api-ape/schema package not found (not installed)`);
    return null;
  }
  if (!pkg.generateSchema) {
    logger.error?.(`[MGR]   @api-ape/schema package has no generateSchema function`);
    return null;
  }
  logger.log?.(`[MGR]   @api-ape/schema package loaded successfully`);

  const controllersDir = path.join(workspaceRoot, controllersPath);
  logger.log?.(`[MGR]   Controllers directory: ${controllersDir}`);

  if (!fs.existsSync(controllersDir)) {
    logger.error?.(`[MGR]   Controllers directory does not exist: ${controllersDir}`);
    return null;
  }
  logger.log?.(`[MGR]   Controllers directory exists, generating schema...`);

  try {
    const schema = pkg.generateSchema(controllersDir, { logger });
    logger.log?.(`[MGR]   Schema generated: ${schema?.endpoints?.length || 0} endpoints`);
    return schema;
  } catch (err) {
    logger.error?.(`[MGR]   Schema generation failed: ${err.message}`);
    logger.error?.(`[MGR]   Stack: ${err.stack}`);
    return null;
  }
}

/**
 * Generate TypeScript declaration files from schema
 *
 * @param {string} workspaceRoot - Workspace root path
 * @param {string} controllersPath - Controllers directory name
 * @param {object} schema - Schema object
 * @param {string} outputDir - Output directory relative to workspace root
 * @param {object} logger - Logger instance
 * @returns {Promise<{outputPath: string, typesPath: string, schemaPath: string}>}
 */
async function generateTypes(workspaceRoot, controllersPath, schema, outputDir, logger) {
  if (!workspaceRoot) {
    throw new Error("No workspace root configured");
  }

  let schemaToUse = schema;

  if (!schemaToUse) {
    const pkg = getSchemaPackage();
    if (pkg && pkg.generateSchema) {
      const controllersDir = path.join(workspaceRoot, controllersPath);
      if (fs.existsSync(controllersDir)) {
        schemaToUse = pkg.generateSchema(controllersDir);
      }
    }
  }

  if (!schemaToUse) {
    throw new Error("No schema available - ensure server is running or controllers exist");
  }

  const pkg = getSchemaPackage();
  if (!pkg || !pkg.generateTypeDeclarations) {
    throw new Error("@api-ape/schema package not found");
  }

  const types = pkg.generateTypeDeclarations(schemaToUse);
  const outputPath = path.join(workspaceRoot, outputDir);
  await fs.promises.mkdir(outputPath, { recursive: true });

  const typesPath = path.join(outputPath, "api-ape.d.ts");
  const schemaPath = path.join(outputPath, "schema.json");

  await fs.promises.writeFile(typesPath, types, "utf-8");
  await fs.promises.writeFile(schemaPath, JSON.stringify(schemaToUse, null, 2), "utf-8");

  return { outputPath, typesPath, schemaPath };
}

module.exports = {
  getSchemaPackage,
  findProjectRoot,
  loadFromFile,
  generateFromControllers,
  generateTypes,
};
