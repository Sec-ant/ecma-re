import { describe, expect, it, vi } from "vitest";
import { EcmaReError, ecmaRe } from "../src/index";
import { compileEcmaRe } from "./helpers";

describe("public API contract", () => {
  it("returns a RegExp literal string", () => {
    const literal = ecmaRe("(?P<word>[a-z]+)");
    const re = compileEcmaRe("(?P<word>[a-z]+)");

    expect(literal).toBe("/(?<word>[a-z]+)/v");
    expect("hello".match(re)?.groups?.word).toBe("hello");
  });

  it("serializes literal strings using RegExp toString shape", () => {
    expect(ecmaRe("")).toBe("/(?:)/v");
    expect(ecmaRe("/", "a")).toBe("/\\//");
    expect(ecmaRe("[/]", "a")).toBe("/[\\/]/");
    expect(ecmaRe("\u2028", "a")).toBe("/\\u2028/");
    expect(ecmaRe("\u2029", "a")).toBe("/\\u2029/");
  });

  it("defaults flags and options", () => {
    const re = compileEcmaRe("\\w+");

    expect(re.test("cafe")).toBe(true);
    expect(re.flags).toContain("v");
  });

  it("accepts partial options without changing defaults", () => {
    const re = compileEcmaRe("abc", undefined, {
      allowVariableLengthLookbehind: true,
    });

    expect(re.test("abc")).toBe(true);
    expect(re.flags).toContain("v");
  });
});

describe("flag API", () => {
  it("maps external i, m, s flags to RegExp flags", () => {
    const re = compileEcmaRe("^a.b$", "ims");

    expect(re.test("x\nA\nB\ny")).toBe(true);
    expect(re.flags).toContain("i");
    expect(re.flags).toContain("m");
    expect(re.flags).toContain("s");
  });

  it("supports verbose mode through the external x flag", () => {
    const re = compileEcmaRe(
      `
      (?P<year> \\d{4} )
      -
      (?P<month> \\d{2} )
      `,
      "xa",
    );

    expect("2026-06".match(re)?.groups).toMatchObject({
      year: "2026",
      month: "06",
    });
  });

  it("supports ASCII mode through the external a flag", () => {
    const re = compileEcmaRe("^\\w+$", "a");

    expect(re.test("abc_123")).toBe(true);
    expect(re.test("é")).toBe(false);
    expect(re.flags).not.toContain("v");
  });

  it("treats Python's Unicode flag as the default mode", () => {
    const re = compileEcmaRe("(?u)^\\w+$");

    expect(re.test("東京")).toBe(true);
    expect(re.flags).toContain("v");
  });

  it("rejects unsupported external flag characters", () => {
    expect(() => ecmaRe("abc", "g")).toThrow(EcmaReError);
    expect(() => ecmaRe("abc", "z")).toThrow(EcmaReError);
  });

  it("rejects incompatible external mode flags", () => {
    expect(() => ecmaRe("abc", "au")).toThrow(EcmaReError);
    expect(() => ecmaRe("abc", "L")).toThrow(EcmaReError);
    expect(() => ecmaRe("(?a)abc", "u")).toThrow(EcmaReError);
  });
});

describe("strict mode and approximation options", () => {
  it("throws on unsupported features in strict mode", () => {
    expect(() => ecmaRe("a++")).toThrow(EcmaReError);
    expect(() => ecmaRe("(?>abc)")).toThrow(EcmaReError);
  });

  it("approximates explicitly enabled unsupported features and warns", () => {
    const onWarn = vi.fn();
    const re = compileEcmaRe("(?>a++)b", "a", {
      allowAtomicGroupApproximation: true,
      allowPossessiveQuantifierApproximation: true,
      onWarn,
    });

    expect(re.test("aaab")).toBe(true);
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining("Atomic group"),
    );
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining("Possessive quantifier"),
    );
  });

  it("always throws for features with no safe degradation", () => {
    const options = {
      allowAtomicGroupApproximation: true,
      allowPossessiveQuantifierApproximation: true,
    };

    expect(() => ecmaRe("(a)(?(1)b|c)", "", options)).toThrow(EcmaReError);
    expect(() => ecmaRe("(?L)abc", "", options)).toThrow(EcmaReError);
    expect(() => ecmaRe("(?L:abc)", "", options)).toThrow(EcmaReError);
  });
});

describe("API error surface", () => {
  it("throws EcmaReError with parser positions", () => {
    try {
      ecmaRe("[abc");
      throw new Error("expected ecmaRe to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EcmaReError);
      expect((error as EcmaReError).position).toBeDefined();
    }
  });

  it("throws EcmaReError for unknown named Unicode escapes", () => {
    expect(() => ecmaRe("\\N{NOT A CHARACTER}")).toThrow(EcmaReError);
  });
});
