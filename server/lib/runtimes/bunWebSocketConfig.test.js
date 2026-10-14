/**
 * @fileoverview Tests for the Bun `websocket` config pass-through.
 *
 * Domain context: under Bun the socket keepalive is Bun's, not api-ape's.
 * Bun sends protocol ping frames every `sendPings` cycle and closes a socket
 * that has been idle for `idleTimeout` seconds (default 120). A loopback app
 * that holds quiet subscriptions may want to tune that, so `apeBun` forwards the
 * documented Bun options and refuses anything else loudly.
 */

const { bunWebSocketConfig, ALLOWED_KEYS } = require("./bunWebSocketConfig");

describe("bunWebSocketConfig", () => {
  test("no options gives an empty config (Bun defaults apply)", () => {
    expect(bunWebSocketConfig()).toEqual({});
    expect(bunWebSocketConfig({})).toEqual({});
  });

  test("forwards every documented Bun websocket option", () => {
    const all = {
      idleTimeout: 960,
      sendPings: false,
      maxPayloadLength: 1024,
      backpressureLimit: 2048,
      closeOnBackpressureLimit: true,
      perMessageDeflate: false,
      publishToSelf: false,
    };
    expect(Object.keys(all).sort()).toEqual([...ALLOWED_KEYS].sort());
    expect(bunWebSocketConfig(all)).toEqual(all);
  });

  test("returns a copy, not the caller's object", () => {
    const given = { idleTimeout: 30 };
    expect(bunWebSocketConfig(given)).not.toBe(given);
  });

  test("an unknown or handler key is refused, naming the allowed ones", () => {
    expect(() => bunWebSocketConfig({ idletimeout: 1 })).toThrow(/idletimeout/);
    expect(() => bunWebSocketConfig({ message() {} })).toThrow(/idleTimeout/);
  });
});
