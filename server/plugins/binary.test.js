/**
 * @fileoverview Tests for Binary Data Helper Functions
 *
 * Tests the binary data type checking and size calculation helpers.
 */

const {
  isBinaryData,
  getBase64Length,
  INLINE_BASE64_THRESHOLD,
} = require("./binary");

describe("Binary Helpers", () => {
  describe("isBinaryData", () => {
    test("returns false for null", () => {
      expect(isBinaryData(null)).toBe(false);
    });

    test("returns false for undefined", () => {
      expect(isBinaryData(undefined)).toBe(false);
    });

    test("returns true for Buffer", () => {
      expect(isBinaryData(Buffer.from("test"))).toBe(true);
    });

    test("returns true for ArrayBuffer", () => {
      expect(isBinaryData(new ArrayBuffer(10))).toBe(true);
    });

    test("returns true for Uint8Array (TypedArray)", () => {
      expect(isBinaryData(new Uint8Array(10))).toBe(true);
    });

    test("returns true for Int32Array (TypedArray)", () => {
      expect(isBinaryData(new Int32Array(10))).toBe(true);
    });

    test("returns true for Float64Array (TypedArray)", () => {
      expect(isBinaryData(new Float64Array(10))).toBe(true);
    });

    test("returns true for DataView (ArrayBufferView)", () => {
      expect(isBinaryData(new DataView(new ArrayBuffer(10)))).toBe(true);
    });

    test("returns false for string", () => {
      expect(isBinaryData("test")).toBe(false);
    });

    test("returns false for number", () => {
      expect(isBinaryData(42)).toBe(false);
    });

    test("returns false for object", () => {
      expect(isBinaryData({ data: "test" })).toBe(false);
    });

    test("returns false for array", () => {
      expect(isBinaryData([1, 2, 3])).toBe(false);
    });
  });

  describe("getBase64Length", () => {
    test("calculates length for Buffer", () => {
      // 3 bytes -> 4 base64 chars
      const buffer = Buffer.from("abc");
      expect(getBase64Length(buffer)).toBe(4);
    });

    test("calculates length for larger Buffer", () => {
      // 75 bytes -> 100 base64 chars
      const buffer = Buffer.alloc(75);
      expect(getBase64Length(buffer)).toBe(100);
    });

    test("calculates length for ArrayBuffer", () => {
      const arrayBuffer = new ArrayBuffer(10);
      // 10 bytes -> ceil(10 * 4 / 3) = 14 base64 chars
      expect(getBase64Length(arrayBuffer)).toBe(14);
    });

    test("calculates length for TypedArray (ArrayBufferView)", () => {
      const typedArray = new Uint8Array(6);
      // 6 bytes -> 8 base64 chars
      expect(getBase64Length(typedArray)).toBe(8);
    });

    test("calculates length for DataView (ArrayBufferView)", () => {
      const dataView = new DataView(new ArrayBuffer(9));
      // 9 bytes -> 12 base64 chars
      expect(getBase64Length(dataView)).toBe(12);
    });

    test("returns Infinity for unknown type", () => {
      expect(getBase64Length("not binary")).toBe(Infinity);
      expect(getBase64Length(42)).toBe(Infinity);
      expect(getBase64Length({})).toBe(Infinity);
    });
  });

  describe("INLINE_BASE64_THRESHOLD", () => {
    test("is set to 100", () => {
      expect(INLINE_BASE64_THRESHOLD).toBe(100);
    });
  });
});
