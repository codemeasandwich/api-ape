/**
 * @fileoverview Tests for the long-polling POST handler.
 *
 * Drives the handler via mocked req/res EventEmitters to exercise the
 * non-Error throw path. Real-world: a controller calls `throw "string"`
 * (legacy / loosely-typed code) — the response must surface the string
 * via `String(err)` since `err.message` is undefined.
 */

const EventEmitter = require("events");
const { createPostHandler } = require("./postHandler");

function makeReqRes({ cookie } = {}) {
  const req = new EventEmitter();
  req.headers = { cookie: cookie || "" };
  req.url = "/api/ape/poll";
  req.method = "POST";

  const res = new EventEmitter();
  res.writeHead = jest.fn();
  res.end = jest.fn();
  res.setHeader = jest.fn();
  return { req, res };
}

describe("longPolling/postHandler — non-Error throw path", () => {
  test("controller throws a string — response uses String(err) fallback", (done) => {
    const streamClients = new Map();
    const handle = createPostHandler(streamClients);
    const { req, res } = makeReqRes({ cookie: "apeClientId=client-x" });

    const controllers = {
      flaky: async function () {
        throw "string-thrown-as-error";
      },
    };

    // Simulate the response end so we can assert
    res.end.mockImplementation((body) => {
      try {
        const parsed = JSON.parse(body);
        expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
        expect(parsed.err).toBe("string-thrown-as-error");
        done();
      } catch (e) { done(e); }
    });

    handle(req, res, controllers);
    // Emit a JSON body that targets the "flaky" controller
    req.emit("data", Buffer.from(JSON.stringify({ type: "/flaky", data: {} })));
    req.emit("end");
  });
});
