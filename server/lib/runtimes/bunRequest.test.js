/**
 * @fileoverview Tests for the Bun request adapter (server/lib/runtimes/bunRequest.js).
 *
 * Domain context: under Bun, api-ape receives a Fetch `Request`, but the rest of
 * the server (Origin check, session cookie, resume hint, user-agent, controller
 * `this.req`) was written for Node's `http.IncomingMessage` and reads
 * `req.headers.cookie`, `req.headers["user-agent"]`, `req.socket.remoteAddress`.
 * Under Bun those read as undefined, so the Origin check always passed and the
 * session never matched. The adapter hands the server a Node-shaped request and
 * enforces the Origin policy BEFORE the socket is upgraded.
 *
 * Technical context: Node 18+ and Bun both provide global Request/Headers, so
 * these tests build real Fetch Requests; only `server.upgrade`/`requestIP` are
 * faked.
 */

const { toNodeRequest, upgradeWebSocket } = require("./bunRequest");
const { _clients } = require("../broadcast/clients");
const wiring = require("../wiring");
const { EventEmitter } = require("events");

function fetchReq(url, headers = {}, method = "GET") {
  return new Request(url, { method, headers });
}

describe("toNodeRequest", () => {
  test("exposes headers as a lower-case plain object (the Node shape)", () => {
    const req = fetchReq("http://localhost:4318/api/ape?resume=ABC", {
      Origin: "http://localhost:4318",
      Cookie: "sessionId=s1; other=2",
      "User-Agent": "Mozilla/5.0",
      "X-Ape-Session-Id": "hdr",
    });
    const n = toNodeRequest(req, null);
    expect(n.headers.origin).toBe("http://localhost:4318");
    expect(n.headers.cookie).toBe("sessionId=s1; other=2");
    expect(n.headers["user-agent"]).toBe("Mozilla/5.0");
    expect(n.headers["x-ape-session-id"]).toBe("hdr");
    expect(Object.keys(n.headers)).toEqual(expect.arrayContaining(["origin", "cookie"]));
  });

  test("keeps the Fetch accessors so existing Bun code keeps working", () => {
    const n = toNodeRequest(fetchReq("http://h/x", { Foo: "bar" }), null);
    expect(n.headers.get("Foo")).toBe("bar");
    expect(n.headers.get("missing")).toBe(null);
    expect(n.headers.has("foo")).toBe(true);
    expect(n.headers.has("nope")).toBe(false);
    // ...without showing up as header names
    expect(Object.keys(n.headers)).not.toContain("get");
    expect(JSON.stringify(n.headers)).toBe('{"foo":"bar"}');
  });

  test("a client header named get or has cannot shadow the accessors or appear as a header", () => {
    const n = toNodeRequest(fetchReq("http://h/x", { get: "evil", has: "evil", other: "1" }), null);
    expect(typeof n.headers.get).toBe("function");
    expect(n.headers.get("other")).toBe("1");
    expect(Object.keys(n.headers)).toEqual(["other"]);
  });

  test("a hostile __proto__ header is an own data property, not a prototype", () => {
    // (an object literal would swallow "__proto__", so build the Headers by hand)
    const h = new Headers();
    h.append("__proto__", "x");
    const n = toNodeRequest(new Request("http://h/x", { headers: h }), null);
    expect(Object.getPrototypeOf(n.headers)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(n.headers, "__proto__")).toBe(true);
  });

  test("url is path+query like Node; method and rawRequest are carried", () => {
    const req = fetchReq("http://localhost:4318/api/ape?resume=ABC&x=1", {}, "GET");
    const n = toNodeRequest(req, null);
    expect(n.url).toBe("/api/ape?resume=ABC&x=1");
    expect(n.method).toBe("GET");
    expect(n.rawRequest).toBe(req);
  });

  test("socket.remoteAddress comes from server.requestIP when Bun provides it", () => {
    const req = fetchReq("http://h/x");
    const server = { requestIP: jest.fn(() => ({ address: "127.0.0.1", port: 5555, family: "IPv4" })) };
    const n = toNodeRequest(req, server);
    expect(server.requestIP).toHaveBeenCalledWith(req);
    expect(n.socket.remoteAddress).toBe("127.0.0.1");
    expect(n.socket.remotePort).toBe(5555);
  });

  test("socket is an empty object when requestIP is unavailable or returns null", () => {
    expect(toNodeRequest(fetchReq("http://h/x"), null).socket).toEqual({});
    expect(toNodeRequest(fetchReq("http://h/x"), {}).socket).toEqual({});
    expect(toNodeRequest(fetchReq("http://h/x"), { requestIP: () => null }).socket).toEqual({});
  });
});

describe("upgradeWebSocket", () => {
  const upgradeHeaders = { Upgrade: "websocket", Connection: "Upgrade" };

  function fakeServer(result = true) {
    return { upgrade: jest.fn(() => result) };
  }

  test("returns null for a request that is not a WebSocket upgrade", () => {
    const server = fakeServer();
    expect(upgradeWebSocket(fetchReq("http://h/api/ape"), server)).toBeNull();
    expect(upgradeWebSocket(fetchReq("http://h/api/ape", { Upgrade: "h2c" }), server)).toBeNull();
    expect(server.upgrade).not.toHaveBeenCalled();
  });

  test("upgrades with a Node-shaped req in data and returns undefined", () => {
    const server = fakeServer();
    const req = fetchReq("http://localhost:4318/api/ape", {
      ...upgradeHeaders,
      Origin: "http://localhost:4318",
      Host: "localhost:4318",
      Cookie: "sessionId=abc",
    });
    expect(upgradeWebSocket(req, server)).toBeUndefined();
    expect(server.upgrade).toHaveBeenCalledTimes(1);
    const [passedReq, opts] = server.upgrade.mock.calls[0];
    expect(passedReq).toBe(req);
    expect(opts.data.req.headers.cookie).toBe("sessionId=abc");
    expect(opts.data.req.rawRequest).toBe(req);
  });

  test("Upgrade header is matched case-insensitively", () => {
    const server = fakeServer();
    expect(upgradeWebSocket(fetchReq("http://h/x", { Upgrade: "WebSocket" }), server)).toBeUndefined();
  });

  test("a page on another port of localhost is refused with 403 before upgrading (default exact policy)", async () => {
    const server = fakeServer();
    const errors = [];
    const req = fetchReq("http://localhost:4318/api/ape", {
      ...upgradeHeaders,
      Origin: "http://localhost:9999",
      Host: "localhost:4318",
    });
    const res = upgradeWebSocket(req, server, { onError: (m) => errors.push(m) });
    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/Origin/);
    expect(server.upgrade).not.toHaveBeenCalled();
    expect(errors[0]).toMatch(/REJECTING socket from http:\/\/localhost:9999/);
  });

  test("an unnamed onError falls back to the api-ape logger", () => {
    const apeLogger = require("../../../utils/apeLogger");
    const err = jest.fn();
    apeLogger.configureApeLogging({ error: err, log() {}, warn() {}, info() {}, debug() {} });
    try {
      const res = upgradeWebSocket(
        fetchReq("http://localhost:4318/api/ape", {
          ...upgradeHeaders,
          Origin: "http://evil.test",
          Host: "localhost:4318",
        }),
        fakeServer(),
      );
      expect(res.status).toBe(403);
      expect(err).toHaveBeenCalled();
    } finally {
      apeLogger.resetApeLoggingForTesting();
    }
  });

  test("the exact origin is admitted; a missing Origin is admitted", () => {
    const server = fakeServer();
    expect(
      upgradeWebSocket(
        fetchReq("http://localhost:4318/api/ape", {
          ...upgradeHeaders,
          Origin: "http://localhost:4318",
          Host: "localhost:4318",
        }),
        server,
      ),
    ).toBeUndefined();
    expect(upgradeWebSocket(fetchReq("http://localhost:4318/api/ape", upgradeHeaders), server)).toBeUndefined();
  });

  test("a policy can opt back into root-domain matching and allow extra origins", () => {
    const server = fakeServer();
    const headers = { ...upgradeHeaders, Origin: "http://localhost:9999", Host: "localhost:4318" };
    expect(
      upgradeWebSocket(fetchReq("http://localhost:4318/x", headers), server, {
        originPolicy: { mode: "root-domain" },
      }),
    ).toBeUndefined();
    expect(
      upgradeWebSocket(fetchReq("http://localhost:4318/x", headers), server, {
        originPolicy: { allowedOrigins: ["http://localhost:9999"] },
      }),
    ).toBeUndefined();
  });

  test("allowedHosts refuses a rebound Host even from the same origin", () => {
    const res = upgradeWebSocket(
      fetchReq("http://evil.test:4318/x", {
        ...upgradeHeaders,
        Origin: "http://evil.test:4318",
        Host: "evil.test:4318",
      }),
      fakeServer(),
      { originPolicy: { allowedHosts: ["localhost:4318"] }, onError: () => {} },
    );
    expect(res.status).toBe(403);
  });

  test("returns a 500 when Bun cannot upgrade", async () => {
    const res = upgradeWebSocket(fetchReq("http://h/x", upgradeHeaders), fakeServer(false));
    expect(res.status).toBe(500);
    expect(await res.text()).toMatch(/upgrade failed/);
  });
});

describe("Bun request through the wiring layer", () => {
  beforeEach(() => _clients.clear());

  // Scenario: the pre-fix bug. A Bun Request's Cookie/User-Agent were unreadable,
  // so every connect minted a new session and agent was empty. With the adapter
  // the controller sees the same values it would see under Node.
  test("session cookie, user-agent and resume hint reach the wiring layer", async () => {
    const server = { upgrade: jest.fn(() => true) };
    const req = fetchReq("http://localhost:4318/api/ape", {
      Upgrade: "websocket",
      Cookie: "sessionId=SESS1",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
      Host: "localhost:4318",
    });
    upgradeWebSocket(req, server);
    const nodeReq = server.upgrade.mock.calls[0][1].data.req;

    const socket = new EventEmitter();
    socket.send = jest.fn();
    socket.readyState = 1;
    socket.OPEN = 1;
    socket.destroy = jest.fn();
    let seen;
    wiring({}, function (sock, r) { seen = r; return {}; }, null, {})(socket, nodeReq);
    await new Promise((r) => setImmediate(r));
    const connected = JSON.parse(socket.send.mock.calls[0][0]);
    expect(connected.data.sessionId).toBe("SESS1");
    expect(seen.headers.cookie).toContain("SESS1");
    const row = [..._clients.values()][0]._raw;
    expect(row.sessionId).toBe("SESS1");
    expect(row.agent && row.agent.browser).toBeTruthy();
  });
});
