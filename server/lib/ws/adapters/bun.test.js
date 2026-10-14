/**
 * @fileoverview Tests for the Bun WebSocket adapter's close/destroy contract.
 *
 * Domain context: the Origin check refuses a connection with `socket.destroy()`.
 * Under Bun the adapter must turn that into a close frame (1008) instead of
 * silently leaving the connection open.
 */

const { BunWebSocket } = require("./bun");

function bunSocket() {
  return { send: jest.fn(), close: jest.fn() };
}

describe("BunWebSocket.destroy", () => {
  test("closes the native socket with 1008 and marks it closing", () => {
    const native = bunSocket();
    const ws = new BunWebSocket(native);
    ws.destroy();
    expect(native.close).toHaveBeenCalledWith(1008, "Origin not allowed");
    expect(ws.readyState).toBe(ws.CLOSING);
  });

  test("is a no-op once closing, so evictSupersededSocket's close+destroy is safe", () => {
    const native = bunSocket();
    const ws = new BunWebSocket(native);
    ws.close(4000, "Superseded");
    ws.destroy();
    expect(native.close).toHaveBeenCalledTimes(1);
    expect(native.close).toHaveBeenCalledWith(4000, "Superseded");
  });
});
