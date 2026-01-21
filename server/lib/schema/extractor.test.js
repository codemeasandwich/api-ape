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
