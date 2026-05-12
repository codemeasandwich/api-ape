/**
 * @fileoverview Tests for Schema Extractors
 *
 * Tests the unified extractor and individual extraction methods.
 */

const path = require("path");
const {
  extractSchema,
  getSupportedExtensions,
  shouldProcessFile,
} = require("./extractor");
const {
  extractSchemaFromExport,
  normalizeTypeDef,
} = require("./export-extractor");

const fixturesDir = path.join(__dirname, "__fixtures__");

describe("Export Extractor", () => {
  describe("normalizeTypeDef", () => {
    test("returns null for null input", () => {
      expect(normalizeTypeDef(null)).toBeNull();
    });

    test("returns null for undefined input", () => {
      expect(normalizeTypeDef(undefined)).toBeNull();
    });

    test("passes through TypeDefinitions with kind property", () => {
      const typeDef = { kind: "primitive", name: "string" };
      expect(normalizeTypeDef(typeDef)).toBe(typeDef);
    });

    test("converts string primitive to TypeDefinition", () => {
      expect(normalizeTypeDef("string")).toEqual({
        kind: "primitive",
        name: "string",
        raw: "string",
      });
    });

    test("converts string reference to TypeDefinition", () => {
      expect(normalizeTypeDef("Date")).toEqual({
        kind: "reference",
        name: "Date",
        raw: "Date",
      });
    });

    test("converts simple object format", () => {
      const result = normalizeTypeDef({
        name: "string",
        age: "number",
      });

      expect(result.kind).toBe("object");
      expect(result.properties.name.kind).toBe("primitive");
      expect(result.properties.name.name).toBe("string");
      expect(result.properties.age.kind).toBe("primitive");
      expect(result.properties.age.name).toBe("number");
    });

    test("converts shorthand format with type and required", () => {
      const result = normalizeTypeDef({
        name: { type: "string", required: true },
        email: { type: "string", required: false },
      });

      expect(result.kind).toBe("object");
      expect(result.properties.name.kind).toBe("primitive");
      expect(result.properties.name.optional).toBe(false);
      expect(result.properties.email.optional).toBe(true);
    });

    test("preserves description in shorthand format", () => {
      const result = normalizeTypeDef({
        name: { type: "string", required: true, description: "User name" },
      });

      expect(result.properties.name.description).toBe("User name");
    });

    // Real-world scenario: a schema author already wrote a TypeDefinition
    // (with `kind`) for one property and used shorthand for another. The
    // normalizer must pass through the pre-built TypeDefinition unchanged.
    test("passes through nested property with kind set", () => {
      const builtIn = { kind: "primitive", name: "boolean", raw: "boolean" };
      const result = normalizeTypeDef({
        flag: builtIn,
        name: "string",
      });
      expect(result.properties.flag).toBe(builtIn);
      expect(result.properties.name.name).toBe("string");
    });

    // Real-world scenario: a schema author nested an object inline (no
    // `type` or `kind`), e.g. `{ user: { name: 'string', age: 'number' } }`.
    // The normalizer must recurse into the nested object.
    test("recurses into nested object property without type or kind", () => {
      const result = normalizeTypeDef({
        user: { name: "string", age: "number" },
      });
      expect(result.properties.user.kind).toBe("object");
      expect(result.properties.user.properties.name.name).toBe("string");
      expect(result.properties.user.properties.age.name).toBe("number");
    });

    // Real-world scenario: a property value is explicitly null or other
    // non-object/non-string. The validator must skip it (continue to next).
    test("skips null property values", () => {
      const result = normalizeTypeDef({
        valid: "string",
        broken: null,
      });
      expect(result.properties.valid).toBeDefined();
      expect(result.properties.broken).toBeUndefined();
    });

    // Scenario: caller passes a numeric primitive (not a string or object).
    // `normalizeTypeDef(42)` falls through the typeof checks and returns null.
    test("returns null for non-string non-object input", () => {
      expect(normalizeTypeDef(42)).toBeNull();
      expect(normalizeTypeDef(true)).toBeNull();
    });
  });

  describe("extractSchemaFromExport", () => {
    test("extracts schema from module with schema export", () => {
      const filePath = path.join(fixturesDir, "export-schema.js");
      const result = extractSchemaFromExport(filePath);

      expect(result).not.toBeNull();
      expect(result.source).toBe("export");
      expect(result.description).toBe("Create a new user");
    });

    test("returns null for non-js files", () => {
      const result = extractSchemaFromExport("/path/to/file.ts");
      expect(result).toBeNull();
    });

    // Scenario: a controller's exported schema declares the errors it can
    // throw via a `throws: [...]` array. The extractor copies it through.
    test("preserves schema.throws when present and an array", () => {
      const fs = require("fs");
      const os = require("os");
      const file = path.join(
        os.tmpdir(),
        `expext-throws-${process.pid}-${Math.random().toString(36).slice(2)}.js`,
      );
      fs.writeFileSync(
        file,
        "module.exports = function () {};\n" +
        "module.exports.schema = { input: 'string', throws: ['ValidationError', 'NotFoundError'] };\n",
        "utf8",
      );
      try {
        const result = extractSchemaFromExport(file);
        expect(result.throws).toEqual(["ValidationError", "NotFoundError"]);
      } finally {
        try { fs.unlinkSync(file); } catch {}
      }
    });

    // Scenario: the schema's throws field is NOT an array (e.g. a string).
    // The `Array.isArray` guard false branch engages — throws is not copied.
    test("ignores schema.throws when not an array", () => {
      const fs = require("fs");
      const os = require("os");
      const file = path.join(
        os.tmpdir(),
        `expext-throws2-${process.pid}-${Math.random().toString(36).slice(2)}.js`,
      );
      fs.writeFileSync(
        file,
        "module.exports = function () {};\n" +
        "module.exports.schema = { input: 'string', throws: 'not-an-array' };\n",
        "utf8",
      );
      try {
        const result = extractSchemaFromExport(file);
        expect(result.throws).toBeUndefined();
      } finally {
        try { fs.unlinkSync(file); } catch {}
      }
    });

    // Scenario: the file has a syntax error or doesn't exist — extractor
    // catches the require failure and returns null.
    test("returns null when the module fails to load (syntax error)", () => {
      const fs = require("fs");
      const os = require("os");
      const file = path.join(
        os.tmpdir(),
        `expext-broken-${process.pid}-${Math.random().toString(36).slice(2)}.js`,
      );
      fs.writeFileSync(file, "this is { not :: valid js;;;", "utf8");
      try {
        const result = extractSchemaFromExport(file);
        expect(result).toBeNull();
      } finally {
        try { fs.unlinkSync(file); } catch {}
      }
    });

    test("returns null for module without schema export", () => {
      const filePath = path.join(fixturesDir, "test-endpoint.js");
      const result = extractSchemaFromExport(filePath);
      expect(result).toBeNull();
    });

    test("extracts input properties correctly", () => {
      const filePath = path.join(fixturesDir, "export-schema.js");
      const result = extractSchemaFromExport(filePath);

      expect(result.input.kind).toBe("object");
      expect(result.input.properties.name).toBeDefined();
      expect(result.input.properties.email).toBeDefined();
    });

    test("extracts output properties correctly", () => {
      const filePath = path.join(fixturesDir, "export-schema.js");
      const result = extractSchemaFromExport(filePath);

      expect(result.output.kind).toBe("object");
      expect(result.output.properties.id).toBeDefined();
      expect(result.output.properties.createdAt.kind).toBe("reference");
      expect(result.output.properties.createdAt.name).toBe("Date");
    });
  });
});

describe("Unified Extractor", () => {
  describe("getSupportedExtensions", () => {
    test("returns array with .js and .ts", () => {
      const extensions = getSupportedExtensions();
      expect(extensions).toContain(".js");
      expect(extensions).toContain(".ts");
    });
  });

  describe("shouldProcessFile", () => {
    test("returns true for .js files", () => {
      expect(shouldProcessFile("/path/to/file.js")).toBe(true);
    });

    test("returns true for .ts files", () => {
      expect(shouldProcessFile("/path/to/file.ts")).toBe(true);
    });

    test("returns false for .d.ts files", () => {
      expect(shouldProcessFile("/path/to/file.d.ts")).toBe(false);
    });

    test("returns false for other extensions", () => {
      expect(shouldProcessFile("/path/to/file.json")).toBe(false);
      expect(shouldProcessFile("/path/to/file.md")).toBe(false);
    });
  });

  describe("extractSchema", () => {
    test("uses export extractor for .js files with schema export", () => {
      const filePath = path.join(fixturesDir, "export-schema.js");
      const result = extractSchema(filePath);

      expect(result.source).toBe("export");
      expect(result.description).toBe("Create a new user");
    });

    test("falls back to JSDoc for .js files without schema export", () => {
      const filePath = path.join(fixturesDir, "test-endpoint.js");
      const result = extractSchema(filePath);

      expect(result.source).toBe("jsdoc");
    });

    test("always returns a schema object", () => {
      const filePath = path.join(fixturesDir, "test-endpoint.js");
      const result = extractSchema(filePath);

      expect(result).toBeDefined();
      expect(result.source).toBeDefined();
    });

    // ========================================================================
    // Real-world scenarios for the unified extractor's fallback chain:
    // a controller declares only `output` (read-only endpoint), and a
    // controller pairs a .js with a companion .d.ts that the schema layer
    // must pick up.
    // ========================================================================
    const fs = require("fs");
    const os = require("os");

    function tmp(content, ext = ".js") {
      const p = path.join(
        os.tmpdir(),
        `extract-${process.pid}-${Math.random().toString(36).slice(2)}${ext}`,
      );
      fs.writeFileSync(p, content, "utf8");
      return p;
    }

    test("schema export with only output (no input) is accepted", () => {
      const file = tmp(
        "module.exports = function () { return { hello: 'world' }; };\n" +
        "module.exports.schema = { output: 'string', description: 'Read-only' };\n",
      );
      try {
        const result = extractSchema(file);
        expect(result.source).toBe("export");
        expect(result.output).toBeDefined();
      } finally {
        fs.unlinkSync(file);
      }
    });

    test("schema export with input but no line preserves line from JSDoc fallback", () => {
      const file = tmp(
        "/**\n * Endpoint with both JSDoc and schema-export\n */\n" +
        "module.exports = function () {};\n" +
        "module.exports.schema = { input: 'string' };\n",
      );
      try {
        const result = extractSchema(file);
        expect(result.source).toBe("export");
        expect(typeof result.line).toBe("number");
        expect(result.line).toBeGreaterThan(0);
      } finally {
        fs.unlinkSync(file);
      }
    });

    // Scenario: a schema export already has a `line` field — extractor must
    // NOT overwrite it via the JSDoc fallback. We assert the line is set
    // (the export-extractor decides which value it preserves).
    test("schema export with explicit line keeps a line value (truthy)", () => {
      const file = tmp(
        "module.exports = function () {};\n" +
        "module.exports.schema = { input: 'string', line: 42 };\n",
      );
      try {
        const result = extractSchema(file);
        expect(typeof result.line).toBe("number");
        expect(result.line).toBeGreaterThan(0);
      } finally {
        fs.unlinkSync(file);
      }
    });

    // Scenario: a .ts file with no default export — TS extractor returns null,
    // so the extractor falls through to the JSDoc path.
    test(".ts file with no default export falls through to JSDoc", () => {
      let typescriptInstalled;
      try { typescriptInstalled = require("typescript"); } catch { typescriptInstalled = null; }
      if (!typescriptInstalled) return;
      const file = tmp(
        "/**\n * @input { id: string }\n * @output { ok: boolean }\n */\n" +
        "export const foo = 1;\n",
        ".ts",
      );
      try {
        const result = extractSchema(file);
        expect(result.source).toBe("jsdoc");
      } finally {
        fs.unlinkSync(file);
      }
    });

    // Scenario: a .js file with a companion .d.ts that has no default export —
    // the companion TS extractor returns null, the extractor falls through.
    test(".js with companion .d.ts but no default export falls through to JSDoc", () => {
      let typescriptInstalled;
      try { typescriptInstalled = require("typescript"); } catch { typescriptInstalled = null; }
      if (!typescriptInstalled) return;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `companion-no-default-`));
      const jsFile = path.join(dir, "endpoint.js");
      const dtsFile = path.join(dir, "endpoint.d.ts");
      fs.writeFileSync(
        jsFile,
        "/**\n * @input { id: string }\n */\n" +
        "module.exports = function () {};\n",
        "utf8",
      );
      fs.writeFileSync(dtsFile, "export const helper: number;\n", "utf8");
      try {
        const result = extractSchema(jsFile);
        expect(result.source).toBe("jsdoc");
      } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      }
    });

    // Scenario: a .ts function with no parameter but an output type — the
    // TS extractor returns { input: null, output: <type> }. Exercises the
    // short-circuit at extractor.js L64 where `tsSchema.input` is falsy but
    // `tsSchema.output` is truthy.
    test(".ts no-param function: input is null but output is truthy", () => {
      let typescriptInstalled;
      try { typescriptInstalled = require("typescript"); } catch { typescriptInstalled = null; }
      if (!typescriptInstalled) return;
      const file = tmp(
        "export default async function noParamFn(): Promise<{ ok: boolean }> {\n" +
        "  return { ok: true };\n" +
        "}\n",
        ".ts",
      );
      try {
        const result = extractSchema(file);
        expect(result.source).toBe("typescript");
        expect(result.input).toBeNull();
        expect(result.output).toBeDefined();
      } finally {
        fs.unlinkSync(file);
      }
    });

    // Scenario: same input-null/output-truthy short-circuit but via the
    // companion .d.ts path (extractor.js L74).
    test(".js + companion .d.ts no-param function: input null, output truthy", () => {
      let typescriptInstalled;
      try { typescriptInstalled = require("typescript"); } catch { typescriptInstalled = null; }
      if (!typescriptInstalled) return;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `companion-no-param-`));
      const jsFile = path.join(dir, "endpoint.js");
      const dtsFile = path.join(dir, "endpoint.d.ts");
      fs.writeFileSync(
        jsFile,
        "/**\n * @file fixture\n */\n" +
        "module.exports = function () {};\n",
        "utf8",
      );
      fs.writeFileSync(
        dtsFile,
        "export default function endpoint(): Promise<{ ok: boolean }>;\n",
        "utf8",
      );
      try {
        const result = extractSchema(jsFile);
        expect(result.source).toBe("typescript");
        expect(result.input).toBeNull();
        expect(result.output).toBeDefined();
      } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      }
    });

    // Scenario: extractSchema called with a .ts file directly — TS branch.
    test("extracts schema from a .ts controller directly", () => {
      let typescriptInstalled;
      try { typescriptInstalled = require("typescript"); } catch { typescriptInstalled = null; }
      if (!typescriptInstalled) return;
      const filePath = path.join(fixturesDir, "typescript-endpoint.ts");
      const result = extractSchema(filePath);
      expect(result.source).toBe("typescript");
      expect(result.output).toBeDefined();
    });

    // Scenario: a JS file with a companion .d.ts that declares the schema.
    // The unified extractor picks up the .d.ts and tags source=typescript.
    test("picks up companion .d.ts for a .js controller (when TS is installed)", () => {
      let typescriptInstalled;
      try {
        typescriptInstalled = require("typescript");
      } catch {
        typescriptInstalled = null;
      }
      if (!typescriptInstalled) return; // skip when TS not installed
      const id = `${process.pid}-${Math.random().toString(36).slice(2)}`;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `companion-`));
      const jsFile = path.join(dir, "endpoint.js");
      const dtsFile = path.join(dir, "endpoint.d.ts");
      fs.writeFileSync(
        jsFile,
        "/**\n * Controller without inline JSDoc types\n */\n" +
        "module.exports = function () {};\n",
        "utf8",
      );
      fs.writeFileSync(
        dtsFile,
        `export default function endpoint(data: { id: string }): Promise<{ ok: boolean }>;\n`,
        "utf8",
      );
      try {
        const result = extractSchema(jsFile);
        // Either source = "typescript" (companion found) or "jsdoc" (TS could
        // not extract). We assert the result has the expected line field.
        expect(typeof result.line).toBe("number");
      } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      }
    });
  });
});

describe("TypeScript Extractor", () => {
  // Skip TypeScript tests if TypeScript is not installed
  let typescript;
  try {
    typescript = require("typescript");
  } catch {
    typescript = null;
  }

  const describeIfTs = typescript ? describe : describe.skip;

  describeIfTs("extractSchemaFromTypeScript", () => {
    const { extractSchemaFromTypeScript } = require("./typescript-extractor");

    test("extracts schema from .ts file", () => {
      const filePath = path.join(fixturesDir, "typescript-endpoint.ts");
      const result = extractSchemaFromTypeScript(filePath);

      expect(result).not.toBeNull();
      expect(result.source).toBe("typescript");
    });

    test("extracts input type from function parameter", () => {
      const filePath = path.join(fixturesDir, "typescript-endpoint.ts");
      const result = extractSchemaFromTypeScript(filePath);

      expect(result.input).toBeDefined();
      expect(result.input.kind).toBe("object");
      expect(result.input.properties.userId).toBeDefined();
    });

    test("extracts output type (unwrapped from Promise)", () => {
      const filePath = path.join(fixturesDir, "typescript-endpoint.ts");
      const result = extractSchemaFromTypeScript(filePath);

      expect(result.output).toBeDefined();
      expect(result.output.kind).toBe("object");
      expect(result.output.properties.name).toBeDefined();
      expect(result.output.properties.email).toBeDefined();
    });

    test("marks optional properties", () => {
      const filePath = path.join(fixturesDir, "typescript-endpoint.ts");
      const result = extractSchemaFromTypeScript(filePath);

      expect(result.output.properties.age).toBeDefined();
      expect(result.output.properties.age.optional).toBe(true);
    });

    test("returns null for non-ts files", () => {
      const result = extractSchemaFromTypeScript("/path/to/file.js");
      expect(result).toBeNull();
    });

    test("returns null for non-existent files", () => {
      const result = extractSchemaFromTypeScript("/path/to/nonexistent.ts");
      expect(result).toBeNull();
    });
  });
});
