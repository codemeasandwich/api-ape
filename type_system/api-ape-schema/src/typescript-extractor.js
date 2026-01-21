/**
 * @fileoverview TypeScript-based Schema Extractor for api-ape
 *
 * Extracts schema from TypeScript controller files using the TypeScript
 * compiler API to analyze function signatures.
 *
 * @example
 * // api/users/profile.ts
 * interface ProfileInput { userId: string }
 * interface ProfileOutput { name: string; email: string }
 * export default async function(data: ProfileInput): Promise<ProfileOutput> {
 *   return { name: 'Alice', email: 'alice@example.com' }
 * }
 */

const fs = require("fs");
const path = require("path");

/** @type {typeof import('typescript') | null} */
let ts = null;

/**
 * Lazily load TypeScript module
 *
 * Attempts to require the TypeScript compiler. If TypeScript is not installed,
 * returns null and all TypeScript extraction functions will gracefully degrade.
 *
 * @returns {typeof import('typescript') | null} TypeScript module or null if not available
 *
 * @example
 * const ts = getTypeScript();
 * if (!ts) {
 *   console.log('TypeScript not installed, skipping TS extraction');
 * }
 */
function getTypeScript() {
  if (ts === null) {
    try {
      ts = require("typescript");
    } catch {
      // TypeScript not installed
      ts = undefined;
    }
  }
  return ts || null;
}

/**
 * Convert a TypeScript type to an api-ape TypeDefinition
 *
 * Recursively converts TypeScript compiler types to the api-ape TypeDefinition format.
 * Handles primitives, objects, arrays, unions, intersections, promises, and more.
 *
 * @param {import('typescript').TypeChecker} checker - TypeScript type checker instance
 * @param {import('typescript').Type} type - TypeScript type to convert
 * @param {Set<import('typescript').Type>} [seen] - Set of already processed types (for cycle detection)
 * @returns {TypeDefinition} Converted TypeDefinition
 *
 * @example
 * // For a type: { name: string; age?: number }
 * // Returns:
 * // {
 * //   kind: 'object',
 * //   properties: {
 * //     name: { kind: 'primitive', name: 'string' },
 * //     age: { kind: 'primitive', name: 'number', optional: true }
 * //   }
 * // }
 */
function typeToTypeDef(checker, type, seen = new Set()) {
  const typescript = getTypeScript();
  if (!typescript) return { kind: "any", raw: "any" };

  // Cycle detection
  if (seen.has(type)) {
    return { kind: "any", raw: "circular" };
  }
  seen = new Set(seen);
  seen.add(type);

  const typeStr = checker.typeToString(type);

  // Handle Promise<T>
  const symbol = type.getSymbol();
  if (symbol?.getName() === "Promise") {
    const typeArgs = checker.getTypeArguments(type);
    if (typeArgs && typeArgs.length > 0) {
      return {
        kind: "promise",
        resolves: typeToTypeDef(checker, typeArgs[0], seen),
        raw: typeStr,
      };
    }
    return { kind: "promise", resolves: { kind: "any" }, raw: typeStr };
  }

  // Handle Array<T> or T[]
  if (checker.isArrayType && checker.isArrayType(type)) {
    const typeArgs = checker.getTypeArguments(type);
    if (typeArgs && typeArgs.length > 0) {
      return {
        kind: "array",
        items: typeToTypeDef(checker, typeArgs[0], seen),
        raw: typeStr,
      };
    }
    return { kind: "array", items: { kind: "any" }, raw: typeStr };
  }

  // Handle union types (A | B)
  if (type.isUnion()) {
    return {
      kind: "union",
      types: type.types.map((t) => typeToTypeDef(checker, t, seen)),
      raw: typeStr,
    };
  }

  // Handle intersection types (A & B)
  if (type.isIntersection()) {
    // Merge all properties from intersection members
    const properties = {};
    for (const member of type.types) {
      const memberProps = member.getProperties();
      for (const prop of memberProps) {
        const propType = checker.getTypeOfSymbolAtLocation(
          prop,
          prop.valueDeclaration || prop.declarations?.[0]
        );
        const isOptional = !!(prop.flags & typescript.SymbolFlags.Optional);
        properties[prop.getName()] = {
          ...typeToTypeDef(checker, propType, seen),
          optional: isOptional,
        };
      }
    }
    return { kind: "object", properties, raw: typeStr };
  }

  // Handle literal types
  if (type.isLiteral()) {
    const value = type.value;
    if (typeof value === "string") {
      return { kind: "literal", value, raw: `"${value}"` };
    }
    if (typeof value === "number") {
      return { kind: "literal", value, raw: String(value) };
    }
  }

  // Check for primitives
  const primitives = [
    "string",
    "number",
    "boolean",
    "null",
    "undefined",
    "void",
    "any",
    "unknown",
    "never",
  ];
  if (primitives.includes(typeStr)) {
    return { kind: "primitive", name: typeStr, raw: typeStr };
  }

  // Handle Date type
  if (typeStr === "Date") {
    return { kind: "reference", name: "Date", raw: "Date" };
  }

  // Handle object types with properties
  const properties = type.getProperties();
  if (properties && properties.length > 0) {
    const propsObj = {};
    for (const prop of properties) {
      // Skip internal properties
      if (prop.getName().startsWith("__")) continue;

      try {
        const propDecl = prop.valueDeclaration || prop.declarations?.[0];
        if (!propDecl) continue;

        const propType = checker.getTypeOfSymbolAtLocation(prop, propDecl);
        const isOptional = !!(prop.flags & typescript.SymbolFlags.Optional);

        propsObj[prop.getName()] = {
          ...typeToTypeDef(checker, propType, seen),
          optional: isOptional,
        };
      } catch {
        // Skip properties we can't analyze
      }
    }

    if (Object.keys(propsObj).length > 0) {
      return { kind: "object", properties: propsObj, raw: typeStr };
    }
  }

  // Handle index signatures (Record<K, V>, { [key: string]: V })
  const indexType = type.getStringIndexType();
  if (indexType) {
    return {
      kind: "record",
      key: { kind: "primitive", name: "string" },
      value: typeToTypeDef(checker, indexType, seen),
      raw: typeStr,
    };
  }

  // Fall back to reference type
  if (typeStr && typeStr !== "object" && typeStr !== "{}") {
    return { kind: "reference", name: typeStr, raw: typeStr };
  }

  return { kind: "any", raw: typeStr || "any" };
}

/**
 * Find the line number of the export statement
 *
 * Locates the source position of a symbol's declaration and returns
 * the 1-indexed line number.
 *
 * @param {import('typescript').SourceFile} sourceFile - TypeScript source file AST
 * @param {import('typescript').Symbol} exportSymbol - The export symbol to locate
 * @returns {number} Line number (1-indexed), defaults to 1 if not found
 */
function findExportLine(sourceFile, exportSymbol) {
  const typescript = getTypeScript();
  if (!typescript) return 1;

  const decl = exportSymbol.valueDeclaration || exportSymbol.declarations?.[0];
  if (decl) {
    const pos = sourceFile.getLineAndCharacterOfPosition(decl.getStart());
    return pos.line + 1;
  }
  return 1;
}

/**
 * Extract schema from a TypeScript controller file
 *
 * Uses the TypeScript compiler API to parse and analyze the file's default export.
 * Extracts the input parameter type and return type from the function signature.
 *
 * @param {string} filePath - Absolute path to a `.ts` or `.d.ts` file
 * @returns {TypeScriptSchema|null} Schema object with input/output, or null if extraction failed
 *
 * @typedef {object} TypeScriptSchema
 * @property {TypeDefinition|null} input - Input parameter types from first argument
 * @property {TypeDefinition} output - Return type (Promise is unwrapped)
 * @property {number} line - Line number of the default export
 * @property {'typescript'} source - Always 'typescript' for this extractor
 *
 * @example
 * // For a file with: export default async (data: { id: string }) => Promise<User>
 * const schema = extractSchemaFromTypeScript('/api/users/get.ts');
 * // {
 * //   input: { kind: 'object', properties: { id: { kind: 'primitive', name: 'string' } } },
 * //   output: { kind: 'object', properties: { ... } },
 * //   line: 5,
 * //   source: 'typescript'
 * // }
 *
 * @example
 * // Returns null if:
 * // - TypeScript is not installed
 * // - File doesn't exist
 * // - No default export
 * // - Default export is not a function
 */
function extractSchemaFromTypeScript(filePath) {
  const typescript = getTypeScript();
  if (!typescript) {
    return null;
  }

  // Only process TypeScript files
  if (!filePath.endsWith(".ts") && !filePath.endsWith(".d.ts")) {
    return null;
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    // Create a program with just this file
    const program = typescript.createProgram([filePath], {
      target: typescript.ScriptTarget.ES2020,
      module: typescript.ModuleKind.CommonJS,
      strict: false,
      skipLibCheck: true,
      noEmit: true,
    });

    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      return null;
    }

    const checker = program.getTypeChecker();

    // Get exports from the module
    const sourceSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!sourceSymbol) {
      return null;
    }

    const exports = checker.getExportsOfModule(sourceSymbol);

    // Find default export
    const defaultExport = exports.find((s) => s.name === "default");
    if (!defaultExport) {
      return null;
    }

    // Get the type of the default export
    const defaultType = checker.getTypeOfSymbolAtLocation(
      defaultExport,
      sourceFile
    );

    // Get call signatures (function type)
    const signatures = defaultType.getCallSignatures();
    if (!signatures || signatures.length === 0) {
      return null;
    }

    const sig = signatures[0];
    const params = sig.getParameters();
    const returnType = sig.getReturnType();

    // Extract input type from first parameter
    let input = null;
    if (params.length > 0) {
      const paramType = checker.getTypeOfSymbolAtLocation(
        params[0],
        params[0].valueDeclaration || sourceFile
      );
      input = typeToTypeDef(checker, paramType);
    }

    // Extract output type from return type
    let output = typeToTypeDef(checker, returnType);

    // Unwrap Promise for output
    if (output.kind === "promise" && output.resolves) {
      output = output.resolves;
    }

    return {
      input,
      output,
      line: findExportLine(sourceFile, defaultExport),
      source: "typescript",
    };
  } catch (err) {
    // TypeScript analysis failed
    return null;
  }
}

/**
 * Check if a companion .d.ts file exists for a .js file
 *
 * Looks for a TypeScript declaration file with the same base name as
 * a JavaScript file. This allows developers to add type definitions
 * to existing JavaScript controllers without converting to TypeScript.
 *
 * @param {string} jsFilePath - Path to .js file
 * @returns {string|null} Path to .d.ts file if it exists, null otherwise
 *
 * @example
 * findCompanionDts('/api/users/profile.js');
 * // Returns '/api/users/profile.d.ts' if it exists, null otherwise
 *
 * @example
 * findCompanionDts('/api/users/profile.ts');
 * // Returns null (only works with .js files)
 */
function findCompanionDts(jsFilePath) {
  if (!jsFilePath.endsWith(".js")) {
    return null;
  }

  const dtsPath = jsFilePath.replace(/\.js$/, ".d.ts");
  if (fs.existsSync(dtsPath)) {
    return dtsPath;
  }

  return null;
}

module.exports = {
  extractSchemaFromTypeScript,
  findCompanionDts,
  typeToTypeDef,
  getTypeScript,
};
