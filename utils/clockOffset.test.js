/**
 * @fileoverview Tests for utils/clockOffset: the offset read from `__connected__`, and the
 * gate that holds queued calls until it has arrived. The clients' use of both is covered by
 * `simulator/scenarios/stories/call-contract/clock-skew.test.js`.
 */

const { clockOffsetFrom, createConnectedGate, createServerClock, CONNECTED_WAIT_MS } = require("./clockOffset");

describe("clockOffsetFrom", () => {
  test("is the server's time minus the local time when the frame arrived", () => {
    expect(clockOffsetFrom({ clientId: "a", serverTime: 1_000_060 }, 1_000_000)).toBe(60);
    expect(clockOffsetFrom({ serverTime: 940_000 }, 1_000_000)).toBe(-60000);
  });

  test("reads the local clock when none is given", () => {
    const offset = clockOffsetFrom({ serverTime: Date.now() + 5000 });
    expect(offset).toBeGreaterThan(4000);
    expect(offset).toBeLessThanOrEqual(5000);
  });

  test.each([[undefined], [null], [{}], [{ serverTime: "soon" }], [{ serverTime: NaN }], [{ serverTime: Infinity }], [{ serverTime: null }]])(
    "is 0 (the client's own clock) when the greeting is %p",
    (greeting) => {
      expect(clockOffsetFrom(greeting, 1_000_000)).toBe(0);
    },
  );
});

describe("createConnectedGate", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("holds the calls from begin() until settle(), then sends them once", () => {
    const send = jest.fn();
    const gate = createConnectedGate(send);

    expect(gate.isWaiting()).toBe(false);
    gate.begin();
    expect(gate.isWaiting()).toBe(true);
    expect(send).not.toHaveBeenCalled();
    gate.settle();
    gate.settle();

    expect(send).toHaveBeenCalledTimes(1);
    expect(gate.isWaiting()).toBe(false);
  });

  test("sends them anyway after the wait when no greeting arrives", () => {
    const send = jest.fn();
    const gate = createConnectedGate(send);

    gate.begin();
    jest.advanceTimersByTime(CONNECTED_WAIT_MS - 1);
    expect(send).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(send).toHaveBeenCalledTimes(1);
    expect(gate.isWaiting()).toBe(false);
  });

  test("cancel() drops the wait without sending (the socket closed), and a settle() with nothing waiting does nothing", () => {
    const send = jest.fn();
    const gate = createConnectedGate(send);

    gate.settle();
    gate.begin();
    gate.cancel();
    jest.advanceTimersByTime(CONNECTED_WAIT_MS * 2);

    expect(send).not.toHaveBeenCalled();
    expect(gate.isWaiting()).toBe(false);
  });

  test("works where a timer is a plain number (a browser) and cannot be unref'd", () => {
    const send = jest.fn();
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn) => realSetTimeout(fn, 0) && 7; // a number, as browsers return
    try {
      const gate = createConnectedGate(send);
      gate.begin();
      gate.settle();
    } finally {
      global.setTimeout = realSetTimeout;
    }

    expect(send).toHaveBeenCalledTimes(1);
  });

  test("a second begin() restarts the wait instead of sending twice", () => {
    const send = jest.fn();
    const gate = createConnectedGate(send, 500);

    gate.begin();
    jest.advanceTimersByTime(400);
    gate.begin();
    jest.advanceTimersByTime(400);
    expect(send).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("createServerClock", () => {
  test("a greeting stores the offset and sends the queued calls; a later greeting without serverTime resets it to 0", () => {
    const send = jest.fn();
    const clock = createServerClock(send);

    expect(clock.offset()).toBe(0);
    clock.begin();
    clock.connected({ serverTime: Date.now() + 60000 });
    expect(clock.offset()).toBeGreaterThan(59000);
    expect(send).toHaveBeenCalledTimes(1);
    clock.begin();
    clock.connected({ clientId: "older server" });

    expect(clock.offset()).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(clock.isWaiting()).toBe(false);
  });
});
