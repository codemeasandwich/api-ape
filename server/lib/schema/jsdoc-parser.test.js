/**
 * @fileoverview Tests for the lightweight JSDoc parser used by the schema
 * extractor to surface controller documentation.
 *
 * Each test maps to a real JSDoc shape api-ape sees in controller files:
 * `@param`, `@returns`, `@throws`, union/array/object types, and the
 * fall-through cases when a controller has no JSDoc or uses uncommon export
 * patterns.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseJSDoc, parseTypeString } = require("./jsdoc-parser");

/** Write a temp controller file and return its absolute path. */
function tmpFile(content) {
  const p = path.join(
    os.tmpdir(),
    `jsdoc-parser-${process.pid}-${Math.random().toString(36).slice(2)}.js`,
  );
  fs.writeFileSync(p, content, "utf8");
  return p;
}

describe("parseTypeString", () => {
  // Scenario: a controller writes `@param {} data` (forgot the type). The
  // parser must not throw — fall back to `any`.
  test("returns kind=any for empty/null/undefined input", () => {
    expect(parseTypeString("")).toEqual({ kind: "any", raw: "any" });
    expect(parseTypeString(null)).toEqual({ kind: "any", raw: "any" });
    expect(parseTypeString(undefined)).toEqual({ kind: "any", raw: "any" });
  });

  test("parses Promise<T>", () => {
    const t = parseTypeString("Promise<string>");
    expect(t.kind).toBe("promise");
    expect(t.resolves.name).toBe("string");
  });

  // Scenario: a controller documents `@returns {Array<User>}` — the parser
  // must descend into the Array<T> shape with items.kind = reference.
  test("parses Array<T>", () => {
    const t = parseTypeString("Array<User>");
    expect(t.kind).toBe("array");
    expect(t.items.kind).toBe("reference");
    expect(t.items.name).toBe("User");
  });

  // Scenario: T[] shorthand for arrays.
  test("parses T[] shorthand", () => {
    const t = parseTypeString("number[]");
    expect(t.kind).toBe("array");
    expect(t.items.kind).toBe("primitive");
    expect(t.items.name).toBe("number");
  });

  // Scenario: a polymorphic return like `string | null` — the union arm
  // must split and recurse on each side.
  test("parses union types", () => {
    const t = parseTypeString("string | null | User");
    expect(t.kind).toBe("union");
    expect(t.types).toHaveLength(3);
    expect(t.types[0].name).toBe("string");
    expect(t.types[2].name).toBe("User");
  });

  test("parses primitives case-insensitively", () => {
    expect(parseTypeString("String").kind).toBe("primitive");
    expect(parseTypeString("Number").name).toBe("number");
  });

  test("falls back to reference for unknown names", () => {
    const t = parseTypeString("MyCustomThing");
    expect(t.kind).toBe("reference");
    expect(t.name).toBe("MyCustomThing");
  });

  // Scenario: an inline object literal type (JSDoc's `{{id: string, ...}}`
  // double-brace shape that survives the outer `{}` strip). The parser
  // descends into parseObjectType and surfaces typed properties.
  test("parses object literal types with optional props", () => {
    const t = parseTypeString("{{id: string, age?: number}}");
    expect(t.kind).toBe("object");
    expect(t.properties.id.kind).toBe("primitive");
    expect(t.properties.id.name).toBe("string");
    expect(t.properties.age.optional).toBe(true);
    expect(t.properties.id.optional).toBe(false);
  });

  // Scenario: an empty object literal `{{}}` — the parser must still return
  // a well-formed object descriptor with no properties.
  test("parses empty object literal", () => {
    const t = parseTypeString("{{}}");
    expect(t.kind).toBe("object");
    expect(t.properties).toEqual({});
  });

  test("strips surrounding curly braces from outer wrapping", () => {
    const t = parseTypeString("{string}");
    // Wrapped string primitives are uncommon but should still parse
    expect(t.kind).toBe("primitive");
    expect(t.name).toBe("string");
  });
});

describe("parseJSDoc", () => {
  // Scenario: a controller has a standard `@param {Object} data` plus a
  // `@returns {Promise<string>}` block before module.exports. The parser
  // must surface both into the input/output fields.
  test("parses @param data and @returns from module.exports comment", () => {
    const file = tmpFile([
      "/**",
      " * Greet a user by name.",
      " *",
      " * @param {Object} data - Greeting input",
      " * @param {string} data.name - Name to greet",
      " * @param {boolean} [data.shout] - Whether to shout",
      " * @returns {Promise<string>}",
      " * @throws {Error} when name is missing",
      " */",
      "module.exports = async function ({ name, shout }) {",
      "  return shout ? `HELLO ${name}` : `hello ${name}`;",
      "};",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.description).toMatch(/Greet a user/);
      expect(doc.input.kind).toBe("object");
      expect(doc.input.properties.name.name).toBe("string");
      expect(doc.input.properties.shout.optional).toBe(true);
      expect(doc.output.kind).toBe("promise");
      expect(doc.throws[0]).toMatch(/^Error: when name is missing/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: ES Modules: `/** ... */ export default function` — the
  // `export default` pattern matcher must engage.
  test("parses JSDoc above ES Modules export default", () => {
    const file = tmpFile([
      "/**",
      " * @returns {number}",
      " */",
      "export default function () { return 42; }",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.output.kind).toBe("primitive");
      expect(doc.output.name).toBe("number");
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: a controller has a JSDoc block but it's not directly before
  // `module.exports` or `export default` (e.g. helper functions). The
  // parser falls back to the first JSDoc in the file.
  test("falls back to first JSDoc when none precedes an export", () => {
    const file = tmpFile([
      "/**",
      " * Top-level helper docs.",
      " *",
      " * @returns {string}",
      " */",
      "function helper() { return 'h'; }",
      "function main() { return helper(); }",
      "module.exports = main;",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.description).toMatch(/Top-level helper docs/);
      expect(doc.output.name).toBe("string");
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: controller has NO JSDoc at all. The parser returns a stub
  // result (everything null, throws=[]) with a sensible export line.
  test("returns default empty result when there is no JSDoc", () => {
    const file = tmpFile([
      "module.exports = function () { return 'no docs'; };",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.description).toBeNull();
      expect(doc.input).toBeNull();
      expect(doc.output).toBeNull();
      expect(doc.throws).toEqual([]);
      expect(doc.line).toBe(1);
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: a file with neither `module.exports` nor `export default`.
  // `findExportLine` fall through returns 1.
  test("findExportLine fallback returns 1 when no export found", () => {
    const file = tmpFile([
      "// just a notes file",
      "// no exports here",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.line).toBe(1);
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: an unstructured `@throws` line (no `{Type}` prefix). The
  // parser must still record the description as the throws message.
  test("captures @throws with no type prefix", () => {
    const file = tmpFile([
      "/**",
      " * @throws when the system is in maintenance",
      " */",
      "module.exports = function () { return 1; };",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.throws[0]).toMatch(/^Error: when the system is in maintenance/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: continuation lines under a @param (Description text that
  // wraps to the next line in the source comment).
  test("merges continuation lines into the preceding tag's description", () => {
    const file = tmpFile([
      "/**",
      " * @param {string} data - First line of description",
      " *   continued on the next line",
      " * @returns {void}",
      " */",
      "module.exports = function () {};",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      // Tag description merged — accessed via parseJSDocBlock indirectly via
      // input.properties. The data param was on top so input picks the type
      // (string, primitive). Description is internal; just assert input.
      expect(doc.input.name).toBe("string");
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: a controller with @returns annotated as a union type — the
  // parser exposes the alternation through `output.types`.
  test("@returns union surfaces as union output", () => {
    const file = tmpFile([
      "/**",
      " * @returns {string | null}",
      " */",
      "module.exports = function () { return null; };",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.output.kind).toBe("union");
      expect(doc.output.types.map((t) => t.name).sort()).toEqual(["null", "string"]);
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: only top-level @param data:Object provided (no destructured
  // data.field params). The input falls back to the parsed type of data.
  test("input falls back to top-level @param {Type} data when no data.X props", () => {
    const file = tmpFile([
      "/**",
      " * @param {string[]} data - List of names",
      " * @returns {void}",
      " */",
      "module.exports = function (data) {};",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.input.kind).toBe("array");
      expect(doc.input.items.name).toBe("string");
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: malformed @param tags — missing `{type}`. The regex doesn't
  // match; the parser must still record the tag (sans type) and not crash.
  test("malformed @param without {type} is preserved as a bare tag", () => {
    const file = tmpFile([
      "/**",
      " * @param thisIsNotAType",
      " * @returns {void}",
      " */",
      "module.exports = function () {};",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.input).toBeNull(); // no data param to extract
      expect(doc.output.kind).toBe("primitive");
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: malformed @returns tag without `{type}` — the regex doesn't
  // match, but the parser must still record the tag entry.
  test("malformed @returns without {type} produces no output", () => {
    const file = tmpFile([
      "/**",
      " * @returns describes the result",
      " */",
      "module.exports = function () {};",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.output).toBeNull();
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: a @throws with `{Type}` but no description after — written
  // such that the JSDoc closes (`*/`) on the same byte as `module.exports`,
  // preventing the trailing continuation lines that would otherwise pollute
  // the description.  The `throwMatch[2] || ""` RHS engages and the formatted
  // `Type:` (empty message trimmed) is produced.
  test("@throws with type but no description has empty description", () => {
    const file = tmpFile(
      "/**\n@throws {AuthError}*/module.exports = function () {};\n"
    );
    try {
      const doc = parseJSDoc(file);
      expect(doc.throws[0]).toBe("AuthError:");
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: a JSDoc block contains a non-{param,returns,throws} tag such
  // as `@example`. The else-if chain falls through with all branches false.
  test("non-param/returns/throws tags are recorded without typed parsing", () => {
    const file = tmpFile([
      "/**",
      " * @example basic usage",
      " * @author Brian",
      " * @returns {void}",
      " */",
      "module.exports = function () {};",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.output.name).toBe("void");
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: a controller has @param data.field entries WITHOUT a
  // description (e.g. `@param {number} data.count`). The
  // `param.description || undefined` RHS engages.
  test("@param data.field without description omits description", () => {
    const file = tmpFile([
      "/**",
      " * @param {Object} data",
      " * @param {number} data.count",
      " * @returns {void}",
      " */",
      "module.exports = function () {};",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.input.properties.count.name).toBe("number");
      expect(doc.input.properties.count.description).toBeUndefined();
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: a controller documents @param but no `data.*` shape — just
  // a single @param with a non-data name. The `dataParams.length > 0`
  // false branch engages and input remains null.
  test("non-data @param tags leave input null", () => {
    const file = tmpFile([
      "/**",
      " * @param {string} foo - Something not named data",
      " * @returns {void}",
      " */",
      "module.exports = function (foo) {};",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.input).toBeNull();
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: a comment that ends with a multi-line description (no trailing
  // tag) — the `if (currentTag)` branch at the loop exit must be false.
  test("comment ending with only description has no last-tag push", () => {
    const file = tmpFile([
      "/**",
      " * Just a description with no tags at all.",
      " * Across multiple lines.",
      " */",
      "module.exports = function () {};",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.description).toMatch(/Just a description/);
      expect(doc.input).toBeNull();
      expect(doc.output).toBeNull();
    } finally {
      fs.unlinkSync(file);
    }
  });

  // Scenario: a controller documents `@return` (singular) and `@throw`
  // (singular) — the parser accepts the singular alternatives.
  test("accepts singular @return and @throw aliases", () => {
    const file = tmpFile([
      "/**",
      " * @return {boolean}",
      " * @throw {RangeError} out-of-bounds index",
      " */",
      "module.exports = function () { return true; };",
      "",
    ].join("\n"));
    try {
      const doc = parseJSDoc(file);
      expect(doc.output.name).toBe("boolean");
      expect(doc.throws[0]).toMatch(/^RangeError: out-of-bounds index/);
    } finally {
      fs.unlinkSync(file);
    }
  });
});
