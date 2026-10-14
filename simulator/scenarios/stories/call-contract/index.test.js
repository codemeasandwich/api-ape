/**
 * @fileoverview Call-contract stories (api-ape 4.3.1): what a caller can rely on when it
 * makes a call, seen through the public server API and a raw socket.
 *
 * Every test is a user story. The page-side halves of these stories (the real browser
 * client) live in `integration/bun/client-*.ts`; this file covers what the SERVER
 * promises on the wire.
 *
 * @module simulator/scenarios/stories/call-contract
 */

const path = require("path");
const { Harness } = require("../../../harness");
const { connectRaw } = require("./raw-client");

jest.setTimeout(20000);

const FIXTURES = path.resolve(__dirname, "../../../test-api-contract");

describe("Call contract", () => {
  let harness;

  beforeEach(() => {
    jest.resetModules();
    harness = new Harness({ basePort: 36000, connectTimeout: 10000 });
  });

  afterEach(async () => {
    await harness.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe("keepalive", () => {
    test("two slow calls at once: each keepalive frame carries its own call's id and each call gets one reply", async () => {
      const server = await harness.createServer({ where: FIXTURES });
      const raw = await connectRaw(server);

      const a = raw.call("slow", { n: 3, ms: 150, tag: "A" });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const b = raw.call("slow", { n: 2, ms: 150, tag: "B" });

      const [replyA, replyB] = await Promise.all([raw.reply(a), raw.reply(b)]);
      expect(replyA.data).toEqual({ done: true, tag: "A", rounds: 3 });
      expect(replyB.data).toEqual({ done: true, tag: "B", rounds: 2 });

      // A's three keepalives and B's two, each on the right id, none lost to the other call.
      expect(raw.framesFor(a).filter((f) => f._keepalive)).toHaveLength(3);
      expect(raw.framesFor(b).filter((f) => f._keepalive)).toHaveLength(2);
      // Exactly one reply frame per call.
      expect(raw.framesFor(a).filter((f) => !f._keepalive)).toHaveLength(1);
      expect(raw.framesFor(b).filter((f) => !f._keepalive)).toHaveLength(1);
      raw.close();
    });
  });
  describe("identical calls", () => {
    test("a service calling the same endpoint three times in one millisecond gets three replies", async () => {
      // The server-side client (`api.connect`) dials `/api/ape`, so mount under `api`.
      const server = await harness.createServer({ where: FIXTURES, apeOptions: { urlPrefix: "api" } });
      const { api } = require("../../../../server");
      api.connect(server.host, server.port);
      try {
        const replies = await Promise.all([1, 2, 3].map(() => api.echo({ same: "payload" })));
        expect(replies).toEqual([
          { echo: { same: "payload" } },
          { echo: { same: "payload" } },
          { echo: { same: "payload" } },
        ]);
      } finally {
        api.close();
      }
    });
  });
  describe("replies", () => {
    test("a controller that returns nothing still answers: the caller gets a reply whose data is undefined", async () => {
      const server = await harness.createServer({ where: FIXTURES });
      const raw = await connectRaw(server);

      const reply = await raw.reply(raw.call("voidret", {}));

      expect(reply.err).toBeUndefined();
      expect(reply.data).toBeUndefined();
      raw.close();
    });
  });
});
