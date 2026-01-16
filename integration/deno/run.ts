#!/usr/bin/env -S deno run --allow-all
/**
 * Deno Integration Tests
 *
 * Tests api-ape running in Deno environment.
 *
 * Run with: deno run --allow-all run.ts
 */

import { resolve, relative } from "https://deno.land/std@0.208.0/path/mod.ts";

// Import api-ape using npm: specifier
// @ts-ignore - Dynamic import
const { ape } = await import("npm:../../server/index.js");

// Import shared test infrastructure
// @ts-ignore - CommonJS modules
const { scenarios } = await import("../shared/scenarios.js");
const { runScenarios } = await import("../shared/test-runner.js");

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

    // Cleanup
    httpServer.close();

    // Exit with appropriate code
    Deno.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error("Integration test failed:", err);
    Deno.exit(1);
});
