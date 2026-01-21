/**
 * @fileoverview Tests for Authorization Middleware
 *
 * Tests the endpoint authorization middleware that checks tier, permissions, and roles.
 */

const { createAuthMiddleware, defaultAuthMiddleware } = require("./authMiddleware");
const { AuthTier } = require("../security/auth");

describe("Authorization Middleware", () => {
  describe("createAuthMiddleware", () => {
    test("creates middleware with default options", () => {
      const authz = createAuthMiddleware();

      expect(authz.check).toBeDefined();
      expect(authz.createFailResponse).toBeDefined();
      expect(authz.setRequirement).toBeDefined();
      expect(authz.removeRequirement).toBeDefined();
      expect(authz.getRequirements).toBeDefined();
      expect(authz.findRequirement).toBeDefined();
      expect(authz.hasPermission).toBeDefined();
      expect(authz.hasRole).toBeDefined();
    });
  });

  describe("check - tier requirements", () => {
    test("allows guest user when tier 0 is required", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "public/status": { tier: 0 },
        },
      });

      const mockSocketAuth = {
        getState: () => ({ tier: 0, principal: null }),
      };

      const result = authz.check(mockSocketAuth, "public/status");
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe(0);
    });

    test("blocks guest user from tier 1 endpoint", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "user/profile": { tier: 1 },
        },
      });

      const mockSocketAuth = {
        getState: () => ({ tier: 0, principal: null }),
      };

      const result = authz.check(mockSocketAuth, "user/profile");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("INSUFFICIENT_TIER");
      expect(result.requiredTier).toBe(1);
      expect(result.currentTier).toBe(0);
    });

    test("allows authenticated user at tier 1 endpoint", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "user/profile": { tier: 1 },
        },
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { userId: "user1", permissions: {}, roles: [] },
        }),
      };

      const result = authz.check(mockSocketAuth, "user/profile");
      expect(result.allowed).toBe(true);
    });

    test("allows elevated user at tier 2 endpoint", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "admin/users": { tier: 2 },
        },
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 2,
          principal: { userId: "admin", permissions: {}, roles: [] },
        }),
      };

      const result = authz.check(mockSocketAuth, "admin/users");
      expect(result.allowed).toBe(true);
    });

    test("uses defaultTier for unlisted endpoints", () => {
      const authz = createAuthMiddleware({
        defaultTier: 1,
      });

      const mockSocketAuth = {
        getState: () => ({ tier: 0, principal: null }),
      };

      const result = authz.check(mockSocketAuth, "unlisted/endpoint");
      expect(result.allowed).toBe(false);
      expect(result.requiredTier).toBe(1);
    });
  });

  describe("check - permission requirements", () => {
    test("allows user with exact permission", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "content/edit": { tier: 1, permissions: ["content:edit"] },
        },
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { permissions: { "content:edit": true }, roles: [] },
        }),
      };

      const result = authz.check(mockSocketAuth, "content/edit");
      expect(result.allowed).toBe(true);
    });

    test("blocks user missing required permission", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "content/edit": { tier: 1, permissions: ["content:edit"] },
        },
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { permissions: { "content:read": true }, roles: [] },
        }),
      };

      const result = authz.check(mockSocketAuth, "content/edit");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("MISSING_PERMISSION");
    });

    test("allows user with any of multiple permissions", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "content/manage": { tier: 1, permissions: ["content:edit", "content:delete"] },
        },
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { permissions: { "content:delete": true }, roles: [] },
        }),
      };

      const result = authz.check(mockSocketAuth, "content/manage");
      expect(result.allowed).toBe(true);
    });

    test("requireAll blocks user with partial permissions", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "data/sensitive": {
            tier: 1,
            permissions: ["data:read", "data:write"],
            requireAll: true,
          },
        },
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { permissions: { "data:read": true }, roles: [] },
        }),
      };

      const result = authz.check(mockSocketAuth, "data/sensitive");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("MISSING_PERMISSION");
    });

    test("requireAll allows user with all permissions", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "data/sensitive": {
            tier: 1,
            permissions: ["data:read", "data:write"],
            requireAll: true,
          },
        },
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: {
            permissions: { "data:read": true, "data:write": true },
            roles: [],
          },
        }),
      };

      const result = authz.check(mockSocketAuth, "data/sensitive");
      expect(result.allowed).toBe(true);
    });
  });

  describe("check - role requirements", () => {
    test("allows user with required role", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "admin/panel": { tier: 1, roles: ["admin"] },
        },
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { permissions: {}, roles: ["admin"] },
        }),
      };

      const result = authz.check(mockSocketAuth, "admin/panel");
      expect(result.allowed).toBe(true);
    });

    test("blocks user missing required role", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "admin/panel": { tier: 1, roles: ["admin"] },
        },
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { permissions: {}, roles: ["user"] },
        }),
      };

      const result = authz.check(mockSocketAuth, "admin/panel");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("MISSING_ROLE");
    });

    test("allows user with any of multiple roles", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "moderator/tools": { tier: 1, roles: ["admin", "moderator"] },
        },
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { permissions: {}, roles: ["moderator"] },
        }),
      };

      const result = authz.check(mockSocketAuth, "moderator/tools");
      expect(result.allowed).toBe(true);
    });

    test("requireAll blocks user with partial roles", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "special/area": {
            tier: 1,
            roles: ["admin", "auditor"],
            requireAll: true,
          },
        },
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { permissions: {}, roles: ["admin"] },
        }),
      };

      const result = authz.check(mockSocketAuth, "special/area");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("MISSING_ROLE");
    });

    test("requireAll allows user with all roles", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "special/area": {
            tier: 1,
            roles: ["admin", "auditor"],
            requireAll: true,
          },
        },
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { permissions: {}, roles: ["admin", "auditor", "user"] },
        }),
      };

      const result = authz.check(mockSocketAuth, "special/area");
      expect(result.allowed).toBe(true);
    });
  });

  describe("findRequirement - wildcard matching", () => {
    test("returns exact match requirement", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "users/list": { tier: 1 },
        },
      });

      const req = authz.findRequirement("users/list");
      expect(req).toEqual({ tier: 1 });
    });

    test("returns wildcard match for nested path", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "admin/*": { tier: 2 },
        },
      });

      const req = authz.findRequirement("admin/users");
      expect(req).toEqual({ tier: 2 });
    });

    test("returns deeper wildcard match", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "api/v1/*": { tier: 1 },
        },
      });

      const req = authz.findRequirement("api/v1/users/profile");
      expect(req).toEqual({ tier: 1 });
    });

    test("returns global wildcard match", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "*": { tier: 1 },
        },
      });

      const req = authz.findRequirement("any/path/here");
      expect(req).toEqual({ tier: 1 });
    });

    test("returns null for unmatched path", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "specific/path": { tier: 1 },
        },
      });

      const req = authz.findRequirement("other/path");
      expect(req).toBeNull();
    });

    test("prefers exact match over wildcard", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "admin/*": { tier: 1 },
          "admin/users": { tier: 2 },
        },
      });

      const req = authz.findRequirement("admin/users");
      expect(req).toEqual({ tier: 2 });
    });
  });

  describe("hasPermission - wildcard permissions", () => {
    test("matches exact permission", () => {
      const authz = createAuthMiddleware();
      const principal = { permissions: { "content:edit": true } };

      expect(authz.hasPermission(principal, "content:edit")).toBe(true);
      expect(authz.hasPermission(principal, "content:delete")).toBe(false);
    });

    test("matches wildcard permission", () => {
      const authz = createAuthMiddleware();
      const principal = { permissions: { "content:*": true } };

      expect(authz.hasPermission(principal, "content:edit")).toBe(true);
      expect(authz.hasPermission(principal, "content:delete")).toBe(true);
    });

    test("matches super-wildcard permission", () => {
      const authz = createAuthMiddleware();
      const principal = { permissions: { "*": true } };

      expect(authz.hasPermission(principal, "anything")).toBe(true);
      expect(authz.hasPermission(principal, "deep:nested:permission")).toBe(true);
    });

    test("returns false for null principal", () => {
      const authz = createAuthMiddleware();

      expect(authz.hasPermission(null, "any")).toBe(false);
    });

    test("returns false for principal without permissions", () => {
      const authz = createAuthMiddleware();
      const principal = { roles: ["admin"] };

      expect(authz.hasPermission(principal, "any")).toBe(false);
    });
  });

  describe("hasRole", () => {
    test("matches exact role", () => {
      const authz = createAuthMiddleware();
      const principal = { roles: ["admin", "user"] };

      expect(authz.hasRole(principal, "admin")).toBe(true);
      expect(authz.hasRole(principal, "moderator")).toBe(false);
    });

    test("matches wildcard role", () => {
      const authz = createAuthMiddleware();
      const principal = { roles: ["*"] };

      expect(authz.hasRole(principal, "anything")).toBe(true);
    });

    test("returns false for null principal", () => {
      const authz = createAuthMiddleware();

      expect(authz.hasRole(null, "any")).toBe(false);
    });

    test("returns false for principal without roles", () => {
      const authz = createAuthMiddleware();
      const principal = { permissions: {} };

      expect(authz.hasRole(principal, "any")).toBe(false);
    });
  });

  describe("requireAuthByDefault", () => {
    test("blocks guest for unlisted endpoints when enabled", () => {
      const authz = createAuthMiddleware({
        requireAuthByDefault: true,
      });

      const mockSocketAuth = {
        getState: () => ({ tier: 0, principal: null }),
      };

      const result = authz.check(mockSocketAuth, "unlisted/endpoint");
      expect(result.allowed).toBe(false);
      expect(result.requiredTier).toBe(AuthTier.BASIC);
    });

    test("allows authenticated user for unlisted endpoints when enabled", () => {
      const authz = createAuthMiddleware({
        requireAuthByDefault: true,
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { userId: "user1" },
        }),
      };

      const result = authz.check(mockSocketAuth, "unlisted/endpoint");
      expect(result.allowed).toBe(true);
    });
  });

  describe("onAuthzFail callback", () => {
    test("calls callback on tier failure", () => {
      const onAuthzFail = jest.fn();
      const authz = createAuthMiddleware({
        requirements: {
          "secret": { tier: 2 },
        },
        onAuthzFail,
      });

      const mockSocketAuth = {
        getState: () => ({ tier: 0, principal: null }),
      };

      authz.check(mockSocketAuth, "secret", { requestId: "123" });

      expect(onAuthzFail).toHaveBeenCalledWith(
        "secret",
        expect.objectContaining({
          allowed: false,
          reason: "INSUFFICIENT_TIER",
        }),
        { requestId: "123" }
      );
    });

    test("calls callback on permission failure", () => {
      const onAuthzFail = jest.fn();
      const authz = createAuthMiddleware({
        requirements: {
          "protected": { tier: 1, permissions: ["special:access"] },
        },
        onAuthzFail,
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { permissions: {}, roles: [] },
        }),
      };

      authz.check(mockSocketAuth, "protected");

      expect(onAuthzFail).toHaveBeenCalledWith(
        "protected",
        expect.objectContaining({
          allowed: false,
          reason: "MISSING_PERMISSION",
        }),
        {}
      );
    });

    test("calls callback on role failure", () => {
      const onAuthzFail = jest.fn();
      const authz = createAuthMiddleware({
        requirements: {
          "admin-only": { tier: 1, roles: ["admin"] },
        },
        onAuthzFail,
      });

      const mockSocketAuth = {
        getState: () => ({
          tier: 1,
          principal: { permissions: {}, roles: ["user"] },
        }),
      };

      authz.check(mockSocketAuth, "admin-only");

      expect(onAuthzFail).toHaveBeenCalledWith(
        "admin-only",
        expect.objectContaining({
          allowed: false,
          reason: "MISSING_ROLE",
        }),
        {}
      );
    });
  });

  describe("dynamic requirement management", () => {
    test("setRequirement adds new requirement", () => {
      const authz = createAuthMiddleware();

      authz.setRequirement("new/endpoint", { tier: 2, permissions: ["admin"] });

      const req = authz.findRequirement("new/endpoint");
      expect(req).toEqual({ tier: 2, permissions: ["admin"] });
    });

    test("removeRequirement removes requirement", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "temp/endpoint": { tier: 1 },
        },
      });

      authz.removeRequirement("temp/endpoint");

      const req = authz.findRequirement("temp/endpoint");
      expect(req).toBeNull();
    });

    test("getRequirements returns all requirements", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "a": { tier: 1 },
          "b": { tier: 2 },
        },
      });

      const reqs = authz.getRequirements();
      expect(reqs).toEqual({
        "a": { tier: 1 },
        "b": { tier: 2 },
      });
    });

    test("getRequirements returns a copy", () => {
      const authz = createAuthMiddleware({
        requirements: {
          "a": { tier: 1 },
        },
      });

      const reqs = authz.getRequirements();
      reqs["b"] = { tier: 2 };

      expect(authz.findRequirement("b")).toBeNull();
    });
  });

  describe("createFailResponse", () => {
    test("formats tier failure response", () => {
      const authz = createAuthMiddleware();

      const response = authz.createFailResponse({
        reason: "INSUFFICIENT_TIER",
        requiredTier: 2,
        currentTier: 0,
      });

      expect(response).toEqual({
        type: "authz_fail",
        reason: "INSUFFICIENT_TIER",
        required: 2,
        currentTier: 0,
      });
    });

    test("formats permission failure response", () => {
      const authz = createAuthMiddleware();

      const response = authz.createFailResponse({
        reason: "MISSING_PERMISSION",
        required: ["admin:write"],
      });

      expect(response).toEqual({
        type: "authz_fail",
        reason: "MISSING_PERMISSION",
        required: ["admin:write"],
        currentTier: undefined,
      });
    });
  });

  describe("defaultAuthMiddleware", () => {
    test("is pre-configured with default settings", () => {
      expect(defaultAuthMiddleware).toBeDefined();
      expect(typeof defaultAuthMiddleware.check).toBe("function");
      expect(typeof defaultAuthMiddleware.findRequirement).toBe("function");
    });

    test("allows all endpoints at tier 0 by default", () => {
      const mockSocketAuth = {
        getState: () => ({ tier: 0, principal: null }),
      };

      const result = defaultAuthMiddleware.check(mockSocketAuth, "any/endpoint");
      expect(result.allowed).toBe(true);
    });
  });
});
