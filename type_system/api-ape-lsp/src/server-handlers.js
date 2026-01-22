/**
 * @fileoverview Request handlers for api-ape LSP server
 *
 * Contains handlers for file change notifications and schema requests.
 */

/**
 * Register controller file change handlers
 *
 * @param {import('vscode-languageserver').Connection} connection - LSP connection
 * @param {import('./schema/manager').SchemaManager} schemaManager - Schema manager
 * @returns {void}
 */
function registerControllerHandlers(connection, schemaManager) {
  connection.onRequest("apiApe/controllerChanged", async (params) => {
    connection.console.log(`[LSP] ========================================`);
    connection.console.log(`[LSP] Controller CHANGED: ${params.file}`);
    connection.console.log(`[LSP]   Triggering schema refresh (fromControllers: true)...`);
    await schemaManager.refresh({ fromControllers: true });
    connection.console.log(`[LSP]   Schema refresh complete`);
    connection.console.log(`[LSP] ========================================`);
    return { success: true };
  });

  connection.onRequest("apiApe/controllerAdded", async (params) => {
    connection.console.log(`[LSP] ========================================`);
    connection.console.log(`[LSP] Controller ADDED: ${params.file}`);
    connection.console.log(`[LSP]   Triggering schema refresh (fromControllers: true)...`);
    await schemaManager.refresh({ fromControllers: true });
    connection.console.log(`[LSP]   Schema refresh complete`);
    connection.console.log(`[LSP] ========================================`);
    return { success: true };
  });

  connection.onRequest("apiApe/controllerDeleted", async (params) => {
    connection.console.log(`[LSP] ========================================`);
    connection.console.log(`[LSP] Controller DELETED: ${params.file}`);
    connection.console.log(`[LSP]   Triggering schema refresh (fromControllers: true)...`);
    await schemaManager.refresh({ fromControllers: true });
    connection.console.log(`[LSP]   Schema refresh complete`);
    connection.console.log(`[LSP] ========================================`);
    return { success: true };
  });

  connection.onRequest("apiApe/getSchema", async () => {
    const schema = await schemaManager.getSchema();
    return schema;
  });
}

/**
 * Register execute command handler
 *
 * @param {import('vscode-languageserver').Connection} connection - LSP connection
 * @param {import('./schema/manager').SchemaManager} schemaManager - Schema manager
 * @returns {void}
 */
function registerCommandHandler(connection, schemaManager) {
  connection.onExecuteCommand(async (params) => {
    switch (params.command) {
      case "apiApe.refreshSchema":
        await schemaManager.refresh();
        connection.console.log("Schema refreshed");
        return { success: true };

      case "apiApe.generateTypes":
        try {
          const outputDir = params.arguments?.[0] || ".api-ape";
          const result = await schemaManager.generateTypes(outputDir);
          connection.console.log(`Types generated at ${result.typesPath}`);
          return {
            success: true,
            outputPath: result.outputPath,
            typesPath: result.typesPath,
            schemaPath: result.schemaPath,
          };
        } catch (err) {
          connection.console.error(`Failed to generate types: ${err.message}`);
          return { success: false, error: err.message };
        }

      case "apiApe.getStatus":
        try {
          const status = await schemaManager.getStatus();
          return status;
        } catch (err) {
          connection.console.error(`Failed to get status: ${err.message}`);
          return {
            serverConnected: false,
            schemaSource: "none",
            endpointCount: 0,
            error: err.message,
          };
        }
    }
  });
}

module.exports = {
  registerControllerHandlers,
  registerCommandHandler,
};
