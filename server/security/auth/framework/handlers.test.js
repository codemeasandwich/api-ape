/**
 * @fileoverview Tests for Auth Framework Message Handlers
 *
 * The handlers module produces small adapter wrapper closures used by
 * `socket-auth.js` to bridge inbound auth messages onto the matching
 * adapter method calls and the auth state machine.  These tests drive
 * each handler factory directly with stub adapters and a real state
 * machine, mirroring how `socket-auth.js` wires them together — but
 * focused on the wrapper logic itself.
 */

const {
  createOpaqueHandlers,
  createLDAPHandlers,
  createMFAHandlers,
  createWebAuthnHandlers,
  createTOTPHandlers,
  createKeyRecoveryHandlers,
} = require("./handlers");
const { createAuthStateMachine, AuthState, AuthTier } = require("../state-machine");

function makeCallbacks() {
  return {
    onAuthSuccess: jest.fn(),
    onAuthFailure: jest.fn(),
    onMFASuccess: jest.fn(),
    onKeyRecoverySuccess: jest.fn(),
  };
}

/** Build a state machine pre-driven to the requested tier. */
function machineAt(tier) {
  const sm = createAuthStateMachine();
  if (tier >= AuthTier.BASIC) {
    sm.startAuth("opaque");
    sm.completeAuth({ userId: "u1", roles: ["user"], permissions: {} });
  }
  if (tier >= AuthTier.ELEVATED) {
    sm.startMFA(["webauthn"]);
    sm.completeMFA("webauthn");
  }
  return sm;
}

describe("Auth framework — WebAuthn handler wrappers", () => {
  // Scenario: a freshly-authenticated user (Tier 1) starts WebAuthn passkey
  // registration. The wrapper must delegate to the adapter with the userId
  // pulled from auth state when the client omits userId in the payload.
  test("handleRegStart falls back to state.principal.userId", async () => {
    const adapter = {
      handleRegStart: jest.fn(async () => ({ type: "REG_CHALLENGE", challenge: "c" })),
    };
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createWebAuthnHandlers(adapter, sm, "client-x", makeCallbacks());
    const state = sm.getState();
    const out = await handlers.handleRegStart({}, state);
    expect(adapter.handleRegStart).toHaveBeenCalledWith({
      clientId: "client-x",
      userId: "u1",
      userName: undefined,
      userDisplayName: undefined,
    });
    expect(out.challenge).toBe("c");
  });

  // Scenario: the client provides an explicit userId on the wire (e.g. an
  // admin registering a credential for another user). The wrapper prefers
  // data.userId over state.principal.userId.
  test("handleRegStart prefers explicit data.userId", async () => {
    const adapter = { handleRegStart: jest.fn(async () => ({ ok: true })) };
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createWebAuthnHandlers(adapter, sm, "client-x", makeCallbacks());
    await handlers.handleRegStart(
      { userId: "explicit", userName: "n", userDisplayName: "N" },
      sm.getState(),
    );
    expect(adapter.handleRegStart).toHaveBeenCalledWith({
      clientId: "client-x",
      userId: "explicit",
      userName: "n",
      userDisplayName: "N",
    });
  });

  test("handleRegFinish delegates to adapter", async () => {
    const adapter = { handleRegFinish: jest.fn(async () => ({ ok: true })) };
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createWebAuthnHandlers(adapter, sm, "cid", makeCallbacks());
    await handlers.handleRegFinish(
      { challenge: "ch", attestation: { id: "a" } },
      sm.getState(),
    );
    expect(adapter.handleRegFinish).toHaveBeenCalledWith({
      clientId: "cid",
      userId: "u1",
      challenge: "ch",
      attestation: { id: "a" },
    });
  });

  test("handleAuthStart delegates to adapter", async () => {
    const adapter = { handleAuthStart: jest.fn(async () => ({ allowCredentials: [] })) };
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createWebAuthnHandlers(adapter, sm, "cid", makeCallbacks());
    await handlers.handleAuthStart({}, sm.getState());
    expect(adapter.handleAuthStart).toHaveBeenCalledWith({
      clientId: "cid",
      userId: "u1",
    });
  });

  // Scenario: a Tier 1 user completes a WebAuthn assertion. Because the user
  // is at AUTHENTICATED state with BASIC tier, the wrapper must elevate to
  // ELEVATED via startMFA/completeMFA and report the new tier/state.
  test("handleAuthFinish elevates from Tier 1 to Tier 2 (MFA)", async () => {
    const adapter = {
      handleAuthFinish: jest.fn(async () => ({ type: "AUTH_OK", verified: true })),
    };
    const sm = machineAt(AuthTier.BASIC);
    const callbacks = makeCallbacks();
    const handlers = createWebAuthnHandlers(adapter, sm, "cid", callbacks);
    const result = await handlers.handleAuthFinish(
      { challenge: "ch", assertion: { id: "a" } },
      sm.getState(),
    );
    expect(result.tier).toBe(AuthTier.ELEVATED);
    expect(callbacks.onMFASuccess).toHaveBeenCalledWith(
      "cid",
      expect.any(Object),
      "webauthn",
    );
  });

  // Scenario: a Tier 0 (guest) user calls WebAuthn auth-finish directly
  // without a prior OPAQUE/LDAP step. The wrapper must NOT elevate and
  // must pass through the adapter's raw result without state mutation.
  test("handleAuthFinish passes through when not yet authenticated", async () => {
    const adapter = {
      handleAuthFinish: jest.fn(async () => ({ type: "AUTH_OK", verified: true })),
    };
    const sm = createAuthStateMachine(); // Tier 0 GUEST
    const handlers = createWebAuthnHandlers(adapter, sm, "cid", makeCallbacks());
    const result = await handlers.handleAuthFinish(
      { challenge: "ch", assertion: { id: "a" } },
      sm.getState(),
    );
    expect(result.verified).toBe(true);
    expect(result.tier).toBeUndefined();
  });
});

describe("Auth framework — TOTP handler wrappers", () => {
  test("handleSetupStart delegates to adapter with userId fallback", async () => {
    const adapter = {
      handleSetupStart: jest.fn(async () => ({ secret: "S", otpauthUri: "ot:" })),
    };
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createTOTPHandlers(adapter, sm, "cid", makeCallbacks());
    await handlers.handleSetupStart(
      { accountName: "a@ex" },
      sm.getState(),
    );
    expect(adapter.handleSetupStart).toHaveBeenCalledWith({
      clientId: "cid",
      userId: "u1",
      accountName: "a@ex",
    });
  });

  test("handleSetupVerify delegates to adapter with explicit data.userId", async () => {
    const adapter = {
      handleSetupVerify: jest.fn(async () => ({ type: "SETUP_OK" })),
    };
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createTOTPHandlers(adapter, sm, "cid", makeCallbacks());
    await handlers.handleSetupVerify(
      { userId: "u-other", code: "123456" },
      sm.getState(),
    );
    expect(adapter.handleSetupVerify).toHaveBeenCalledWith({
      clientId: "cid",
      userId: "u-other",
      code: "123456",
    });
  });

  // Scenario: client omits userId and relies on the authenticated principal
  // from the state. The `data.userId || state.principal?.userId` RHS engages.
  test("handleSetupVerify falls back to state.principal.userId", async () => {
    const adapter = {
      handleSetupVerify: jest.fn(async () => ({ type: "SETUP_OK" })),
    };
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createTOTPHandlers(adapter, sm, "cid", makeCallbacks());
    await handlers.handleSetupVerify({ code: "123456" }, sm.getState());
    expect(adapter.handleSetupVerify).toHaveBeenCalledWith({
      clientId: "cid",
      userId: "u1",
      code: "123456",
    });
  });

  // Scenario: an authenticated (Tier 1) user submits a TOTP code. The wrapper
  // must elevate the session and report the new tier and state.
  test("handleVerify elevates from Tier 1 to Tier 2 on TOTP success", async () => {
    const adapter = {
      handleVerify: jest.fn(async () => ({ type: "OK", verified: true })),
    };
    const sm = machineAt(AuthTier.BASIC);
    const callbacks = makeCallbacks();
    const handlers = createTOTPHandlers(adapter, sm, "cid", callbacks);
    const result = await handlers.handleVerify({ code: "123456" }, sm.getState());
    expect(result.tier).toBe(AuthTier.ELEVATED);
    expect(callbacks.onMFASuccess).toHaveBeenCalledWith(
      "cid",
      expect.any(Object),
      "totp",
    );
  });

  // Scenario: a guest (Tier 0) calls TOTP verify directly. The wrapper must
  // NOT attempt MFA elevation (state machine would throw) and must return
  // the raw adapter response.
  test("handleVerify passes through when not authenticated", async () => {
    const adapter = {
      handleVerify: jest.fn(async () => ({ type: "OK", verified: true })),
    };
    const sm = createAuthStateMachine();
    const handlers = createTOTPHandlers(adapter, sm, "cid", makeCallbacks());
    const result = await handlers.handleVerify({ code: "1" }, sm.getState());
    expect(result.verified).toBe(true);
    expect(result.tier).toBeUndefined();
  });

  test("handleDisable delegates to adapter with userId from state", async () => {
    const adapter = {
      handleDisable: jest.fn(async () => ({ type: "DISABLE_OK" })),
    };
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createTOTPHandlers(adapter, sm, "cid", makeCallbacks());
    await handlers.handleDisable({ code: "1" }, sm.getState());
    expect(adapter.handleDisable).toHaveBeenCalledWith({
      clientId: "cid",
      userId: "u1",
      code: "1",
    });
  });
});

describe("Auth framework — Key recovery (2-of-3) handler wrappers", () => {
  // Scenario: an elevated (Tier 2) user starts enrollment for Tier 3 key
  // recovery (factors live on three independent providers; two must be
  // recovered to elevate to HIGH_SECURITY).
  test("handleEnrollmentStart delegates to twoOfThreeAdapter", async () => {
    const adapter = {
      handleEnrollmentStart: jest.fn(async () => ({
        type: "key_recovery_enrollment_challenge",
        shareCount: 3,
      })),
    };
    const sm = machineAt(AuthTier.ELEVATED);
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", makeCallbacks());
    await handlers.handleEnrollmentStart(sm.getState());
    expect(adapter.handleEnrollmentStart).toHaveBeenCalledWith({
      clientId: "cid",
      userId: "u1",
    });
  });

  test("handleEnrollmentFinish delegates with all share fields", async () => {
    const adapter = {
      handleEnrollmentFinish: jest.fn(async () => ({ type: "key_recovery_enrollment_ok" })),
    };
    const sm = machineAt(AuthTier.ELEVATED);
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", makeCallbacks());
    await handlers.handleEnrollmentFinish(
      {
        encShares: ["s1", "s2", "s3"],
        shareIndices: [0, 1, 2],
        proof: "P",
      },
      sm.getState(),
    );
    expect(adapter.handleEnrollmentFinish).toHaveBeenCalledWith({
      clientId: "cid",
      userId: "u1",
      encShares: ["s1", "s2", "s3"],
      shareIndices: [0, 1, 2],
      proof: "P",
    });
  });

  // Scenario: user kicks off recovery using a custom factor mix (omits the
  // default oauth/webauthn/totp set). The wrapper must forward the factor
  // list to the adapter AND seed the state machine's nonce/challenge.
  test("handleRecoveryStart forwards factors and merges challenge from state machine", async () => {
    const adapter = {
      handleRecoveryStart: jest.fn(async () => ({
        type: "key_recovery_start",
        factors: ["oauth", "ldap"],
      })),
    };
    const sm = machineAt(AuthTier.ELEVATED);
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", makeCallbacks());
    const result = await handlers.handleRecoveryStart(
      { factors: ["oauth", "ldap"] },
      sm.getState(),
    );
    expect(adapter.handleRecoveryStart).toHaveBeenCalledWith({
      clientId: "cid",
      userId: "u1",
      factors: ["oauth", "ldap"],
    });
    expect(result.challenge).toBeDefined();
    expect(result.state).toBeDefined();
  });

  // Scenario: client omits factors → defaults to ['oauth', 'webauthn', 'totp'].
  test("handleRecoveryStart defaults factors when not provided", async () => {
    const adapter = {
      handleRecoveryStart: jest.fn(async () => ({ type: "key_recovery_start" })),
    };
    const sm = machineAt(AuthTier.ELEVATED);
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", makeCallbacks());
    await handlers.handleRecoveryStart({}, sm.getState());
    expect(adapter.handleRecoveryStart).toHaveBeenCalledWith({
      clientId: "cid",
      userId: "u1",
      factors: undefined,
    });
  });

  // Scenario: adapter rejects (e.g. share decryption failed). The wrapper
  // must propagate the failure response unchanged WITHOUT advancing the
  // state machine.
  test("handleRecoveryComplete passes through adapter failure", async () => {
    const adapter = {
      handleRecoveryComplete: jest.fn(async () => ({
        type: "key_recovery_fail",
        error: "DECRYPT_FAILED",
      })),
    };
    const sm = machineAt(AuthTier.ELEVATED);
    sm.startKeyRecovery({ factors: ["oauth", "webauthn", "totp"] });
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", makeCallbacks());
    const result = await handlers.handleRecoveryComplete(
      { proof: "bad" },
      sm.getState(),
    );
    expect(result.type).toBe("key_recovery_fail");
  });

  // Scenario: adapter accepts recovery → wrapper completes state machine
  // elevation to HIGH_SECURITY and invokes onKeyRecoverySuccess callback
  // with the used factors.
  test("handleRecoveryComplete elevates and calls onKeyRecoverySuccess", async () => {
    const adapter = {
      handleRecoveryComplete: jest.fn(async () => ({
        type: "key_recovery_ok",
        usedFactors: ["webauthn", "totp"],
      })),
    };
    const sm = machineAt(AuthTier.ELEVATED);
    sm.startKeyRecovery({ factors: ["oauth", "webauthn", "totp"] });
    const callbacks = makeCallbacks();
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", callbacks);
    const result = await handlers.handleRecoveryComplete(
      { proof: "P", usedFactors: ["webauthn", "totp"] },
      sm.getState(),
    );
    expect(result.tier).toBe(AuthTier.HIGH_SECURITY);
    expect(callbacks.onKeyRecoverySuccess).toHaveBeenCalledWith(
      "cid",
      expect.any(Object),
      ["webauthn", "totp"],
    );
  });

  // Scenario: client omits `usedFactors` on completion. The wrapper falls
  // back to the adapter-reported usedFactors via the `|| []` short-circuit
  // chain.
  test("handleRecoveryComplete falls back to adapter usedFactors when client omits", async () => {
    const adapter = {
      handleRecoveryComplete: jest.fn(async () => ({
        type: "key_recovery_ok",
        usedFactors: ["oauth", "totp"],
      })),
    };
    const sm = machineAt(AuthTier.ELEVATED);
    sm.startKeyRecovery({ factors: ["oauth", "webauthn", "totp"] });
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", makeCallbacks());
    const result = await handlers.handleRecoveryComplete(
      { proof: "P" },
      sm.getState(),
    );
    expect(result.tier).toBe(AuthTier.HIGH_SECURITY);
  });

  // Scenario: both client and adapter omit usedFactors. The wrapper's
  // `|| []` final fallback engages; the state machine then rejects because
  // it requires exactly 2 factors — the error must propagate to the caller.
  test("handleRecoveryComplete propagates state-machine throw when no factors supplied", async () => {
    const adapter = {
      handleRecoveryComplete: jest.fn(async () => ({ type: "key_recovery_ok" })),
    };
    const sm = machineAt(AuthTier.ELEVATED);
    sm.startKeyRecovery({ factors: ["oauth", "webauthn", "totp"] });
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", makeCallbacks());
    await expect(
      handlers.handleRecoveryComplete({ proof: "P" }, sm.getState()),
    ).rejects.toThrow(/exactly 2 factors/);
  });

  test("handleRotation delegates to adapter with reason/shareId/encShare", async () => {
    const adapter = {
      handleRotation: jest.fn(async () => ({ type: "key_recovery_rotation_ok" })),
    };
    const sm = machineAt(AuthTier.ELEVATED);
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", makeCallbacks());
    await handlers.handleRotation(
      { shareId: "s1", encShare: "X", reason: "lost-device" },
      sm.getState(),
    );
    expect(adapter.handleRotation).toHaveBeenCalledWith({
      clientId: "cid",
      userId: "u1",
      shareId: "s1",
      encShare: "X",
      reason: "lost-device",
    });
  });

  // Scenario: a user starts recovery and then cancels (closes the modal).
  // The wrapper must drive the state machine cancelKeyRecovery path.
  test("handleCancel returns key_recovery_cancelled when a recovery is pending", () => {
    const adapter = {};
    const sm = machineAt(AuthTier.ELEVATED);
    sm.startKeyRecovery({ factors: ["oauth", "webauthn", "totp"] });
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", makeCallbacks());
    const result = handlers.handleCancel();
    expect(result.type).toBe("key_recovery_cancelled");
  });

  // Scenario: client sends cancel with no pending recovery — the state
  // machine throws; wrapper translates into a key_recovery_cancel_fail.
  test("handleCancel returns key_recovery_cancel_fail when no recovery pending", () => {
    const adapter = {};
    const sm = machineAt(AuthTier.ELEVATED);
    // No startKeyRecovery — cancelKeyRecovery will throw
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", makeCallbacks());
    const result = handlers.handleCancel();
    expect(result.type).toBe("key_recovery_cancel_fail");
    expect(result.error).toBeDefined();
  });

  // Scenario: cancel throws a generic Error without an err.code property
  // (e.g. a defensive guard in a custom state machine). The `err.code ||
  // "CANCEL_FAILED"` short-circuit must engage and return CANCEL_FAILED.
  test("handleCancel falls back to CANCEL_FAILED when err has no .code", () => {
    const mockStateMachine = {
      cancelKeyRecovery: () => { throw new Error("plain error"); },
      getKeyRecoveryStatus: () => null,
    };
    const handlers = createKeyRecoveryHandlers(
      {},
      mockStateMachine,
      "cid",
      makeCallbacks(),
    );
    const result = handlers.handleCancel();
    expect(result.type).toBe("key_recovery_cancel_fail");
    expect(result.error).toBe("CANCEL_FAILED");
    expect(result.message).toBe("plain error");
  });

  // Scenario: client polls status while a recovery is pending. The wrapper
  // surfaces the state machine status with pending=true and current factors.
  test("handleStatus reports pending=true mid-recovery", () => {
    const adapter = {};
    const sm = machineAt(AuthTier.ELEVATED);
    sm.startKeyRecovery({ factors: ["oauth", "webauthn", "totp"] });
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", makeCallbacks());
    const result = handlers.handleStatus();
    expect(result.type).toBe("key_recovery_status");
    expect(result.pending).toBe(true);
  });

  test("handleStatus reports pending=false when none active", () => {
    const adapter = {};
    const sm = machineAt(AuthTier.ELEVATED);
    const handlers = createKeyRecoveryHandlers(adapter, sm, "cid", makeCallbacks());
    const result = handlers.handleStatus();
    expect(result.type).toBe("key_recovery_status");
    expect(result.pending).toBe(false);
  });
});

describe("Auth framework — OPAQUE/LDAP/MFA wrapper edge cases", () => {
  // Scenario: client calls LDAP auth but the framework was started without
  // an LDAP adapter. The wrapper returns LDAP_NOT_CONFIGURED.
  test("LDAP handler returns LDAP_NOT_CONFIGURED when adapter is absent", async () => {
    const handlers = createLDAPHandlers(null, machineAt(AuthTier.GUEST), "cid", makeCallbacks());
    const result = await handlers.handleAuth({ username: "u", password: "p" });
    expect(result.type).toBe("ldap_auth_fail");
    expect(result.error).toBe("LDAP_NOT_CONFIGURED");
  });

  // Scenario: LDAP adapter responds with AUTH_FAIL — the wrapper must call
  // onAuthFailure and return the raw response unchanged.
  test("LDAP handler routes adapter ldap_auth_fail through onAuthFailure", async () => {
    const adapter = {
      handleAuth: jest.fn(async () => ({ type: "ldap_auth_fail", error: "BAD_CREDS", message: "no" })),
    };
    const sm = machineAt(AuthTier.GUEST);
    const callbacks = makeCallbacks();
    const handlers = createLDAPHandlers(adapter, sm, "cid", callbacks);
    const result = await handlers.handleAuth({ username: "u", password: "p" });
    expect(result.type).toBe("ldap_auth_fail");
    expect(callbacks.onAuthFailure).toHaveBeenCalled();
  });

  // Scenario: onAuthFailure callback itself throws. The wrapper has a
  // try/catch swallow guard — execution must continue and return the
  // adapter's failure response cleanly.
  test("LDAP handler swallows onAuthFailure thrown errors", async () => {
    const adapter = {
      handleAuth: jest.fn(async () => ({ type: "ldap_auth_fail", error: "BAD_CREDS", message: "no" })),
    };
    const sm = machineAt(AuthTier.GUEST);
    const handlers = createLDAPHandlers(adapter, sm, "cid", {
      onAuthSuccess: jest.fn(),
      onAuthFailure: jest.fn(() => { throw new Error("callback bad"); }),
    });
    const result = await handlers.handleAuth({ username: "u", password: "p" });
    expect(result.type).toBe("ldap_auth_fail");
  });

  // Scenario: LDAP succeeds — wrapper drives stateMachine.completeAuth and
  // emits AUTH_OK with tier/state.
  test("LDAP handler completes auth on adapter ldap_auth_ok", async () => {
    const adapter = {
      handleAuth: jest.fn(async () => ({
        type: "ldap_auth_ok",
        userId: "joe",
        profile: { displayName: "Joe", email: "joe@ex.com" },
        groups: ["staff"],
      })),
    };
    const sm = createAuthStateMachine();
    const callbacks = makeCallbacks();
    const handlers = createLDAPHandlers(adapter, sm, "cid", callbacks);
    const result = await handlers.handleAuth({ username: "joe", password: "p" });
    expect(result.type).toBe("ldap_auth_ok");
    expect(result.tier).toBe(AuthTier.BASIC);
    expect(callbacks.onAuthSuccess).toHaveBeenCalled();
  });

  // Scenario: LDAP succeeds but the profile lacks a groups array — the
  // `response.groups || []` fallback engages.
  test("LDAP handler falls back to [] when adapter omits groups", async () => {
    const adapter = {
      handleAuth: jest.fn(async () => ({
        type: "ldap_auth_ok",
        userId: "u",
        profile: { displayName: "U" },
      })),
    };
    const sm = createAuthStateMachine();
    const handlers = createLDAPHandlers(adapter, sm, "cid", makeCallbacks());
    const result = await handlers.handleAuth({ username: "u", password: "p" });
    expect(result.type).toBe("ldap_auth_ok");
  });

  // Scenario: MFA challenge dispatcher with both WebAuthn and TOTP enabled
  // and TOTP enrolled for the user. Both methods must appear in the offered
  // list and the state machine must transition to MFA_PENDING.
  test("MFA handler offers webauthn+totp when both available", async () => {
    const webauthnAdapter = {
      handleAuthStart: jest.fn(async () => ({ allowCredentials: [] })),
    };
    const totpAdapter = { isEnabled: jest.fn(async () => true) };
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createMFAHandlers(
      { webauthnAdapter, totpAdapter },
      sm,
      "cid",
      ["webauthn", "totp"],
      makeCallbacks(),
    );
    const result = await handlers.handleChallenge(sm.getState());
    expect(result.type).toBe("mfa_challenge");
    expect(result.methods.map((m) => m.method).sort()).toEqual(["totp", "webauthn"]);
  });

  // Scenario: WebAuthn challenge generation throws (no credentials enrolled).
  // The wrapper must swallow the error and continue with the remaining
  // methods.
  test("MFA handler skips webauthn when handleAuthStart throws", async () => {
    const webauthnAdapter = {
      handleAuthStart: jest.fn(async () => {
        throw new Error("no creds");
      }),
    };
    const totpAdapter = { isEnabled: jest.fn(async () => true) };
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createMFAHandlers(
      { webauthnAdapter, totpAdapter },
      sm,
      "cid",
      ["webauthn", "totp"],
      makeCallbacks(),
    );
    const result = await handlers.handleChallenge(sm.getState());
    expect(result.methods.map((m) => m.method)).toEqual(["totp"]);
  });

  // Scenario: TOTP not enrolled — the wrapper offers only webauthn.
  test("MFA handler skips totp when isEnabled returns false", async () => {
    const webauthnAdapter = {
      handleAuthStart: jest.fn(async () => ({ allowCredentials: [] })),
    };
    const totpAdapter = { isEnabled: jest.fn(async () => false) };
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createMFAHandlers(
      { webauthnAdapter, totpAdapter },
      sm,
      "cid",
      ["webauthn", "totp"],
      makeCallbacks(),
    );
    const result = await handlers.handleChallenge(sm.getState());
    expect(result.methods.map((m) => m.method)).toEqual(["webauthn"]);
  });

  // Scenario: neither method is enabled for the user. Wrapper returns
  // mfa_challenge_fail without transitioning the state machine.
  test("MFA handler returns NO_MFA_METHODS when nothing is enrolled", async () => {
    const webauthnAdapter = {
      handleAuthStart: jest.fn(async () => { throw new Error("no creds"); }),
    };
    const totpAdapter = { isEnabled: jest.fn(async () => false) };
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createMFAHandlers(
      { webauthnAdapter, totpAdapter },
      sm,
      "cid",
      ["webauthn", "totp"],
      makeCallbacks(),
    );
    const result = await handlers.handleChallenge(sm.getState());
    expect(result.type).toBe("mfa_challenge_fail");
    expect(result.error).toBe("NO_MFA_METHODS");
  });

  // Scenario: MFA verify with method=webauthn → delegates to webauthn
  // adapter and elevates.
  test("MFA handler verifies webauthn and elevates", async () => {
    const webauthnAdapter = {
      handleAuthStart: jest.fn(async () => ({ allowCredentials: [] })),
      handleAuthFinish: jest.fn(async () => ({ verified: true })),
    };
    const totpAdapter = { isEnabled: jest.fn(async () => false) };
    const sm = machineAt(AuthTier.BASIC);
    const callbacks = makeCallbacks();
    const handlers = createMFAHandlers(
      { webauthnAdapter, totpAdapter },
      sm,
      "cid",
      ["webauthn"],
      callbacks,
    );
    await handlers.handleChallenge(sm.getState());
    const result = await handlers.handleVerify(
      { method: "webauthn", challenge: "ch", assertion: { id: "a" } },
      sm.getState(),
    );
    expect(result.type).toBe("mfa_elevated");
    expect(callbacks.onMFASuccess).toHaveBeenCalled();
  });

  test("MFA handler verifies totp and elevates", async () => {
    const webauthnAdapter = {};
    const totpAdapter = {
      isEnabled: jest.fn(async () => true),
      handleVerify: jest.fn(async () => ({ verified: true })),
    };
    const sm = machineAt(AuthTier.BASIC);
    const callbacks = makeCallbacks();
    const handlers = createMFAHandlers(
      { webauthnAdapter, totpAdapter },
      sm,
      "cid",
      ["totp"],
      callbacks,
    );
    await handlers.handleChallenge(sm.getState());
    const result = await handlers.handleVerify(
      { method: "totp", code: "123456" },
      sm.getState(),
    );
    expect(result.type).toBe("mfa_elevated");
    expect(callbacks.onMFASuccess).toHaveBeenCalledWith("cid", expect.any(Object), "totp");
  });

  // Scenario: client passes an unknown MFA method. Wrapper returns
  // UNKNOWN_MFA_METHOD with the offending name echoed in the message.
  test("MFA handler rejects unknown method", async () => {
    const sm = machineAt(AuthTier.BASIC);
    const handlers = createMFAHandlers(
      { webauthnAdapter: {}, totpAdapter: {} },
      sm,
      "cid",
      [],
      makeCallbacks(),
    );
    const result = await handlers.handleVerify(
      { method: "sms" },
      sm.getState(),
    );
    expect(result.type).toBe("mfa_verify_fail");
    expect(result.error).toBe("UNKNOWN_MFA_METHOD");
    expect(result.message).toContain("sms");
  });

  // Scenario: OPAQUE register-start and auth-start delegate to the adapter
  // and (for auth-start) drive stateMachine.startAuth.
  test("OPAQUE wrappers delegate to adapter", async () => {
    const adapter = {
      handleRegStart: jest.fn(async () => ({ type: "REG_RESPONSE" })),
      handleRegFinish: jest.fn(async () => ({ type: "REG_OK" })),
      handleAuthStart: jest.fn(async () => ({ type: "AUTH_1" })),
      handleAuthFinish: jest.fn(async () => ({
        type: "AUTH_OK",
        assignedPrincipal: { userId: "p1", roles: ["user"], permissions: {} },
      })),
    };
    const sm = createAuthStateMachine();
    const callbacks = makeCallbacks();
    const handlers = createOpaqueHandlers(adapter, sm, "cid", callbacks);
    await handlers.handleRegStart({ user: "u", clientNonce: "n", regRequest: "r" });
    await handlers.handleRegFinish({ user: "u", clientNonce: "n", regRecord: "rec" });
    await handlers.handleAuthStart({ user: "u", clientNonce: "n" });
    const r = await handlers.handleAuth2({ user: "u", clientNonce: "n", clientAuth: "ca" });
    expect(r.type).toBe("AUTH_OK");
    expect(r.tier).toBe(AuthTier.BASIC);
    expect(callbacks.onAuthSuccess).toHaveBeenCalled();
  });
});
