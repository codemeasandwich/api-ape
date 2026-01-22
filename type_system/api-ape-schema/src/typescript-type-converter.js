/**
 * @fileoverview TypeScript type to TypeDefinition converter
 *
 * Converts TypeScript compiler types to api-ape TypeDefinition format.
 */

/** @type {typeof import('typescript') | null} */
let ts = null;

/**
 * Set the TypeScript module reference
 * @param {typeof import('typescript') | null} typescript
 */
function setTypeScript(typescript) {
  ts = typescript;
}

/**
 * Convert a TypeScript type to an api-ape TypeDefinition
 *
 * @param {import('typescript').TypeChecker} checker - TypeScript type checker
 * @param {import('typescript').Type} type - TypeScript type to convert
 * @param {Set<import('typescript').Type>} [seen] - Already processed types
 * @returns {Object} Converted TypeDefinition
 */
function typeToTypeDef(checker, type, seen = new Set()) {
  if (!ts) return { kind: "any", raw: "any" };

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
      return { kind: "promise", resolves: typeToTypeDef(checker, typeArgs[0], seen), raw: typeStr };
    }
    return { kind: "promise", resolves: { kind: "any" }, raw: typeStr };
  }

  // Handle Array<T> or T[]
  if (checker.isArrayType && checker.isArrayType(type)) {
    const typeArgs = checker.getTypeArguments(type);
    if (typeArgs && typeArgs.length > 0) {
      return { kind: "array", items: typeToTypeDef(checker, typeArgs[0], seen), raw: typeStr };
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
    const properties = {};
    for (const member of type.types) {
      for (const prop of member.getProperties()) {
        const propType = checker.getTypeOfSymbolAtLocation(
          prop,
          prop.valueDeclaration || prop.declarations?.[0]
        );
        const isOptional = !!(prop.flags & ts.SymbolFlags.Optional);
        properties[prop.getName()] = { ...typeToTypeDef(checker, propType, seen), optional: isOptional };
      }
    }
    return { kind: "object", properties, raw: typeStr };
  }

  // Handle literal types
  if (type.isLiteral()) {
    const value = type.value;
    if (typeof value === "string") return { kind: "literal", value, raw: `"${value}"` };
    if (typeof value === "number") return { kind: "literal", value, raw: String(value) };
  }

  // Check for primitives
  const primitives = ["string", "number", "boolean", "null", "undefined", "void", "any", "unknown", "never"];
  if (primitives.includes(typeStr)) {
    return { kind: "primitive", name: typeStr, raw: typeStr };
  }

  // Handle Date type
  if (typeStr === "Date") return { kind: "reference", name: "Date", raw: "Date" };

  // Handle object types with properties
  const properties = type.getProperties();
  if (properties && properties.length > 0) {
    const propsObj = {};
    for (const prop of properties) {
      if (prop.getName().startsWith("__")) continue;
      try {
        const propDecl = prop.valueDeclaration || prop.declarations?.[0];
        if (!propDecl) continue;
        const propType = checker.getTypeOfSymbolAtLocation(prop, propDecl);
        const isOptional = !!(prop.flags & ts.SymbolFlags.Optional);
        propsObj[prop.getName()] = { ...typeToTypeDef(checker, propType, seen), optional: isOptional };
      } catch {
        // Skip properties we can't analyze
      }
    }
    if (Object.keys(propsObj).length > 0) {
      return { kind: "object", properties: propsObj, raw: typeStr };
    }
  }

  // Handle index signatures
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

module.exports = {
  typeToTypeDef,
  setTypeScript,
};
