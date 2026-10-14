/**
 * @fileoverview Node entry point: the `origin` and `watch` options of `ape(server, options)`.
 *
 * Domain context: on Node the default Origin rule stays the historical
 * root-domain check (ports ignored), so existing apps do not change behaviour.
 * An app that wants the strict rule passes `origin: { mode: "exact" }`.
 * Hot reload is off unless `watch` is passed.
 *
 * Technical context: a real http.Server and the `ws` client, with an Origin
 * header, against a one-controller directory.
 */

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");
const ape = require("./main");
const { resetFileTransferManager } = require("./fileTransfer");

let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ape-node-origin-"));
  fs.writeFileSync(path.join(dir, "ping.js"), "module.exports = () => 'pong';");
});
afterAll(() => {
  resetFileTransferManager();
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => ape._resetForTesting());

async function listen(options) {
  const server = http.createServer((req, res) => res.end("x"));
  const core = ape(server, { where: dir, urlPrefix: "api", logging: false, ...options });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, core, port: server.address().port };
}

/** Resolve true if the socket stays open after the handshake and a short wait. */
function connects(port, origin) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ape`, { headers: origin ? { Origin: origin } : {} });
    let opened = false;
    ws.on("open", () => {
      opened = true;
      setTimeout(() => {
        const stayed = ws.readyState === WebSocket.OPEN;
        ws.close();
        resolve(stayed);
      }, 150);
    });
    ws.on("close", () => resolve(false));
    ws.on("error", () => opened || resolve(false));
  });
}

describe("ape(server) on Node: origin policy", () => {
  test("default keeps the legacy root-domain rule (another port is allowed)", async () => {
    const { server, port } = await listen({});
    try {
      expect(await connects(port, `http://127.0.0.1:${port + 1}`)).toBe(true);
      expect(await connects(port, "http://evil.example")).toBe(false);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  test("origin.mode exact refuses another port and admits the same port", async () => {
    const { server, port } = await listen({ origin: { mode: "exact" } });
    try {
      expect(await connects(port, `http://127.0.0.1:${port + 1}`)).toBe(false);
      expect(await connects(port, `http://127.0.0.1:${port}`)).toBe(true);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  test("a refused Origin is an HTTP 403 at the upgrade and never reaches onConnect", async () => {
    const onConnect = jest.fn();
    const { server, port } = await listen({ origin: { mode: "exact" }, onConnect });
    try {
      const status = await new Promise((resolve) => {
        const req = http.request({
          host: "127.0.0.1",
          port,
          path: "/api/ape",
          headers: {
            Connection: "Upgrade",
            Upgrade: "websocket",
            "Sec-WebSocket-Version": "13",
            "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
            Origin: `http://127.0.0.1:${port + 1}`,
          },
        });
        req.on("upgrade", () => resolve("upgraded"));
        req.on("response", (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on("error", () => resolve("error"));
        req.end();
      });
      expect(status).toBe(403);
      expect(onConnect).not.toHaveBeenCalled();
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  test("hot reload is off by default", async () => {
    const watchSpy = jest.spyOn(fs, "watch");
    const { server } = await listen({});
    try {
      expect(watchSpy).not.toHaveBeenCalled();
    } finally {
      watchSpy.mockRestore();
      server.closeAllConnections();
      server.close();
    }
  });

  test("watch:true starts the watcher; the controllers object can be stopped", async () => {
    const watchSpy = jest.spyOn(fs, "watch");
    const { server, core } = await listen({ watch: true });
    try {
      expect(watchSpy).toHaveBeenCalledTimes(1);
      require("../utils/deepRequire").stopWatching(core.core.controllers);
    } finally {
      watchSpy.mockRestore();
      server.closeAllConnections();
      server.close();
    }
  });
});
