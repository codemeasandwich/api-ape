/**
 * @fileoverview Tests for OAuth2 adapter helpers.
 *
 * Exercises the helpers that the public OAuth2 adapter doesn't currently
 * invoke through its public surface (token lookup, getMockUser fallback).
 * These remain part of the storage contract for integrators who wire their
 * own IdP backends.
 */

const {
  createDefaultStorage,
  generateState,
  generateCodeVerifier,
  generateCodeChallenge,
} = require("./helpers");

describe("OAuth2 helpers — state and PKCE", () => {
  test("generateState returns 32 hex chars (16 random bytes)", () => {
    const s = generateState();
    expect(s).toMatch(/^[0-9a-f]{32}$/);
    expect(generateState()).not.toBe(s);
  });

  test("generateCodeVerifier returns base64url-safe characters", () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  // Scenario: PKCE challenge derived from verifier per RFC 7636 — SHA-256
  // hash of the verifier, base64url-encoded.
  test("generateCodeChallenge of a known verifier matches SHA-256/base64url", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    // Pre-computed expected challenge for the canonical RFC 7636 verifier
    const expected = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(generateCodeChallenge(verifier)).toBe(expected);
  });
});

describe("OAuth2 helpers — default storage", () => {
  test("saveState + getState round-trips", async () => {
    const store = createDefaultStorage();
    await store.saveState("s-1", { redirectTo: "/dash" });
    const got = await store.getState("s-1");
    expect(got.redirectTo).toBe("/dash");
    expect(typeof got.createdAt).toBe("number");
  });

  test("getState returns null for unknown state", async () => {
    const store = createDefaultStorage();
    expect(await store.getState("never-saved")).toBeNull();
  });

  test("deleteState removes the entry and returns true", async () => {
    const store = createDefaultStorage();
    await store.saveState("s-2", { redirectTo: "/a" });
    expect(await store.deleteState("s-2")).toBe(true);
    expect(await store.getState("s-2")).toBeNull();
  });

  test("deleteState on unknown returns false", async () => {
    const store = createDefaultStorage();
    expect(await store.deleteState("ghost")).toBe(false);
  });

  // Scenario: a successful token grant. The user is mapped to a freshly
  // generated mock access token; subsequent getMockUserByToken returns
  // the user profile.
  test("registerMockUser + createMockToken + getMockUserByToken round-trips", async () => {
    const store = createDefaultStorage();
    await store.registerMockUser("alice", { displayName: "Alice" });
    const tokens = await store.createMockToken("alice");
    expect(tokens.access_token).toMatch(/^mock_token_/);
    expect(tokens.token_type).toBe("Bearer");
    const profile = await store.getMockUserByToken(tokens.access_token);
    expect(profile.displayName).toBe("Alice");
  });

  test("getMockUserByToken returns null for unknown token", async () => {
    const store = createDefaultStorage();
    expect(await store.getMockUserByToken("not-real")).toBeNull();
  });

  test("getMockUser returns the profile for a registered user", async () => {
    const store = createDefaultStorage();
    await store.registerMockUser("bob", { displayName: "Bob" });
    expect((await store.getMockUser("bob")).displayName).toBe("Bob");
  });

  test("getMockUser returns null for an unregistered user", async () => {
    const store = createDefaultStorage();
    expect(await store.getMockUser("ghost")).toBeNull();
  });
});
