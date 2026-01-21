/**
 * @fileoverview Tests for Auth Message Handlers
 *
 * Tests the auth message routing and description utilities.
 */

const {
  createAuthMessageHandler,
  getMessageDescription,
  AUTH_MESSAGE_DESCRIPTIONS,
} = require("./auth-messages");

const {
  isAuthMessage,
  OpaqueMessageType,
  WebAuthnMessageType,
  TOTPMessageType,
} = require("../index");

describe("Auth Message Handlers", () => {
  describe("createAuthMessageHandler", () => {
    test("returns false for non-auth messages", async () => {
      const mockSocketAuth = {
        handleMessage: jest.fn(),
      };
      const mockSend = jest.fn();

      const handler = createAuthMessageHandler(mockSocketAuth, mockSend);

      // Regular RPC call, not an auth message
      const handled = await handler("query-123", "users/list", { page: 1 });

      expect(handled).toBe(false);
      expect(mockSocketAuth.handleMessage).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    test("handles auth message and sends response", async () => {
      const mockResponse = {
        type: OpaqueMessageType.REG_RESPONSE,
        serverNonce: "nonce123",
      };

      const mockSocketAuth = {
        handleMessage: jest.fn().mockResolvedValue(mockResponse),
      };
      const mockSend = jest.fn();

      const handler = createAuthMessageHandler(mockSocketAuth, mockSend);

      const handled = await handler(
        "query-456",
        OpaqueMessageType.REG_START,
        { user: "testuser", clientNonce: "cnonce", regRequest: "req" }
      );

      expect(handled).toBe(true);
      expect(mockSocketAuth.handleMessage).toHaveBeenCalledWith(
        OpaqueMessageType.REG_START,
        { user: "testuser", clientNonce: "cnonce", regRequest: "req" }
      );
      expect(mockSend).toHaveBeenCalledWith(
        "query-456",
        OpaqueMessageType.REG_RESPONSE,
        mockResponse,
        null
      );
    });

    test("sends error response on auth failure", async () => {
      const authError = new Error("Authentication failed");
      authError.code = "AUTH_FAILED";

      const mockSocketAuth = {
        handleMessage: jest.fn().mockRejectedValue(authError),
      };
      const mockSend = jest.fn();

      const handler = createAuthMessageHandler(mockSocketAuth, mockSend);

      const handled = await handler(
        "query-789",
        OpaqueMessageType.AUTH_START,
        { user: "baduser" }
      );

      expect(handled).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        "query-789",
        `${OpaqueMessageType.AUTH_START}_error`,
        expect.objectContaining({
          type: `${OpaqueMessageType.AUTH_START}_error`,
          error: "AUTH_FAILED",
          message: "Authentication failed",
        }),
        authError
      );
    });

    test("uses AUTH_ERROR as default error code", async () => {
      const authError = new Error("Something went wrong");
      // No error code set

      const mockSocketAuth = {
        handleMessage: jest.fn().mockRejectedValue(authError),
      };
      const mockSend = jest.fn();

      const handler = createAuthMessageHandler(mockSocketAuth, mockSend);

      await handler("query-abc", OpaqueMessageType.REG_START, {});

      expect(mockSend).toHaveBeenCalledWith(
        "query-abc",
        `${OpaqueMessageType.REG_START}_error`,
        expect.objectContaining({
          error: "AUTH_ERROR",
        }),
        authError
      );
    });

    test("handles send failure gracefully on success path", async () => {
      const mockResponse = {
        type: OpaqueMessageType.AUTH_OK,
      };

      const mockSocketAuth = {
        handleMessage: jest.fn().mockResolvedValue(mockResponse),
      };
      const mockSend = jest.fn().mockImplementation(() => {
        throw new Error("Socket closed");
      });

      const handler = createAuthMessageHandler(mockSocketAuth, mockSend);

      // Should not throw even if send fails
      const handled = await handler(
        "query-def",
        OpaqueMessageType.AUTH_2,
        { clientAuth: "proof" }
      );

      // Message was still "handled" even though send failed
      expect(handled).toBe(true);
    });

    test("handles send failure gracefully on error path", async () => {
      const authError = new Error("Auth failed");

      const mockSocketAuth = {
        handleMessage: jest.fn().mockRejectedValue(authError),
      };
      const mockSend = jest.fn().mockImplementation(() => {
        throw new Error("Socket closed");
      });

      const handler = createAuthMessageHandler(mockSocketAuth, mockSend);

      // Should not throw even if send fails
      const handled = await handler(
        "query-ghi",
        OpaqueMessageType.AUTH_START,
        {}
      );

      expect(handled).toBe(true);
    });
  });

  describe("getMessageDescription", () => {
    test("returns description for OPAQUE messages", () => {
      expect(getMessageDescription(OpaqueMessageType.REG_START))
        .toBe("OPAQUE registration start");
      expect(getMessageDescription(OpaqueMessageType.AUTH_START))
        .toBe("OPAQUE authentication start");
      expect(getMessageDescription(OpaqueMessageType.AUTH_OK))
        .toBe("OPAQUE authentication success");
    });

    test("returns description for WebAuthn messages", () => {
      expect(getMessageDescription(WebAuthnMessageType.REG_START))
        .toBe("WebAuthn registration start");
      expect(getMessageDescription(WebAuthnMessageType.AUTH_OK))
        .toBe("WebAuthn authentication success");
    });

    test("returns description for TOTP messages", () => {
      expect(getMessageDescription(TOTPMessageType.SETUP_START))
        .toBe("TOTP setup start");
      expect(getMessageDescription(TOTPMessageType.VERIFY))
        .toBe("TOTP verification");
      expect(getMessageDescription(TOTPMessageType.OK))
        .toBe("TOTP verification success");
    });

    test("returns description for MFA messages", () => {
      expect(getMessageDescription("mfa_challenge"))
        .toBe("MFA challenge issued");
      expect(getMessageDescription("mfa_elevated"))
        .toBe("MFA elevation complete");
    });

    test("returns description for key recovery messages", () => {
      expect(getMessageDescription("key_recovery_start"))
        .toBe("Key recovery initiated");
      expect(getMessageDescription("key_recovery_ok"))
        .toBe("Key recovery success");
    });

    test("returns fallback for unknown message types", () => {
      expect(getMessageDescription("unknown_type"))
        .toBe("Auth message: unknown_type");
      expect(getMessageDescription("custom_auth_msg"))
        .toBe("Auth message: custom_auth_msg");
    });
  });

  describe("AUTH_MESSAGE_DESCRIPTIONS", () => {
    test("is exported as an object", () => {
      expect(typeof AUTH_MESSAGE_DESCRIPTIONS).toBe("object");
    });

    test("contains all OPAQUE message types", () => {
      expect(AUTH_MESSAGE_DESCRIPTIONS[OpaqueMessageType.REG_START]).toBeDefined();
      expect(AUTH_MESSAGE_DESCRIPTIONS[OpaqueMessageType.AUTH_OK]).toBeDefined();
    });

    test("contains all WebAuthn message types", () => {
      expect(AUTH_MESSAGE_DESCRIPTIONS[WebAuthnMessageType.REG_START]).toBeDefined();
      expect(AUTH_MESSAGE_DESCRIPTIONS[WebAuthnMessageType.AUTH_FINISH]).toBeDefined();
    });

    test("contains all TOTP message types", () => {
      expect(AUTH_MESSAGE_DESCRIPTIONS[TOTPMessageType.SETUP_START]).toBeDefined();
      expect(AUTH_MESSAGE_DESCRIPTIONS[TOTPMessageType.DISABLE_OK]).toBeDefined();
    });
  });
});
