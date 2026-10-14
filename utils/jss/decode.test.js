/**
 * @fileoverview Decoder stories: what a PEER can make `jss.parse` do.
 *
 * Every inbound frame on the server is `jss.parse`d before any controller lookup, so
 * the decoder reads text from strangers. Each test is a user story from the point of
 * view of an operator whose server must stay a server, or of a peer that sends honest
 * frames. Assertions are only about what can be seen from outside: what the decoded
 * value is, and whether anything the peer named was constructed.
 *
 * @module utils/jss/decode.test
 */

const jss = require("../jss");

/**
 * Parse a frame whose `e` key is an Error tag with the given name and message.
 *
 * @param {any} name - The class name the peer put in the tag
 * @param {any} [message="boom"] - The message the peer put in the tag
 * @param {any} [stack="stack text"] - The stack the peer put in the tag
 * @returns {any} What `jss.parse` returns for `{ data: { e } }`'s `data.e`
 */
function parseErrorTag(name, message = "boom", stack = "stack text") {
  return jss.parse(JSON.stringify({ data: { "e<!E>": [name, message, stack] } })).data.e;
}

describe("JSS decode: a peer chooses names, the server chooses what is built", () => {
  const constructed = [];
  const saved = {};
  const NAMES = ["Worker", "WebSocket", "EvilError", "XMLHttpRequest"];

  beforeEach(() => {
    constructed.length = 0;
    for (const name of NAMES) {
      saved[name] = Object.getOwnPropertyDescriptor(global, name);
      // A global that is an Error subclass (the worst case: it passes the old
      // "is it an Error?" test) and one that is not; both record being built.
      const Spy = class extends Error {
        constructor(...args) {
          super(String(args[0]));
          constructed.push(name);
        }
      };
      Object.defineProperty(global, name, { value: Spy, configurable: true, writable: true });
    }
  });

  afterEach(() => {
    for (const name of NAMES) {
      delete global[name];
      if (saved[name]) Object.defineProperty(global, name, saved[name]);
    }
  });

  test.each(NAMES)("a frame naming %s as its error class builds nothing and decodes to a plain Error", (name) => {
    const err = parseErrorTag(name, "data:text/javascript,console.log(1)");

    expect(constructed).toEqual([]);
    expect(err).toBeInstanceOf(Error);
    expect(Object.getPrototypeOf(err)).toBe(Error.prototype);
    expect(err.name).toBe(name);
    expect(err.message).toBe("data:text/javascript,console.log(1)");
  });

  test.each(["Function", "Proxy", "Object", "constructor", "__proto__", "toString", "process"])(
    "a frame naming %s decodes to a plain Error carrying that name",
    (name) => {
      const err = parseErrorTag(name, "return process");

      expect(err).toBeInstanceOf(Error);
      expect(typeof err).toBe("object");
      expect(Object.getPrototypeOf(err)).toBe(Error.prototype);
      expect(err.name).toBe(name);
      expect(err.message).toBe("return process");
    },
  );

  test.each([["Worker"], { 0: "Worker" }, 7, null])("an error class name that is not a string (%p) is a plain Error", (name) => {
    const err = parseErrorTag(name);

    expect(constructed).toEqual([]);
    expect(Object.getPrototypeOf(err)).toBe(Error.prototype);
    expect(err.name).toBe("Error");
  });

  test.each([Error, TypeError, RangeError, SyntaxError, ReferenceError, EvalError, URIError])(
    "an honest %p round-trips with its class, message and name",
    (Class) => {
      const sent = new Class("it broke");

      const got = jss.parse(jss.stringify({ data: { e: sent } })).data.e;

      expect(got).toBeInstanceOf(Class);
      expect(got.name).toBe(sent.name);
      expect(got.message).toBe("it broke");
      expect(got.stack).toBe(sent.stack);
    },
  );

  test("an AggregateError round-trips with its class and message", () => {
    const got = jss.parse(jss.stringify({ data: { e: new AggregateError([], "many failed") } })).data.e;

    expect(got).toBeInstanceOf(AggregateError);
    expect(got.message).toBe("many failed");
    expect(got.errors).toEqual([]);
  });

  test("an error subclass the receiver has never heard of arrives as an Error with the sender's name", () => {
    class QuotaExceeded extends Error {}
    const sent = new QuotaExceeded("over");
    sent.name = "QuotaExceeded";

    const got = jss.parse(jss.stringify({ data: { e: sent } })).data.e;

    expect(Object.getPrototypeOf(got)).toBe(Error.prototype);
    expect(got.name).toBe("QuotaExceeded");
    expect(got.message).toBe("over");
  });

  test("a stack that is not text is ignored, the error keeps the stack it was built with", () => {
    const err = parseErrorTag("TypeError", "bad", { not: "text" });

    expect(err).toBeInstanceOf(TypeError);
    expect(typeof err.stack).toBe("string");
  });
});

describe("JSS decode: tag names and keys from a peer are data, never lookups", () => {
  test.each(["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "__defineGetter__"])(
    "a value tagged <!%s> passes through untouched",
    (tag) => {
      const got = jss.parse(JSON.stringify({ [`x<!${tag}>`]: 5, [`y<!${tag}>`]: { a: 1 } }));

      expect(got.x).toBe(5);
      expect(got.y).toEqual({ a: 1 });
    },
  );

  test("an array tagged with inherited property names passes through untouched", () => {
    const got = jss.parse(JSON.stringify({ "x<![constructor,toString,__proto__]>": [1, 2, 3] }));

    expect(got.x).toEqual([1, 2, 3]);
  });

  test("a key named __proto__ is an ordinary key: the decoded object's prototype is untouched", () => {
    const got = jss.parse('{"__proto__":{"isAdmin":true},"name":"mallory"}');

    expect(Object.getPrototypeOf(got)).toBe(Object.prototype);
    expect(got.isAdmin).toBeUndefined();
    expect(({}).isAdmin).toBeUndefined();
    expect(Object.keys(got)).toEqual(["__proto__", "name"]);
    expect(got.name).toBe("mallory");
  });

  test("a tagged key named __proto__ is an ordinary key as well", () => {
    const got = jss.parse('{"__proto__<!D>":0}');

    expect(Object.getPrototypeOf(got)).toBe(Object.prototype);
    expect(Object.keys(got)).toEqual(["__proto__"]);
    expect(Object.getOwnPropertyDescriptor(got, "__proto__").value).toEqual(new Date(0));
  });

  test("a pointer cannot hand the receiver the Function constructor, Object or a prototype", () => {
    const got = jss.parse(
      JSON.stringify({
        "a<!P>": ["constructor", "constructor"],
        "b<!P>": ["constructor"],
        "c<!P>": ["__proto__"],
        "d<!P>": ["toString"],
        "e<!P>": ["nothing", "here"],
      }),
    );

    for (const key of ["a", "b", "c", "d", "e"]) expect(got[key]).toBeUndefined();
    expect(Object.getPrototypeOf(got)).toBe(Object.prototype);
  });

  test("a pointer that is itself keyed __proto__ does not change the prototype", () => {
    const got = jss.parse('{"__proto__<!P>":[]}');

    expect(Object.getPrototypeOf(got)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(got, "__proto__").value).toBe(got);
  });

  test("honest circular references still resolve, through objects and arrays", () => {
    const sent = { list: [{ n: 1 }], child: { n: 2 } };
    sent.list.push(sent.child);
    sent.back = sent;
    sent.child.up = sent.list;

    const got = jss.parse(jss.stringify(sent));

    expect(got.back).toBe(got);
    expect(got.list[1]).toBe(got.child);
    expect(got.child.up).toBe(got.list);
  });

  test("a decoded object does not inherit from a polluted Object.prototype when iterated", () => {
    Object.prototype.leaked = "yes"; // eslint-disable-line no-extend-native
    try {
      const got = jss.parse('{"a":1}');
      expect(Object.keys(got)).toEqual(["a"]);
    } finally {
      delete Object.prototype.leaked;
    }
  });

  test.each([
    ["a<!a<!a<!".repeat(2000), "no closing bracket"],
    ["x".repeat(3000) + "<!".repeat(1500), "unclosed tag opens"],
    ["<!".repeat(20000) + ">", "a closing bracket only at the end"],
  ])("a hostile key (%#: %s) is decoded at once, not after seconds of backtracking", (key) => {
    const started = Date.now();

    const got = jss.parse(JSON.stringify({ [key]: 1 }));

    expect(Date.now() - started).toBeLessThan(500);
    expect(Object.keys(got)).toHaveLength(1);
  });

  test.each([
    ["when<!D>", "when", true],
    ["a<!b<!D>", "a<!b", true],
    ["list<![D,D>", "list", true],
    ["plain", "plain", false],
    ["<!D>", "<!D>", false],
    ["x<!>", "x", true],
  ])("the key %p decodes under the name %p (tagged: %p)", (key, name, tagged) => {
    const got = jss.parse(JSON.stringify({ [key]: tagged ? 0 : "v" }));

    expect(Object.keys(got)).toEqual([name]);
  });

  describe("a pointer's target is where it was decoded, not a path walked afterwards", () => {
    const WATCHED = [
      ["Object.prototype", () => Object.prototype],
      ["Array.prototype", () => Array.prototype],
      ["Map.prototype", () => Map.prototype],
      ["Set.prototype", () => Set.prototype],
      ["Date.prototype", () => Date.prototype],
      ["Function.prototype", () => Function.prototype],
      ["Map", () => Map],
      ["Set", () => Set],
      ["Object", () => Object],
    ];
    const snapshot = () => WATCHED.map(([, get]) => Reflect.ownKeys(get()).map(String).sort().join());

    test.each([
      ["a duplicate name reaching Object.prototype through __proto__", '{"a":{"__proto__":{"__proto__":{"isAdmin<!P>":["data","yes"]}}},"a<!M>":{},"yes":true}'],
      ["a duplicate name reaching Map through constructor", '{"a":{"constructor":{"x<!P>":["yes"]}},"a<!M>":{},"yes":"PWNED"}'],
      ["a duplicate name reaching Set.prototype", '{"a":{"__proto__":{"y<!P>":["yes"]}},"a<!S>":[],"yes":1}'],
      ["a duplicate name reaching Date.prototype", '{"a":{"__proto__":{"y<!P>":["yes"]}},"a<!D>":0,"yes":1}'],
      ["a duplicate name reaching Function.prototype", '{"a":{"__proto__":{"y<!P>":["yes"]}},"a<!R>":"/x/","yes":1}'],
    ])("%s is refused and nothing global changes", (_name, frame) => {
      const before = snapshot();

      expect(() => jss.parse(frame)).toThrow(/duplicate key "a"/);

      expect(snapshot()).toEqual(before);
      expect(({}).isAdmin).toBeUndefined();
      expect(new Map().x).toBeUndefined();
      expect(Map.x).toBeUndefined();
    });

    test("a pointer under a __proto__ key (no duplicate) writes only to an object the decoder made", () => {
      const before = snapshot();

      const got = jss.parse('{"__proto__":{"__proto__":{"isAdmin<!P>":["yes"]}},"yes":true}');

      expect(snapshot()).toEqual(before);
      expect(({}).isAdmin).toBeUndefined();
      expect(Object.getPrototypeOf(got)).toBe(Object.prototype);
    });

    test("honest pointers nested several levels down and inside arrays still resolve", () => {
      const sent = { level1: { level2: { list: [{ n: 1 }] } } };
      sent.level1.level2.list.push(sent.level1);
      sent.level1.level2.self = sent.level1.level2;

      const got = jss.parse(jss.stringify(sent));

      expect(got.level1.level2.list[1]).toBe(got.level1);
      expect(got.level1.level2.self).toBe(got.level1.level2);
    });
  });

  describe("an inline binary tag (<!I>) takes base64 text and nothing else", () => {
    test.each([
      [{ length: 50000000 }, "an object that only claims a length"],
      [[1, 2, 3], "an array of bytes"],
      [5, "a number"],
      [null, "null"],
    ])("%p (%s) is refused without allocating", (value) => {
      const started = Date.now();

      expect(() => jss.parse(JSON.stringify({ "blob<!I>": value }))).toThrow(/inline binary/);

      expect(Date.now() - started).toBeLessThan(200);
    });

    test("base64 text still decodes to the bytes", () => {
      const got = jss.parse(JSON.stringify({ "blob<!I>": Buffer.from("hello").toString("base64") }));

      expect(Buffer.from(got.blob).toString()).toBe("hello");
    });
  });
});
