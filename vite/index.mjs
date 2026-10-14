/**
 * @fileoverview Vite Plugin for api-ape (ES Module version)
 *
 * This plugin integrates api-ape directly into Vite's dev server,
 * eliminating the need for a separate backend process and proxy configuration.
 *
 * ## Usage
 *
 * ```javascript
 * // vite.config.js
 * import { defineConfig } from 'vite'
 * import apiApe from 'api-ape/vite'
 *
 * export default defineConfig({
 *   plugins: [
 *     apiApe({
 *       where: 'api',
 *       // onConnect can be a path to load lazily (supports TS), or a function
 *       onConnect: './ape/onConnect'
 *     })
 *   ]
 * })
 * ```
 *
 * @module api-ape/vite
 */

import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);

/**
 * Create a Vite plugin for api-ape
 *
 * @param {Object} options - api-ape configuration options
 * @param {string} options.where - Directory containing API controllers (relative to project root)
 * @param {Function|string} [options.onConnect] - Connection lifecycle callback, or path to module exporting it
 * @param {Object} [options.fileTransferOptions] - File transfer configuration
 * @param {boolean|Object} [options.watch=true] - Hot-reload controllers (dev server only); `false` disables it
 * @param {Object} [options.origin] - Origin policy, see server/README.md "Origin check"
 * @returns {import('vite').Plugin} Vite plugin object
 */
export default function apiApePlugin(options = {}) {
  // Hot reload of controllers is on by default here: this plugin only runs under `vite serve`.
  // Pass `watch: false` to turn it off, or `watch: { paths: [...] }` to add service directories.
  const { where = "api", onConnect, watch = true, ...rest } = options;
  /** The previous api-ape instance, so a Vite restart can stop its file watcher. */
  let previous = null;
  let viteServer = null;

  return {
    name: "api-ape",
    apply: "serve", // Only runs in dev mode

    configureServer(server) {
      viteServer = server;

      // Wait for HTTP server to be available
      server.httpServer?.once("listening", async () => {
        // Load server module at runtime (not during config bundling)
        const serverApe = require("../server/lib/main");

        // Reset singleton state for Vite HMR compatibility
        serverApe._resetForTesting();
        if (previous) require("../server/utils/deepRequire").stopWatching(previous.core.controllers);

        // Resolve onConnect - it can be a function or a path to a module
        let resolvedOnConnect = onConnect;
        if (typeof onConnect === "string") {
          const modulePath = path.resolve(server.config.root, onConnect);
          try {
            // Use Vite's SSR module loader to handle TypeScript
            const mod = await server.ssrLoadModule(modulePath);
            resolvedOnConnect = mod.onConnect || mod.default || mod;
          } catch (e) {
            console.error(`  Failed to load onConnect from ${onConnect}:`, e.message);
          }
        }

        // Initialize api-ape on Vite's underlying HTTP server
        previous = serverApe(server.httpServer, {
          where,
          watch,
          onConnect: resolvedOnConnect,
          ...rest,
        });

        const address = server.httpServer.address();
        const port = typeof address === "object" ? address.port : address;

        console.log(`\n  api-ape initialized on Vite dev server`);
        console.log(`     WebSocket: ws://localhost:${port}/${where}/ape`);
        console.log(`     Controllers: ./${where}/\n`);
      });
    },
  };
}
