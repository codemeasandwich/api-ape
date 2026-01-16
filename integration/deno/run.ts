#!/usr/bin/env -S deno run --allow-all
/**
 * Deno Integration Tests
 *
 * Tests api-ape running in Deno environment.
 *
 * Run with: deno run --allow-all run.ts
 */

import { resolve, relative } from "https://deno.land/std@0.208.0/path/mod.ts";
// @ts-ignore - Node module compatibility
import { createRequire } from "node:module";

// Create a require function for CommonJS modules
const require = createRequire(import.meta.url);

// Import api-ape using require (CommonJS module)
const serverPath = resolve(Deno.cwd(), "server/index.js");
const { ape } = require(serverPath);

// Import shared test infrastructure (CommonJS modules)
const { scenarios } = require("../shared/scenarios.js");
const { runScenarios } = require("../shared/test-runner.js");

const PORT = 9102;

async function main() {
    console.log(`Deno version: ${Deno.version.deno}`);

    // Create server using Deno's native HTTP server
    const testApiPath = resolve(Deno.cwd(), "integration/test-api");
    const relPath = relative(Deno.cwd(), testApiPath);

    // Use node:http for compatibility
    // @ts-ignore
    const http = await import("node:http");

    const httpServer = http.createServer((req: any, res: any) => {
        res.writeHead(404);
        res.end("Not Found");
    });

    try {
        ape(httpServer, {
            where: relPath,
            onConnect: (socket: any, req: any, send: any) => {
                return { embed: { testMode: true, runtime: "deno" } };
            },
        });
    } catch (err) {
        console.log("Note: api-ape singleton reused");
    }

    // Start server
    await new Promise<void>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(PORT, () => {
            httpServer.removeListener("error", reject);
            resolve();
        });
    });

    console.log(`Server listening on port ${PORT}`);

    // Run tests - Deno has native WebSocket
    const { passed, failed } = await runScenarios({
        runtime: `Deno ${Deno.version.deno}`,
        server: { port: PORT, apiPath: relPath },
        WebSocket,
        // @ts-ignore
        Buffer: (await import("node:buffer")).Buffer,
        scenarios,
    });

    // Cleanup - wait for server to close
    await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
    });

    // Exit with appropriate code (use both Deno and process.exit for Node compat)
    const exitCode = failed > 0 ? 1 : 0;
    if (typeof process !== "undefined" && process.exit) {
        process.exit(exitCode);
    }
    Deno.exit(exitCode);
}

main().catch((err) => {
    console.error("Integration test failed:", err);
    if (typeof process !== "undefined" && process.exit) {
        process.exit(1);
    }
    Deno.exit(1);
});
