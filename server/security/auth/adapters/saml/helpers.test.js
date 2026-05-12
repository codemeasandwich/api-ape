/**
 * @fileoverview Tests for SAML adapter helpers.
 *
 * The helpers export `createDefaultStorage` and `generateRequestId`. The
 * adapter only exercises a subset of the storage methods through its public
 * surface; here we directly drive the storage API for the helpers that the
 * adapter doesn't currently invoke (request-lifecycle bookkeeping). These
 * are real fields used by integrators who wire SAML state into their own
 * SP backends.
 */

const { createDefaultStorage, generateRequestId } = require("./helpers");

describe("SAML helpers — generateRequestId", () => {
  test("returns a unique string with leading underscore", () => {
    const a = generateRequestId();
    const b = generateRequestId();
    expect(a).toMatch(/^_[0-9a-f]+$/);
    expect(b).toMatch(/^_[0-9a-f]+$/);
    expect(a).not.toBe(b);
  });
});

describe("SAML helpers — createDefaultStorage", () => {
  // Scenario: a SAML SP stores a pending AuthnRequest after redirecting the
  // user to the IdP. Subsequent callback handling looks the request up and
  // (on success) deletes the entry to prevent replay.
  test("savePendingRequest then getPendingRequest round-trips data", async () => {
    const store = createDefaultStorage();
    await store.savePendingRequest("req-1", { relayState: "/home" });
    const fetched = await store.getPendingRequest("req-1");
    expect(fetched.relayState).toBe("/home");
    expect(typeof fetched.createdAt).toBe("number");
  });

  test("getPendingRequest returns null for an unknown id", async () => {
    const store = createDefaultStorage();
    expect(await store.getPendingRequest("never-saved")).toBeNull();
  });

  test("deletePendingRequest removes a stored entry and returns true", async () => {
    const store = createDefaultStorage();
    await store.savePendingRequest("req-2", { relayState: "/dash" });
    const removed = await store.deletePendingRequest("req-2");
    expect(removed).toBe(true);
    expect(await store.getPendingRequest("req-2")).toBeNull();
  });

  test("deletePendingRequest on unknown id returns false", async () => {
    const store = createDefaultStorage();
    expect(await store.deletePendingRequest("never-saved")).toBe(false);
  });

  // Scenario: integrator pre-registers expected SAML attributes for a
  // known user (test mode or seeded prod database). The same mock user
  // is then returned to subsequent authentication callbacks.
  test("registerMockUser + getMockUser round-trips attributes", async () => {
    const store = createDefaultStorage();
    await store.registerMockUser("user@org.example", {
      firstName: "Test",
      lastName: "User",
    });
    const user = await store.getMockUser("user@org.example");
    expect(user.firstName).toBe("Test");
  });

  test("getMockUser returns null for unregistered nameId", async () => {
    const store = createDefaultStorage();
    expect(await store.getMockUser("ghost@example")).toBeNull();
  });

  // Scenario: two independent SAML instances must not share state — each
  // createDefaultStorage call returns a fresh isolated map.
  test("storage instances are isolated", async () => {
    const a = createDefaultStorage();
    const b = createDefaultStorage();
    await a.savePendingRequest("req-iso", { relayState: "/a" });
    expect(await b.getPendingRequest("req-iso")).toBeNull();
  });
});
