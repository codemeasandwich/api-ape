/**
 * @fileoverview OPAQUE Protocol Handlers for api-ape Server
 *
 * Contains the message handlers for OPAQUE registration and authentication flows.
 * These handlers are used internally by the OPAQUE adapter.
 *
 * @module server/security/auth/adapters/opaque-handlers
 * @see {@link module:server/security/auth/adapters/opaque} for the main adapter
 */

/**
 * Create OPAQUE message handlers
 *
 * @param {Object} deps - Handler dependencies
 * @param {Function} deps.getUser - User lookup function
 * @param {Function} deps.saveUser - User save function
 * @param {Object|null} deps.opaqueLib - OPAQUE library instance
 * @param {string} deps.serverId - Server identifier
 * @param {Map} deps.pendingSessions - Pending sessions map
 * @param {Function} deps.sessionKey - Session key generator
 * @param {Function} deps.generateNonce - Nonce generator
 * @param {Function} deps.createCanonicalBinding - Binding string creator
 * @param {number} deps.nonceExpiry - Nonce expiry time in ms
 * @param {Object} deps.OpaqueMessageType - Message type enum
 * @param {Object} deps.OpaqueError - Error code enum
 * @returns {Object} Handler functions
 */
function createOpaqueHandlers(deps) {
  const {
    getUser,
    saveUser,
    opaqueLib,
    serverId,
    pendingSessions,
    sessionKey,
    generateNonce,
    createCanonicalBinding,
    nonceExpiry,
    OpaqueMessageType,
    OpaqueError,
  } = deps;

  /**
   * Handle registration start
   *
   * @param {Object} params - Registration parameters
   * @param {string} params.clientId - Client identifier
   * @param {string} params.user - Username
   * @param {string} params.clientNonce - Client nonce
   * @param {string} params.regRequest - OPAQUE registration request blob
   * @returns {Promise<Object>} Registration response
   */
  async function handleRegStart({ clientId, user, clientNonce, regRequest }) {
    if (!user || typeof user !== "string") {
      const err = new Error("Invalid username");
      err.code = OpaqueError.INVALID_MESSAGE;
      throw err;
    }

    const existingUser = await getUser(user);
    if (existingUser) {
      const err = new Error("User already exists");
      err.code = OpaqueError.USER_EXISTS;
      throw err;
    }

    const { nonce: serverNonce, expiresAt } = generateNonce();
    const ts = Date.now();

    const key = sessionKey(clientId, user);
    pendingSessions.set(key, {
      type: "registration",
      user,
      clientNonce,
      serverNonce,
      ts,
      expiresAt,
      regRequest,
    });

    setTimeout(() => {
      pendingSessions.delete(key);
    }, nonceExpiry + 1000);

    let regResponse = null;
    if (opaqueLib && opaqueLib.serverRegistrationStart) {
      const context = createCanonicalBinding({ clientId, clientNonce, serverNonce, user, ts });
      regResponse = await opaqueLib.serverRegistrationStart(
        Buffer.from(regRequest, "base64"),
        serverId,
        context
      );
      regResponse = regResponse.toString("base64");
    }

    return {
      type: OpaqueMessageType.REG_RESPONSE,
      serverNonce,
      ts,
      regResponse,
    };
  }

  /**
   * Handle registration finish
   *
   * @param {Object} params - Finish parameters
   * @param {string} params.clientId - Client identifier
   * @param {string} params.user - Username
   * @param {string} params.clientNonce - Client nonce (must match)
   * @param {string} params.regRecord - OPAQUE registration record
   * @returns {Promise<Object>} Registration completion response
   */
  async function handleRegFinish({ clientId, user, clientNonce, regRecord }) {
    const key = sessionKey(clientId, user);
    const session = pendingSessions.get(key);

    if (!session || session.type !== "registration") {
      const err = new Error("No pending registration");
      err.code = OpaqueError.INVALID_STATE;
      throw err;
    }

    if (Date.now() > session.expiresAt) {
      pendingSessions.delete(key);
      const err = new Error("Registration session expired");
      err.code = OpaqueError.NONCE_EXPIRED;
      throw err;
    }

    if (session.clientNonce !== clientNonce) {
      const err = new Error("Client nonce mismatch");
      err.code = OpaqueError.NONCE_MISMATCH;
      throw err;
    }

    pendingSessions.delete(key);

    const userData = {
      username: user,
      opaqueRecord: regRecord,
      createdAt: Date.now(),
      roles: ["user"],
      permissions: {},
    };

    await saveUser(user, userData);

    return {
      type: OpaqueMessageType.REG_OK,
      msg: "registered",
    };
  }

  /**
   * Handle authentication start
   *
   * @param {Object} params - Auth start parameters
   * @param {string} params.clientId - Client identifier
   * @param {string} params.user - Username
   * @param {string} params.clientNonce - Client nonce
   * @returns {Promise<Object>} Auth challenge response
   */
  async function handleAuthStart({ clientId, user, clientNonce }) {
    if (!user || typeof user !== "string") {
      const err = new Error("Invalid username");
      err.code = OpaqueError.INVALID_MESSAGE;
      throw err;
    }

    const userData = await getUser(user);
    if (!userData) {
      const err = new Error("User not found");
      err.code = OpaqueError.USER_NOT_FOUND;
      throw err;
    }

    const { nonce: serverNonce, expiresAt } = generateNonce();
    const ts = Date.now();

    const key = sessionKey(clientId, user);
    pendingSessions.set(key, {
      type: "authentication",
      user,
      clientNonce,
      serverNonce,
      ts,
      expiresAt,
      userData,
    });

    setTimeout(() => {
      pendingSessions.delete(key);
    }, nonceExpiry + 1000);

    let oprfResponse = null;
    if (opaqueLib && opaqueLib.serverAuthStart) {
      const context = createCanonicalBinding({ clientId, clientNonce, serverNonce, user, ts });
      oprfResponse = await opaqueLib.serverAuthStart(
        Buffer.from(userData.opaqueRecord, "base64"),
        serverId,
        context
      );
      oprfResponse = oprfResponse.toString("base64");
    }

    return {
      type: OpaqueMessageType.AUTH_1,
      serverNonce,
      ts,
      envelope: userData.opaqueRecord,
      oprfResponse,
    };
  }

  /**
   * Handle authentication finish
   *
   * @param {Object} params - Auth finish parameters
   * @param {string} params.clientId - Client identifier
   * @param {string} params.user - Username
   * @param {string} params.clientNonce - Client nonce (must match)
   * @param {string} params.clientAuth - OPAQUE client auth proof
   * @returns {Promise<Object>} Auth success response with principal
   */
  async function handleAuthFinish({ clientId, user, clientNonce, clientAuth }) {
    const crypto = require("crypto");
    const key = sessionKey(clientId, user);
    const session = pendingSessions.get(key);

    if (!session || session.type !== "authentication") {
      const err = new Error("No pending authentication");
      err.code = OpaqueError.INVALID_STATE;
      throw err;
    }

    if (Date.now() > session.expiresAt) {
      pendingSessions.delete(key);
      const err = new Error("Authentication session expired");
      err.code = OpaqueError.NONCE_EXPIRED;
      throw err;
    }

    if (session.clientNonce !== clientNonce) {
      const err = new Error("Client nonce mismatch");
      err.code = OpaqueError.NONCE_MISMATCH;
      throw err;
    }

    let serverProof = null;
    let derivedSessionKey = null;

    if (opaqueLib && opaqueLib.serverAuthFinish) {
      const context = createCanonicalBinding({
        clientId,
        clientNonce,
        serverNonce: session.serverNonce,
        user,
        ts: session.ts,
      });

      try {
        const result = await opaqueLib.serverAuthFinish(
          Buffer.from(clientAuth, "base64"),
          Buffer.from(session.userData.opaqueRecord, "base64"),
          serverId,
          context
        );
        serverProof = result.serverProof?.toString("base64");
        derivedSessionKey = result.sessionKey;
      } catch (libErr) {
        pendingSessions.delete(key);
        const err = new Error("Invalid authentication proof");
        err.code = OpaqueError.INVALID_PROOF;
        throw err;
      }
    } else {
      serverProof = crypto.randomBytes(32).toString("base64url");
    }

    pendingSessions.delete(key);

    const { userData } = session;
    const issuedAt = Date.now();
    const expiresAt = issuedAt + 3600000;

    return {
      type: OpaqueMessageType.AUTH_OK,
      assignedPrincipal: {
        userId: userData.username,
        roles: userData.roles || ["user"],
        permissions: userData.permissions || {},
      },
      serverProof,
      authMeta: {
        issuedAt,
        expiresAt,
      },
      tier: 1,
      _sessionKey: derivedSessionKey,
    };
  }

  return {
    handleRegStart,
    handleRegFinish,
    handleAuthStart,
    handleAuthFinish,
  };
}

module.exports = {
  createOpaqueHandlers,
};
