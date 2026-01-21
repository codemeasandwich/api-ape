/**
 * @fileoverview API Explorer TreeView Provider
 *
 * Provides a sidebar panel showing all api-ape endpoints organized by namespace.
 */

const vscode = require("vscode");

/**
 * Tree item representing an endpoint or namespace
 */
class EndpointTreeItem extends vscode.TreeItem {
  /**
   * @param {string} label - Display label
   * @param {vscode.TreeItemCollapsibleState} collapsibleState - Whether item can be expanded
   * @param {object} [endpoint] - Endpoint data (if this is an endpoint, not namespace)
   * @param {string} [namespace] - Namespace path for grouping
   */
  constructor(label, collapsibleState, endpoint, namespace) {
    super(label, collapsibleState);
    this.endpoint = endpoint;
    this.namespace = namespace;

    if (endpoint) {
      // This is an endpoint (leaf node)
      this.contextValue = "endpoint";
      this.iconPath = new vscode.ThemeIcon("symbol-method");
      this.tooltip = this.createTooltip(endpoint);
      this.description = this.getReturnType(endpoint);

      // Make clickable to go to definition
      if (endpoint.filePath) {
        this.command = {
          command: "vscode.open",
          title: "Go to Definition",
          arguments: [
            vscode.Uri.file(endpoint.filePath),
            { selection: new vscode.Range(endpoint.line || 0, 0, endpoint.line || 0, 0) },
          ],
        };
      }
    } else {
      // This is a namespace (folder node)
      this.contextValue = "namespace";
      this.iconPath = new vscode.ThemeIcon("symbol-namespace");
    }
  }

  /**
   * Create tooltip markdown for endpoint
   *
   * @param {object} endpoint - Endpoint data
   * @returns {vscode.MarkdownString}
   */
  createTooltip(endpoint) {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`**\`api.${endpoint.path.replace(/\//g, ".")}\`**\n\n`);

    if (endpoint.description) {
      md.appendMarkdown(`${endpoint.description}\n\n`);
    }

    if (endpoint.input) {
      md.appendMarkdown(`**Input:** \`${this.formatType(endpoint.input)}\`\n\n`);
    }

    if (endpoint.output) {
      md.appendMarkdown(`**Returns:** \`${this.formatType(endpoint.output)}\`\n\n`);
    }

    if (endpoint.filePath) {
      md.appendMarkdown(`*${endpoint.filePath}*`);
    }

    return md;
  }

  /**
   * Get return type as description string
   *
   * @param {object} endpoint - Endpoint data
   * @returns {string}
   */
  getReturnType(endpoint) {
    if (!endpoint.output) return "";
    return `→ ${this.formatType(endpoint.output)}`;
  }

  /**
   * Format type for display
   *
   * @param {object|string} type - Type definition
   * @returns {string}
   */
  formatType(type) {
    if (!type) return "void";
    if (typeof type === "string") return type;

    switch (type.kind) {
      case "primitive":
        return type.name || "unknown";
      case "array":
        return `${this.formatType(type.elementType)}[]`;
      case "object":
        return "object";
      case "promise":
        return `Promise<${this.formatType(type.resolvedType)}>`;
      case "union":
        return type.types?.map((t) => this.formatType(t)).join(" | ") || "unknown";
      default:
        return type.name || "unknown";
    }
  }
}

/**
 * TreeDataProvider for api-ape endpoints
 */
class EndpointTreeProvider {
  /**
   * @param {import('vscode-languageclient/node').LanguageClient} client - LSP client
   */
  constructor(client) {
    this.client = client;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.schema = null;
    this.endpointTree = null;
  }

  /**
   * Refresh the tree view
   */
  async refresh() {
    this.schema = null;
    this.endpointTree = null;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Build tree structure from flat endpoints
   *
   * @param {Array} endpoints - Flat array of endpoints
   * @returns {object} Tree structure
   */
  buildTree(endpoints) {
    const tree = {};

    for (const endpoint of endpoints) {
      const parts = endpoint.path.split("/");
      let current = tree;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          current[part] = { _children: {} };
        }
        current = current[part]._children;
      }

      // Add endpoint at leaf
      const leafName = parts[parts.length - 1];
      current[leafName] = { _endpoint: endpoint };
    }

    return tree;
  }

  /**
   * Get tree item for element
   *
   * @param {EndpointTreeItem} element
   * @returns {vscode.TreeItem}
   */
  getTreeItem(element) {
    return element;
  }

  /**
   * Get children for tree element
   *
   * @param {EndpointTreeItem} [element] - Parent element (undefined for root)
   * @returns {Promise<EndpointTreeItem[]>}
   */
  async getChildren(element) {
    // Fetch schema if not cached
    if (!this.schema) {
      try {
        const result = await this.client.sendRequest("workspace/executeCommand", {
          command: "apiApe.refreshSchema",
        });

        // Get schema via a custom request
        const schemaResult = await this.client.sendRequest("apiApe/getSchema", {});
        this.schema = schemaResult;
        this.endpointTree = this.schema?.endpoints
          ? this.buildTree(this.schema.endpoints)
          : {};
      } catch (err) {
        console.error("Failed to fetch schema for explorer:", err);
        return [];
      }
    }

    if (!this.endpointTree) {
      return [];
    }

    // Get the subtree for this element
    let subtree = this.endpointTree;
    if (element && element.namespace) {
      const parts = element.namespace.split("/");
      for (const part of parts) {
        subtree = subtree[part]?._children || {};
      }
    }

    // Convert subtree to tree items
    const items = [];
    for (const [key, value] of Object.entries(subtree)) {
      if (value._endpoint) {
        // Leaf node (endpoint)
        items.push(
          new EndpointTreeItem(
            key,
            vscode.TreeItemCollapsibleState.None,
            value._endpoint,
            null
          )
        );
      } else if (value._children) {
        // Namespace node
        const namespacePath = element?.namespace ? `${element.namespace}/${key}` : key;
        const childCount = this.countEndpoints(value._children);
        const item = new EndpointTreeItem(
          key,
          vscode.TreeItemCollapsibleState.Collapsed,
          null,
          namespacePath
        );
        item.description = `(${childCount})`;
        items.push(item);
      }
    }

    // Sort: namespaces first, then endpoints alphabetically
    items.sort((a, b) => {
      if (a.contextValue === "namespace" && b.contextValue !== "namespace") return -1;
      if (a.contextValue !== "namespace" && b.contextValue === "namespace") return 1;
      return a.label.localeCompare(b.label);
    });

    return items;
  }

  /**
   * Count total endpoints in a subtree
   *
   * @param {object} subtree
   * @returns {number}
   */
  countEndpoints(subtree) {
    let count = 0;
    for (const value of Object.values(subtree)) {
      if (value._endpoint) {
        count++;
      } else if (value._children) {
        count += this.countEndpoints(value._children);
      }
    }
    return count;
  }
}

/**
 * Register the API Explorer TreeView
 *
 * @param {vscode.ExtensionContext} context
 * @param {import('vscode-languageclient/node').LanguageClient} client
 * @returns {EndpointTreeProvider}
 */
function registerExplorer(context, client) {
  const treeProvider = new EndpointTreeProvider(client);

  const treeView = vscode.window.createTreeView("apiApeEndpoints", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.explorer.refresh", () => {
      treeProvider.refresh();
    })
  );

  // Insert call command
  context.subscriptions.push(
    vscode.commands.registerCommand("apiApe.explorer.insertCall", (item) => {
      if (!item?.endpoint) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active editor to insert API call");
        return;
      }

      const endpoint = item.endpoint;
      const apiPath = `api.${endpoint.path.replace(/\//g, ".")}`;
      const snippet = endpoint.input
        ? new vscode.SnippetString(`${apiPath}({ $1 })`)
        : new vscode.SnippetString(`${apiPath}()`);

      editor.insertSnippet(snippet);
    })
  );

  context.subscriptions.push(treeView);

  return treeProvider;
}

module.exports = { registerExplorer, EndpointTreeProvider, EndpointTreeItem };
