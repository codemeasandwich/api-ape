/**
 * Type definitions for @api-ape/schema
 */

/**
 * A parsed type definition from JSDoc, TypeScript, or export schema
 */
export interface TypeDefinition {
  kind:
    | "primitive"
    | "reference"
    | "array"
    | "union"
    | "promise"
    | "object"
    | "literal"
    | "record"
    | "any";
  name?: string;
  raw?: string;
  description?: string;
  optional?: boolean;
  items?: TypeDefinition;
  types?: TypeDefinition[];
  resolves?: TypeDefinition;
  properties?: Record<string, TypeDefinition>;
  value?: string | number;
  key?: TypeDefinition;
}

/**
 * Documentation extracted from a controller file
 */
export interface ControllerDoc {
  filePath: string;
  description: string | null;
  input: TypeDefinition | null;
  output: TypeDefinition | null;
  throws: string[];
  line: number;
}

/**
 * An endpoint definition in the schema
 */
export interface EndpointDefinition {
  path: string;
  filePath: string;
  line: number;
  column: number;
  description: string | null;
  input: TypeDefinition | null;
  output: TypeDefinition | null;
  throws: string[];
  schemaSource: "export" | "typescript" | "jsdoc";
}

/**
 * A channel definition for pub/sub
 */
export interface ChannelDefinition {
  channel: string;
  dataType?: TypeDefinition;
  sourceFile?: string;
  sourceLine?: number;
}

/**
 * The complete api-ape schema
 */
export interface ApeSchema {
  version: string;
  timestamp: number;
  controllersDir: string;
  endpoints: EndpointDefinition[];
  channels: ChannelDefinition[];
}

/**
 * Options for schema generation
 */
export interface GenerateSchemaOptions {
  extensions?: string[];
}

/**
 * Result from extractSchema function
 */
export interface ExtractedSchema {
  input: TypeDefinition | null;
  output: TypeDefinition | null;
  description?: string | null;
  throws?: string[];
  line: number;
  source: "export" | "typescript" | "jsdoc";
}

/**
 * Result from extractSchemaFromExport function
 */
export interface ExportedSchema {
  input: TypeDefinition | null;
  output: TypeDefinition | null;
  source: "export";
  description?: string;
  throws?: string[];
}

/**
 * Result from extractSchemaFromTypeScript function
 */
export interface TypeScriptSchema {
  input: TypeDefinition | null;
  output: TypeDefinition;
  line: number;
  source: "typescript";
}

/**
 * Parse JSDoc from a controller file
 */
export function parseJSDoc(filePath: string): ControllerDoc;

/**
 * Parse a type string into a TypeDefinition
 */
export function parseTypeString(typeStr: string): TypeDefinition;

/**
 * Generate schema from a controller directory
 */
export function generateSchema(
  controllersDir: string,
  options?: GenerateSchemaOptions
): ApeSchema;

/**
 * Generate TypeScript declarations from schema
 */
export function generateTypeDeclarations(schema: ApeSchema): string;

/**
 * Extract schema from a controller file using all available methods
 *
 * Priority order:
 * 1. Named schema export (highest priority)
 * 2. TypeScript definitions
 * 3. JSDoc comments (lowest priority)
 */
export function extractSchema(filePath: string): ExtractedSchema;

/**
 * Get supported file extensions for schema extraction
 *
 * @returns Array of extensions with leading dots (e.g., ['.js', '.ts'])
 */
export function getSupportedExtensions(): string[];

/**
 * Check if a file should be processed for schema extraction
 *
 * Skips .d.ts files and files with unsupported extensions.
 */
export function shouldProcessFile(filePath: string): boolean;

/**
 * Extract schema from a module's named schema export
 *
 * Loads a JavaScript module and checks for a module.exports.schema property.
 *
 * @returns Schema object or null if no schema export found
 */
export function extractSchemaFromExport(filePath: string): ExportedSchema | null;

/**
 * Normalize a simple type definition to the full TypeDefinition format
 *
 * Converts shorthand schema definitions to the canonical TypeDefinition format.
 */
export function normalizeTypeDef(
  def: Record<string, unknown> | string | null
): TypeDefinition | null;

/**
 * Extract schema from a TypeScript controller file
 *
 * Uses the TypeScript compiler API to analyze the file's default export.
 * Requires TypeScript to be installed as a peer dependency.
 *
 * @returns Schema object or null if extraction failed
 */
export function extractSchemaFromTypeScript(
  filePath: string
): TypeScriptSchema | null;

/**
 * Check if a companion .d.ts file exists for a .js file
 *
 * @returns Path to .d.ts file if it exists, null otherwise
 */
export function findCompanionDts(jsFilePath: string): string | null;
