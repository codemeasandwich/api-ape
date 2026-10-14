/**
 * @fileoverview Tests for the WebSocket Origin check (server/security/origin.js).
 *
 * Domain context: api-ape refuses a WebSocket whose `Origin` does not belong to
 * the server's `Host`. The historical (Node) rule compares root domains and
 * ignores ports. A loopback app such as Bluey needs the strict rule: a page on
 * another port of localhost is a different origin and must be refused. The
 * strict rule is `mode: "exact"`; it is the default under Bun, opt-in on Node.
 *
 * Technical context: the check reads headers three ways (Express `.header()`,
 * Node `.headers` object, and Fetch `Headers` with `.get()`), because the Bun
 * runtime hands api-ape a Fetch `Request`.
 */

const originSecurity = require("./origin");
const { resolveOriginPolicy } = originSecurity;

/** Build a Node-style request. */
function nodeReq(headers) {
  return { headers };
}

/** Run the check and return { ok, errors, destroyed }. */
function run(req, policy) {
  const errors = [];
  let destroyed = false;
  const socket = { destroy: () => (destroyed = true) };
  const ok = originSecurity(socket, req, (m) => errors.push(m), policy);
  return { ok, errors, destroyed };
}

describe("origin — legacy root-domain mode (default, unchanged)", () => {
  test("same root domain on a different port is allowed (documented legacy behaviour)", () => {
    const r = run(nodeReq({ origin: "http://localhost:9999", host: "localhost:3000" }));
    expect(r.ok).toBe(true);
  });

  test("different domain is refused and the socket is destroyed", () => {
    const r = run(nodeReq({ origin: "https://evil.com", host: "example.com" }));
    expect(r.ok).toBe(false);
    expect(r.destroyed).toBe(true);
    expect(r.errors[0]).toMatch(/REJECTING socket from https:\/\/evil.com/);
  });

  test("missing Origin is allowed", () => {
    expect(run(nodeReq({ host: "example.com" })).ok).toBe(true);
  });

  test("a socket without destroy() is tolerated", () => {
    const ok = originSecurity({}, nodeReq({ origin: "https://evil.com", host: "a.com" }), () => {});
    expect(ok).toBe(false);
    expect(originSecurity(null, nodeReq({ origin: "https://evil.com", host: "a.com" }), () => {})).toBe(false);
  });

  test("a ws-library socket (terminate, no destroy) is terminated", () => {
    const socket = { terminate: jest.fn(), close: jest.fn() };
    originSecurity(socket, nodeReq({ origin: "https://evil.com", host: "a.com" }), () => {});
    expect(socket.terminate).toHaveBeenCalled();
    expect(socket.close).not.toHaveBeenCalled();
  });

  test("a socket with only close() is closed with 1008", () => {
    const socket = { close: jest.fn() };
    originSecurity(socket, nodeReq({ origin: "https://evil.com", host: "a.com" }), () => {});
    expect(socket.close).toHaveBeenCalledWith(1008, "Origin not allowed");
  });

  test("onError defaults to console.error", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    originSecurity(null, nodeReq({ origin: "https://evil.com", host: "a.com" }));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("origin — header access across runtimes", () => {
  test("Express-style req.header() is used when present", () => {
    const req = { header: (n) => ({ Origin: "https://evil.com", Host: "a.com" })[n] };
    expect(run(req).ok).toBe(false);
  });

  test("Fetch Headers (Bun Request) are read with .get()", () => {
    const req = {
      headers: new Headers({ origin: "https://evil.com", host: "a.com" }),
    };
    expect(run(req).ok).toBe(false);
    const good = { headers: new Headers({ origin: "http://a.com", host: "a.com" }) };
    expect(run(good).ok).toBe(true);
    // A missing header is null in Fetch Headers and must read as absent
    expect(run({ headers: new Headers({ host: "a.com" }) }).ok).toBe(true);
  });
});

describe("origin — exact mode", () => {
  const exact = { mode: "exact" };

  test("same host and port is allowed", () => {
    expect(run(nodeReq({ origin: "http://localhost:4318", host: "localhost:4318" }), exact).ok).toBe(true);
  });

  test("another port of localhost is refused", () => {
    const r = run(nodeReq({ origin: "http://localhost:9999", host: "localhost:4318" }), exact);
    expect(r.ok).toBe(false);
    expect(r.destroyed).toBe(true);
  });

  test("127.0.0.1 is not localhost", () => {
    expect(run(nodeReq({ origin: "http://127.0.0.1:4318", host: "localhost:4318" }), exact).ok).toBe(false);
  });

  test("a sibling subdomain is refused", () => {
    expect(run(nodeReq({ origin: "https://app.example.com", host: "api.example.com" }), exact).ok).toBe(false);
  });

  test("default ports are normalised (https:443, http:80)", () => {
    expect(run(nodeReq({ origin: "https://example.com", host: "example.com:443" }), exact).ok).toBe(true);
    expect(run(nodeReq({ origin: "http://example.com:80", host: "example.com" }), exact).ok).toBe(true);
  });

  test("host comparison is case-insensitive and understands IPv6", () => {
    expect(run(nodeReq({ origin: "http://LOCALHOST:1", host: "localhost:1" }), exact).ok).toBe(true);
    expect(run(nodeReq({ origin: "http://[::1]:5", host: "[::1]:5" }), exact).ok).toBe(true);
  });

  test("scheme mismatch on the default port is refused", () => {
    expect(run(nodeReq({ origin: "https://example.com", host: "example.com:80" }), exact).ok).toBe(false);
  });

  test("missing Origin is still allowed (non-browser clients)", () => {
    expect(run(nodeReq({ host: "localhost:4318" }), exact).ok).toBe(true);
  });

  test("Origin present but Host missing is refused", () => {
    expect(run(nodeReq({ origin: "http://localhost:4318" }), exact).ok).toBe(false);
  });

  test("opaque and unparseable Origins are refused", () => {
    expect(run(nodeReq({ origin: "null", host: "localhost:1" }), exact).ok).toBe(false);
    expect(run(nodeReq({ origin: "not a url", host: "localhost:1" }), exact).ok).toBe(false);
  });

  test("an unparseable Host is refused", () => {
    expect(run(nodeReq({ origin: "http://localhost:1", host: "bad host/x y" }), exact).ok).toBe(false);
  });

  test("a Host carrying a path or userinfo is refused", () => {
    expect(run(nodeReq({ origin: "http://localhost:1", host: "localhost:1/x" }), exact).ok).toBe(false);
    expect(run(nodeReq({ origin: "http://localhost:1", host: "u@localhost:1" }), exact).ok).toBe(false);
  });

  test("negative controls: comma-joined Origins, trailing-dot hosts and a port mismatch are refused", () => {
    expect(run(nodeReq({ origin: "http://localhost:4318, http://evil.test", host: "localhost:4318" }), exact).ok).toBe(false);
    expect(run(nodeReq({ origin: "http://evil.test, http://localhost:4318", host: "localhost:4318" }), exact).ok).toBe(false);
    expect(run(nodeReq({ origin: "http://localhost.:4318", host: "localhost:4318" }), exact).ok).toBe(false);
    expect(run(nodeReq({ origin: "http://localhost:4318", host: "localhost.:4318" }), exact).ok).toBe(false);
    expect(run(nodeReq({ origin: "http://localhost:4318", host: "localhost:4318, evil.test" }), exact).ok).toBe(false);
  });

  test("non-http Origin schemes are refused", () => {
    expect(run(nodeReq({ origin: "chrome-extension://abc", host: "abc" }), exact).ok).toBe(false);
  });
});

describe("origin — allowedOrigins and allowedHosts", () => {
  test("allowedOrigins admits an exact listed Origin (normalised) in exact mode", () => {
    const policy = { mode: "exact", allowedOrigins: ["http://localhost:5173/"] };
    expect(run(nodeReq({ origin: "http://localhost:5173", host: "localhost:4318" }), policy).ok).toBe(true);
    expect(run(nodeReq({ origin: "http://localhost:5174", host: "localhost:4318" }), policy).ok).toBe(false);
  });

  test("allowedOrigins may list the literal null origin", () => {
    const policy = { mode: "exact", allowedOrigins: ["null"] };
    expect(run(nodeReq({ origin: "null", host: "localhost:1" }), policy).ok).toBe(true);
  });

  test("allowedOrigins also works in root-domain mode", () => {
    const policy = { mode: "root-domain", allowedOrigins: ["https://other.org"] };
    expect(run(nodeReq({ origin: "https://other.org", host: "a.com" }), policy).ok).toBe(true);
  });

  test("allowedHosts refuses a Host not in the list, even with no Origin (DNS rebinding)", () => {
    const policy = { mode: "exact", allowedHosts: ["localhost:4318", "127.0.0.1:4318"] };
    expect(run(nodeReq({ host: "localhost:4318" }), policy).ok).toBe(true);
    expect(run(nodeReq({ host: "LOCALHOST:4318" }), policy).ok).toBe(true);
    const r = run(nodeReq({ host: "evil.test:4318" }), policy);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Host/);
    expect(run(nodeReq({}), policy).ok).toBe(false);
  });

  test("an empty allowedHosts list means no host restriction", () => {
    expect(run(nodeReq({ host: "anything:1" }), { mode: "exact", allowedHosts: [] }).ok).toBe(true);
  });
});

describe("origin — resolveOriginPolicy", () => {
  test("uses the supplied default mode when none is given", () => {
    expect(resolveOriginPolicy(undefined, "exact").mode).toBe("exact");
    expect(resolveOriginPolicy({}, "root-domain").mode).toBe("root-domain");
    expect(resolveOriginPolicy({ mode: "exact" }, "root-domain").mode).toBe("exact");
  });

  test("rejects an unknown mode loudly", () => {
    expect(() => resolveOriginPolicy({ mode: "loose" }, "exact")).toThrow(/origin\.mode/);
  });

  test("rejects non-array allow lists", () => {
    expect(() => resolveOriginPolicy({ allowedOrigins: "x" }, "exact")).toThrow(/allowedOrigins/);
    expect(() => resolveOriginPolicy({ allowedHosts: "x" }, "exact")).toThrow(/allowedHosts/);
  });

  test("a misspelt option is refused, not silently ignored (it would drop the rebinding guard)", () => {
    expect(() => resolveOriginPolicy({ allowedHost: ["x:1"] }, "exact")).toThrow(/unknown origin option allowedHost/);
  });

  test("allow-list entries must be strings", () => {
    expect(() => resolveOriginPolicy({ allowedHosts: [5173] }, "exact")).toThrow(/must be strings/);
    expect(() => resolveOriginPolicy({ allowedOrigins: [null] }, "exact")).toThrow(/must be strings/);
  });

  test("allowedOrigins entries must be http(s) origins", () => {
    expect(() => resolveOriginPolicy({ allowedOrigins: ["localhost:5173"] }, "exact")).toThrow(/http\(s\) origin/);
    expect(() => resolveOriginPolicy({ allowedOrigins: ["::bad::"] }, "exact")).toThrow(/http\(s\) origin/);
    expect(() => resolveOriginPolicy({ allowedOrigins: ["ftp://x"] }, "exact")).toThrow(/http\(s\) origin/);
  });

  test("passes through an already-resolved policy", () => {
    const p = resolveOriginPolicy({ mode: "exact", allowedHosts: ["a:1"] }, "root-domain");
    expect(resolveOriginPolicy(p, "root-domain")).toEqual(p);
  });
});
