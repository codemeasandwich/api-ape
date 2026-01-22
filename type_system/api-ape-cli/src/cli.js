/**
 * @fileoverview CLI for api-ape type generation
 *
 * Generates TypeScript declarations from api-ape controller files,
 * providing IntelliSense and type checking without a running server.
 */

const { program } = require("commander");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");
const { generateSchema, generateTypes } = require("./index");

program
  .name("api-ape-types")
  .description("Generate TypeScript types from api-ape controllers")
  .version("1.0.0")
  .requiredOption(
    "-c, --controllers <path>",
    "Path to controllers directory (e.g., ./api)"
  )
  .option("-o, --output <path>", "Output directory", ".api-ape")
  .option("-w, --watch", "Watch for changes and regenerate")
  .option("-v, --verbose", "Verbose output")
  .parse();

const options = program.opts();

/**
 * Resolve paths relative to current working directory
 */
const controllersDir = path.resolve(process.cwd(), options.controllers);
const outputDir = path.resolve(process.cwd(), options.output);

/**
 * Log message if verbose mode is enabled
 *
 * @param {...any} args - Arguments to log
 */
function log(...args) {
  if (options.verbose) {
    console.log("[api-ape-types]", ...args);
  }
}

/**
 * Generate types and write to output directory
 */
function generate() {
  const startTime = Date.now();

  // Verify controllers directory exists
  if (!fs.existsSync(controllersDir)) {
    console.error(`Error: Controllers directory not found: ${controllersDir}`);
    process.exit(1);
  }

  // Generate schema (scan both .js and .ts files)
  log(`Scanning controllers in: ${controllersDir}`);
  const schema = generateSchema(controllersDir, { extensions: ["js", "ts"] });
  log(`Found ${schema.endpoints.length} endpoints`);

  // Generate TypeScript declarations
  const types = generateTypes(schema);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    log(`Created output directory: ${outputDir}`);
  }

  // Write schema.json
  const schemaPath = path.join(outputDir, "schema.json");
  fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
  log(`Wrote schema to: ${schemaPath}`);

  // Write api-ape.d.ts
  const typesPath = path.join(outputDir, "api-ape.d.ts");
  fs.writeFileSync(typesPath, types);
  log(`Wrote types to: ${typesPath}`);

  // Write tsconfig.json if it doesn't exist
  const tsconfigPath = path.join(outputDir, "tsconfig.json");
  if (!fs.existsSync(tsconfigPath)) {
    const tsconfig = {
      compilerOptions: {
        types: [],
      },
      files: ["api-ape.d.ts"],
    };
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
    log(`Wrote tsconfig to: ${tsconfigPath}`);
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `Generated types for ${schema.endpoints.length} endpoints in ${elapsed}ms`
  );

  // Print endpoint summary if verbose
  if (options.verbose) {
    console.log("\nEndpoints:");
    for (const endpoint of schema.endpoints) {
      console.log(`  /${endpoint.path}`);
    }
  }
}

/**
 * Main execution
 */
try {
  // Initial generation
  generate();

  // Watch mode
  if (options.watch) {
    console.log(`\nWatching for changes in: ${controllersDir}`);

    const watcher = chokidar.watch(controllersDir, {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,
    });

    // Debounce regeneration
    let debounceTimer = null;
    const debounceMs = 100;

    /**
     * Schedule type regeneration with debouncing
     *
     * @param {string} eventType - Type of file event
     * @param {string} filepath - Path to changed file
     */
    function scheduleRegenerate(eventType, filepath) {
      log(`${eventType}: ${filepath}`);

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        console.log("\nRegenerating types...");
        try {
          generate();
        } catch (err) {
          console.error("Error regenerating types:", err.message);
        }
        debounceTimer = null;
      }, debounceMs);
    }

    watcher
      .on("add", (filepath) => scheduleRegenerate("Added", filepath))
      .on("change", (filepath) => scheduleRegenerate("Changed", filepath))
      .on("unlink", (filepath) => scheduleRegenerate("Removed", filepath));

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\nStopping watcher...");
      watcher.close();
      process.exit(0);
    });
  }
} catch (err) {
  console.error("Error:", err.message);
  if (options.verbose) {
    console.error(err.stack);
  }
  process.exit(1);
}
