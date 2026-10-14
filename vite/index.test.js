/**
 * @fileoverview Tests for the Vite plugin's hot-reload default and watcher hand-over.
 *
 * Domain context: the plugin only runs under `vite serve`, so it turns controller
 * hot reload on by default (the core default is off) and must stop the previous
 * file watcher when Vite restarts its HTTP server, or watchers pile up.
 */

const { EventEmitter } = require("events");

const mockApe = jest.fn(() => ({ core: { controllers: { marker: Math.random() } } }));
mockApe._resetForTesting = jest.fn();
jest.mock("../server/lib/main", () => mockApe);
const mockStop = jest.fn();
jest.mock("../server/utils/deepRequire", () => ({ stopWatching: mockStop }));

const apiApe = require("./index");

function start(plugin) {
  const httpServer = new EventEmitter();
  httpServer.address = () => ({ port: 5173 });
  const server = { httpServer, config: { root: "/app" } };
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  plugin.configureServer(server);
  httpServer.emit("listening");
  return new Promise((r) => setImmediate(() => { log.mockRestore(); r(); }));
}

beforeEach(() => {
  mockApe.mockClear();
  mockStop.mockClear();
});

test("watch defaults to true, and can be switched off or given paths", async () => {
  await start(apiApe({ where: "api" }));
  expect(mockApe.mock.calls[0][1].watch).toBe(true);
  await start(apiApe({ where: "api", watch: false }));
  expect(mockApe.mock.calls[1][1].watch).toBe(false);
  await start(apiApe({ where: "api", watch: { paths: ["/svc"] } }));
  expect(mockApe.mock.calls[2][1].watch).toEqual({ paths: ["/svc"] });
});

test("a Vite restart stops the previous api-ape watcher", async () => {
  const plugin = apiApe({ where: "api" });
  await start(plugin);
  expect(mockStop).not.toHaveBeenCalled();
  const first = mockApe.mock.results[0].value.core.controllers;
  await start(plugin);
  expect(mockStop).toHaveBeenCalledWith(first);
});
