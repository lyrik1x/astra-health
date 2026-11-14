import { canonicalJson } from "../src/common/canonical-json.js";

describe("canonicalJson (S3)", () => {
  it("sorts keys recursively", () => {
    const a = { b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } };
    const b = { a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 };
    expect(canonicalJson(a)).toBe('{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}');
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("keeps array order", () => {
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it("omits undefined keys like JSON.stringify", () => {
    expect(canonicalJson({ note: undefined, a: 1 })).toBe('{"a":1}');
  });

  it("distinguishes different content", () => {
    expect(canonicalJson({ value: 70 })).not.toBe(canonicalJson({ value: 71 }));
  });

  it("handles primitives and null", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson("x")).toBe('"x"');
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
  });
});
