/**
 * @fileoverview Tests for the homegrown WebSocket polyfill class.
 *
 * Drives the public methods (send, close, ping) with a mock TCP socket
 * (Duplex stream) to exercise the binary-opcode branch, default-arg
 * defaults on close(), and the underlying TCP "error" event handler
 * that re-emits as "error" on the WebSocket facade.
 */

const { Duplex } = require("stream");
const { WebSocket, READY_STATES } = require("./socket");

function fakeTcp() {
  const s = new Duplex({ read() {}, write() {} });
  s.write = jest.fn();
  s.destroy = jest.fn();
  return s;
}

function openWs() {
  const tcp = fakeTcp();
  const ws = new WebSocket(tcp);
  ws._readyState = READY_STATES.OPEN;
  return { ws, tcp };
}

describe("WebSocket polyfill", () => {
  // Scenario: send a Buffer payload — the opcode must be BINARY (0x2),
  // not TEXT (0x1). Exercises the `Buffer.isBuffer(data) ? BINARY : TEXT`
  // truthy branch at L315.
  test("send(Buffer) frames as binary opcode", () => {
    const { ws, tcp } = openWs();
    ws.send(Buffer.from([1, 2, 3]));
    expect(tcp.write).toHaveBeenCalled();
    const frame = tcp.write.mock.calls[0][0];
    // Opcode is the lower nibble of byte 0; 0x82 = FIN + binary
    expect(frame[0] & 0x0f).toBe(0x2);
  });

  // Scenario: close() called with no arguments — defaults must apply
  // (code=1000, reason=""). Exercises default-arg branches at L355.
  test("close() with no args uses default code 1000 and empty reason", () => {
    const { ws, tcp } = openWs();
    ws.close();
    expect(ws._readyState).toBe(READY_STATES.CLOSING);
    expect(tcp.write).toHaveBeenCalled();
  });

  // Scenario: the underlying TCP socket emits 'error' — the WebSocket
  // facade must re-emit 'error' so listeners can react. Exercises the
  // arrow handler at L396.
  test("TCP error is re-emitted as WebSocket error", () => {
    const tcp = fakeTcp();
    const ws = new WebSocket(tcp);
    const handler = jest.fn();
    ws.on("error", handler);
    const err = new Error("conn reset");
    tcp.emit("error", err);
    expect(handler).toHaveBeenCalledWith(err);
  });
});
