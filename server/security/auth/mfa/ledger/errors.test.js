/**
 * @fileoverview Coverage tests for ledger/errors factories.
 *
 * The factories all share the same shape: build a `new Error(message)` with
 * the appropriate `code` set from `LedgerError`. These tests exercise every
 * factory and both branches of `shareNotFound`'s ternary (with and without
 * a `userId`) so the gate sees 100% on this module.
 */

const errors = require("./errors.js");
const { LedgerError } = require("./constants.js");

describe("ledger/errors", () => {
  it("userNotFound builds an Error with USER_NOT_FOUND code and embedded userId", () => {
    const err = errors.userNotFound("u-1");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("User u-1 not found");
    expect(err.code).toBe(LedgerError.USER_NOT_FOUND);
  });

  describe("shareNotFound", () => {
    it("includes the user when userId is supplied (truthy branch)", () => {
      const err = errors.shareNotFound("s-1", "u-1");
      expect(err.message).toBe("Share s-1 not found for user u-1");
      expect(err.code).toBe(LedgerError.SHARE_NOT_FOUND);
    });

    it("omits the user clause when userId is missing (falsy branch)", () => {
      const err = errors.shareNotFound("s-1");
      expect(err.message).toBe("Share s-1 not found");
      expect(err.code).toBe(LedgerError.SHARE_NOT_FOUND);
    });

    it("omits the user clause when userId is empty string", () => {
      const err = errors.shareNotFound("s-1", "");
      expect(err.message).toBe("Share s-1 not found");
    });
  });

  it("shareRevoked sets SHARE_REVOKED with the share ID", () => {
    const err = errors.shareRevoked("s-2");
    expect(err.message).toBe("Share s-2 has been revoked");
    expect(err.code).toBe(LedgerError.SHARE_REVOKED);
  });

  it("alreadyEnrolled sets ALREADY_ENROLLED with the user ID", () => {
    const err = errors.alreadyEnrolled("u-2");
    expect(err.message).toBe("User u-2 is already enrolled in key recovery");
    expect(err.code).toBe(LedgerError.ALREADY_ENROLLED);
  });

  it("invalidShareId sets INVALID_SHARE_ID with the share ID", () => {
    const err = errors.invalidShareId("bad-id");
    expect(err.message).toBe("Invalid share ID: bad-id");
    expect(err.code).toBe(LedgerError.INVALID_SHARE_ID);
  });
});
