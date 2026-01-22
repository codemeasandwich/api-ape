/**
 * @fileoverview TypeScript-based Schema Extractor for api-ape
 *
 * Extracts schema from TypeScript controller files using the TypeScript
 * compiler API to analyze function signatures.
 */

const fs = require("fs");
const { typeToTypeDef, setTypeScript } = require("./typescript-type-converter");

/** @type {typeof import('typescript') | null} */
let ts = null;

/** @type {{ log?: Function, debug?: Function, warn?: Function, error?: Function }} */
let logger = console;

/**
 * Set the logger for TypeScript extractor
 * @param {{ log?: Function, debug?: Function, warn?: Function, error?: Function }} l
 */
function setLogger(l) {
  logger = l || console;
}

/**
 * Lazily load TypeScript module
 * @returns {typeof import('typescript') | null} TypeScript module or null
 */
function getTypeScript() {
  if (ts === null) {
    try {
      ts = require("typescript");
      setTypeScript(ts);
      logger.log?.(`[TS] TypeScript module loaded successfully (v${ts.version})`);
    } catch (err) {
      ts = undefined;
      setTypeScript(null);
      logger.warn?.(`[TS] TypeScript module not available: ${err.message}`);
    }
  }
  return ts || null;
}

/**
 * Find the line number of the export statement
 *
 * @param {import('typescript').SourceFile} sourceFile - TypeScript source file
 * @param {import('typescript').Symbol} exportSymbol - The export symbol
 * @returns {number} Line number (1-indexed)
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
 * @param {string} filePath - Path to .ts or .d.ts file
 * @returns {Object|null} Schema with input/output, or null
 */
function extractSchemaFromTypeScript(filePath) {
  logger.log?.(`[TS] extractSchemaFromTypeScript() for: ${filePath}`);

  const typescript = getTypeScript();
  if (!typescript) {
    logger.warn?.(`[TS]   TypeScript module not available, skipping`);
    return null;
  }

  if (!filePath.endsWith(".ts") && !filePath.endsWith(".d.ts")) {
    logger.log?.(`[TS]   Skipping: not a .ts or .d.ts file`);
    return null;
  }

  if (!fs.existsSync(filePath)) {
    logger.warn?.(`[TS]   File does not exist: ${filePath}`);
    return null;
  }

  try {
    logger.log?.(`[TS]   Creating TypeScript program...`);
    const program = typescript.createProgram([filePath], {
      target: typescript.ScriptTarget.ES2020,
      module: typescript.ModuleKind.CommonJS,
      strict: false,
      skipLibCheck: true,
      noEmit: true,
    });

    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      logger.warn?.(`[TS]   Failed to get source file from program`);
      return null;
    }

    const checker = program.getTypeChecker();
    const sourceSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!sourceSymbol) {
      logger.warn?.(`[TS]   No source symbol found`);
      return null;
    }

    const exports = checker.getExportsOfModule(sourceSymbol);
    logger.log?.(`[TS]   Module has ${exports.length} export(s)`);

    let defaultExport = exports.find((s) => s.name === "default");
    let defaultType;
    let exportLine = 1;

    if (defaultExport) {
      logger.log?.(`[TS]   Found ES module default export`);
      defaultType = checker.getTypeOfSymbolAtLocation(defaultExport, sourceFile);
      exportLine = findExportLine(sourceFile, defaultExport);
    } else {
      logger.log?.(`[TS]   Checking for CommonJS module.exports...`);
      const moduleType = checker.getTypeOfSymbolAtLocation(sourceSymbol, sourceFile);
      const moduleSignatures = moduleType.getCallSignatures();
      if (moduleSignatures && moduleSignatures.length > 0) {
        defaultType = moduleType;
        typescript.forEachChild(sourceFile, (node) => {
          if (
            typescript.isBinaryExpression(node) &&
            typescript.isPropertyAccessExpression(node.left) &&
            node.left.getText() === "module.exports"
          ) {
            const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            exportLine = pos.line + 1;
          }
        });
      } else {
        logger.warn?.(`[TS]   No default export found`);
        return null;
      }
    }

    const signatures = defaultType.getCallSignatures();
    if (!signatures || signatures.length === 0) {
      logger.warn?.(`[TS]   Default export is not callable`);
      return null;
    }

    const sig = signatures[0];
    const params = sig.getParameters();
    const returnType = sig.getReturnType();

    let input = null;
    if (params.length > 0) {
      const paramType = checker.getTypeOfSymbolAtLocation(
        params[0],
        params[0].valueDeclaration || sourceFile
      );
      input = typeToTypeDef(checker, paramType);
    }

    let output = typeToTypeDef(checker, returnType);
    const isAsync = output.kind === "promise";

    if (isAsync && output.resolves) {
      output = output.resolves;
    }

    logger.log?.(`[TS]   Extraction successful`);
    return { input, output, isAsync, line: exportLine, source: "typescript" };
  } catch (err) {
    logger.error?.(`[TS]   TypeScript analysis FAILED: ${err.message}`);
    return null;
  }
}

/**
 * Check if a companion .d.ts file exists for a .js file
 *
 * @param {string} jsFilePath - Path to .js file
 * @returns {string|null} Path to .d.ts file if exists
 */
function findCompanionDts(jsFilePath) {
  if (!jsFilePath.endsWith(".js")) return null;

  const dtsPath = jsFilePath.replace(/\.js$/, ".d.ts");
  if (fs.existsSync(dtsPath)) {
    logger.log?.(`[TS] findCompanionDts: found ${dtsPath}`);
    return dtsPath;
  }

  return null;
}

module.exports = {
  extractSchemaFromTypeScript,
  findCompanionDts,
  typeToTypeDef,
  getTypeScript,
  setLogger,
};
