/**
 * Type definitions for @api-ape/schema
 */

/**
 * A parsed type definition from JSDoc
 */
export interface TypeDefinition {
  kind: "primitive" | "reference" | "array" | "union" | "promise" | "object" | "any";
  name?: string;
  raw?: string;
  description?: string;
  optional?: boolean;
  items?: TypeDefinition;
  types?: TypeDefinition[];
  resolves?: TypeDefinition;
  properties?: Record<string, TypeDefinition>;
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
