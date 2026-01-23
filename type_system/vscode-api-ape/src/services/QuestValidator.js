/**
 * @fileoverview Quest Validator Service
 * Executes validation checks for quest step completion.
 */

const vscode = require("vscode");
const path = require("path");

class QuestValidator {
  /**
   * @param {vscode.ExtensionContext} context
   * @param {import('./ActionTracker').ActionTracker} actionTracker
   */
  constructor(context, actionTracker) {
    this.context = context;
    this.actionTracker = actionTracker;
  }

  /**
   * Validate all validators for a quest step
   * @param {Array<{type: string, pattern?: string, in?: string}>} validators
   * @returns {Promise<{valid: boolean, results: Array<{type: string, passed: boolean, message: string}>}>}
   */
  async validateStep(validators) {
    if (!validators || validators.length === 0) {
      return { valid: true, results: [] };
    }

    const results = await Promise.all(validators.map((v) => this._validateOne(v)));
    const valid = results.every((r) => r.passed);
    return { valid, results };
  }

  /**
   * Execute a single validator
   * @param {{type: string, pattern?: string, in?: string, action?: string, count?: number}} validator
   * @returns {Promise<{type: string, passed: boolean, message: string}>}
   */
  async _validateOne(validator) {
    switch (validator.type) {
      case "file-exists":
        return this._validateFileExists(validator.pattern);

      case "code-contains":
        return this._validateCodeContains(validator.pattern, validator.in);

      case "has-import":
        return this._validateHasImport(validator.pattern, validator.in);

      case "typescript-usage":
        return this._validateTypescriptUsage();

      case "endpoint-called":
        return this._validateEndpointCalled();

      case "manual":
        return { type: "manual", passed: true, message: "Manual verification" };

      default:
        return { type: validator.type, passed: false, message: `Unknown validator: ${validator.type}` };
    }
  }

  /**
   * Check if file matching pattern exists
   * @param {string} pattern - Glob pattern
   * @returns {Promise<{type: string, passed: boolean, message: string}>}
   */
  async _validateFileExists(pattern) {
    if (!pattern) {
      return { type: "file-exists", passed: false, message: "No pattern specified" };
    }

    const files = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 1);
    const passed = files.length > 0;
    return {
      type: "file-exists",
      passed,
      message: passed ? `Found file matching ${pattern}` : `No file found matching ${pattern}`,
    };
  }

  /**
   * Check if code pattern exists in files
   * @param {string} pattern - Regex pattern
   * @param {string} [filePattern] - File glob pattern
   * @returns {Promise<{type: string, passed: boolean, message: string}>}
   */
  async _validateCodeContains(pattern, filePattern = "**/*.{js,ts}") {
    if (!pattern) {
      return { type: "code-contains", passed: false, message: "No pattern specified" };
    }

    const files = await vscode.workspace.findFiles(filePattern, "**/node_modules/**", 50);
    const regex = new RegExp(pattern);

    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const text = doc.getText();
        if (regex.test(text)) {
          return {
            type: "code-contains",
            passed: true,
            message: `Found pattern in ${path.basename(file.fsPath)}`,
          };
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return {
      type: "code-contains",
      passed: false,
      message: `Pattern "${pattern}" not found in ${filePattern}`,
    };
  }

  /**
   * Check if module is imported
   * @param {string} moduleName - Module to check for
   * @param {string} [filePattern] - File glob pattern
   * @returns {Promise<{type: string, passed: boolean, message: string}>}
   */
  async _validateHasImport(moduleName, filePattern = "**/*.{js,ts}") {
    if (!moduleName) {
      return { type: "has-import", passed: false, message: "No module specified" };
    }

    const importPatterns = [
      `import.*from\\s+['"]${moduleName}['"]`,
      `require\\s*\\(\\s*['"]${moduleName}['"]\\s*\\)`,
      `import\\s+['"]${moduleName}['"]`,
    ];
    const pattern = importPatterns.join("|");
    const result = await this._validateCodeContains(pattern, filePattern);
    return { ...result, type: "has-import" };
  }

  /**
   * Check for TypeScript usage in project
   * @returns {Promise<{type: string, passed: boolean, message: string}>}
   */
  async _validateTypescriptUsage() {
    const tsFiles = await vscode.workspace.findFiles("**/*.ts", "**/node_modules/**", 1);
    const tsConfig = await vscode.workspace.findFiles("**/tsconfig.json", "**/node_modules/**", 1);

    const passed = tsFiles.length > 0 || tsConfig.length > 0;
    return {
      type: "typescript-usage",
      passed,
      message: passed ? "TypeScript detected" : "No TypeScript files found",
    };
  }

  /**
   * Check if an API endpoint was called (via action tracker)
   * @returns {Promise<{type: string, passed: boolean, message: string}>}
   */
  async _validateEndpointCalled() {
    const count = this.actionTracker.getActionCount("api-call");
    const passed = count > 0;
    return {
      type: "endpoint-called",
      passed,
      message: passed ? `${count} API call(s) made` : "No API calls detected yet",
    };
  }
}

module.exports = { QuestValidator };
