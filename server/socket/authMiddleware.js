/**
 * @fileoverview Authorization Middleware for api-ape Server
 *
 * Provides authorization checks for incoming messages based on
 * authentication tier and permissions.
 *
 * ## Usage
 *
 * The middleware can be configured with endpoint-specific requirements:
 *
 * ```javascript
 * const authz = createAuthMiddleware({
 *   requirements: {
 *     'admin/users': { tier: 2, permissions: ['admin:users'] },
 *     'chat/send': { tier: 1, permissions: ['chat:send'] },
 *     'public/status': { tier: 0 } // guest allowed
 *   },
 *   defaultTier: 0 // default for unlisted endpoints
 * });
 * ```
 *
 * @module server/socket/authMiddleware
 * @see {@link module:server/security/auth} for authentication framework
 */

const { AuthTier } = require("../security/auth");

/**
 * Authorization error response
 * @typedef {Object} AuthzError
 * @property {string} type - Always "authz_fail"
 * @property {string} reason - Error reason code
 * @property {string} [required] - What was required
 * @property {number} [requiredTier] - Required tier
 * @property {number} [currentTier] - Current tier
 */

/**
 * Endpoint authorization requirement
 * @typedef {Object} EndpointRequirement
 * @property {number} [tier=0] - Minimum required tier
 * @property {string[]} [permissions=[]] - Required permissions (any)
 * @property {string[]} [roles=[]] - Required roles (any)
 * @property {boolean} [requireAll=false] - Require all permissions/roles (not just any)
 */

/**
 * Authorization middleware configuration
 * @typedef {Object} AuthMiddlewareConfig
 * @property {Object<string, EndpointRequirement>} [requirements={}] - Per-endpoint requirements
 * @property {number} [defaultTier=0] - Default tier for unlisted endpoints
 * @property {boolean} [requireAuthByDefault=false] - Require auth for unlisted endpoints
 * @property {Function} [onAuthzFail] - Callback on authorization failure
 */

/**
 * Create authorization middleware
 *
 * @param {AuthMiddlewareConfig} [config={}] - Configuration options
 * @returns {Object} Authorization middleware
 *
 * @example
 * const authz = createAuthMiddleware({
 *   requirements: {
 *     'admin/*': { tier: 2 },
 *     'user/profile': { tier: 1 },
 *     'public/*': { tier: 0 }
 *   },
 *   defaultTier: 1
 * });
 *
 * // Check authorization:
 * const result = authz.check(socketAuth, 'admin/users');
 * if (!result.allowed) {
 *   send(queryId, 'authz_fail', result, null);
 *   return;
 * }
 */
function createAuthMiddleware(config = {}) {
  const {
    requirements = {},
    defaultTier = 0,
    requireAuthByDefault = false,
    onAuthzFail = () => {},
  } = config;

  /**
   * Find requirement for an endpoint, supporting wildcards
   *
   * @param {string} endpoint - Endpoint path
   * @returns {EndpointRequirement|null} Requirement or null
   */
  function findRequirement(endpoint) {
    if (requirements[endpoint]) {
      return requirements[endpoint];
    }

    const parts = endpoint.split("/");
    for (let i = parts.length - 1; i >= 0; i--) {
      const wildcardPath = parts.slice(0, i).join("/") + "/*";
      if (requirements[wildcardPath]) {
        return requirements[wildcardPath];
      }
    }

    if (requirements["*"]) {
      return requirements["*"];
    }

    return null;
  }

  /**
   * Check if principal has required permission
   *
   * @param {Object} principal - Authenticated principal
   * @param {string} permission - Required permission
   * @returns {boolean} Whether principal has permission
   */
  function hasPermission(principal, permission) {
    if (!principal || !principal.permissions) return false;

    if (principal.permissions[permission] === true) {
      return true;
    }

    const parts = permission.split(":");
    for (let i = parts.length - 1; i > 0; i--) {
      const wildcardPerm = parts.slice(0, i).join(":") + ":*";
      if (principal.permissions[wildcardPerm] === true) {
        return true;
      }
    }

    if (principal.permissions["*"] === true) {
      return true;
    }

    return false;
  }

  /**
   * Check if principal has required role
   *
   * @param {Object} principal - Authenticated principal
   * @param {string} role - Required role
   * @returns {boolean} Whether principal has role
   */
  function hasRole(principal, role) {
    if (!principal || !principal.roles) return false;
    return principal.roles.includes(role) || principal.roles.includes("*");
  }

  /**
   * Check authorization for an endpoint
   *
   * @param {Object} socketAuth - Socket auth manager
   * @param {string} endpoint - Endpoint being accessed
   * @param {Object} [context={}] - Additional context
   * @returns {Object} Authorization result { allowed, reason, ... }
   */
  function check(socketAuth, endpoint, context = {}) {
    const state = socketAuth.getState();
    const requirement = findRequirement(endpoint);

    let requiredTier = defaultTier;
    let requiredPermissions = [];
    let requiredRoles = [];
    let requireAll = false;

    if (requirement) {
      requiredTier = requirement.tier ?? defaultTier;
      requiredPermissions = requirement.permissions || [];
      requiredRoles = requirement.roles || [];
      requireAll = requirement.requireAll || false;
    } else if (requireAuthByDefault) {
      requiredTier = AuthTier.BASIC;
    }

    if (state.tier < requiredTier) {
      const result = {
        allowed: false,
        reason: "INSUFFICIENT_TIER",
        requiredTier,
        currentTier: state.tier,
        endpoint,
      };
      onAuthzFail(endpoint, result, context);
      return result;
    }

    if (requiredPermissions.length > 0) {
      const hasRequired = requireAll
        ? requiredPermissions.every((p) => hasPermission(state.principal, p))
        : requiredPermissions.some((p) => hasPermission(state.principal, p));

      if (!hasRequired) {
        const result = {
          allowed: false,
          reason: "MISSING_PERMISSION",
          required: requiredPermissions,
          endpoint,
        };
        onAuthzFail(endpoint, result, context);
        return result;
      }
    }

    if (requiredRoles.length > 0) {
      const hasRequired = requireAll
        ? requiredRoles.every((r) => hasRole(state.principal, r))
        : requiredRoles.some((r) => hasRole(state.principal, r));

      if (!hasRequired) {
        const result = {
          allowed: false,
          reason: "MISSING_ROLE",
          required: requiredRoles,
          endpoint,
        };
        onAuthzFail(endpoint, result, context);
        return result;
      }
    }

    return {
      allowed: true,
      tier: state.tier,
      principal: state.principal,
      endpoint,
    };
  }

  /**
   * Create an authz_fail response
   *
   * @param {Object} checkResult - Result from check()
   * @returns {Object} Response suitable for sending to client
   */
  function createFailResponse(checkResult) {
    return {
      type: "authz_fail",
      reason: checkResult.reason,
      required: checkResult.required || checkResult.requiredTier,
      currentTier: checkResult.currentTier,
    };
  }

  /**
   * Set requirement for an endpoint
   *
   * @param {string} endpoint - Endpoint path
   * @param {EndpointRequirement} requirement - Requirement config
   */
  function setRequirement(endpoint, requirement) {
    requirements[endpoint] = requirement;
  }

  /**
   * Remove requirement for an endpoint
   *
   * @param {string} endpoint - Endpoint path
   */
  function removeRequirement(endpoint) {
    delete requirements[endpoint];
  }

  /**
   * Get all configured requirements
   * @returns {Object<string, EndpointRequirement>} Requirements map
   */
  function getRequirements() {
    return { ...requirements };
  }

  return {
    check,
    createFailResponse,
    setRequirement,
    removeRequirement,
    getRequirements,
    findRequirement,
    hasPermission,
    hasRole,
  };
}

/**
 * Default authorization middleware instance
 *
 * Created with default settings (tier 0 required for all endpoints).
 * Can be replaced or configured in the main server setup.
 */
const defaultAuthMiddleware = createAuthMiddleware();

module.exports = {
  createAuthMiddleware,
  defaultAuthMiddleware,
};
