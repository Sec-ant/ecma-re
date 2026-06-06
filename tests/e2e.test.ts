import { describe, expect, it, vi } from "vitest";
import { EcmaReError, ecmaRe } from "../src/index";

describe("public API contract", () => {
  it("returns a native RegExp", () => {
    const re = ecmaRe("(?P<word>[a-z]+)");

    expect(re).toBeInstanceOf(RegExp);
    expect("hello".match(re)?.groups?.word).toBe("hello");
  });

  it("defaults flags and options", () => {
    const re = ecmaRe("\\w+");

    expect(re.test("cafe")).toBe(true);
    expect(re.flags).toContain("v");
  });

  it("accepts partial options", () => {
    const re = ecmaRe("(?<=ab|cde)f", undefined, {
      allowVariableLengthLookbehind: true,
    });

    expect(re.test("cdef")).toBe(true);
  });
});

describe("flag API", () => {
  it("maps external i, m, s flags to RegExp flags", () => {
    const re = ecmaRe("^a.b$", "ims");

    expect(re.test("x\nA\nB\ny")).toBe(true);
    expect(re.flags).toContain("i");
    expect(re.flags).toContain("m");
    expect(re.flags).toContain("s");
  });

  it("supports verbose mode through the external x flag", () => {
    const re = ecmaRe(
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
    const re = ecmaRe("^\\w+$", "a");

    expect(re.test("abc_123")).toBe(true);
    expect(re.test("é")).toBe(false);
    expect(re.flags).not.toContain("v");
  });

  it("treats Python's Unicode flag as the default mode", () => {
    const re = ecmaRe("(?u)^\\w+$");

    expect(re.test("東京")).toBe(true);
    expect(re.flags).toContain("v");
  });
});

describe("Python-to-ES transforms exposed through JS", () => {
  it("exposes Python named groups as JavaScript named groups", () => {
    const re = ecmaRe("(?P<first>\\w+) (?P<last>\\w+)", "a");

    expect("Ada Lovelace".match(re)?.groups).toMatchObject({
      first: "Ada",
      last: "Lovelace",
    });
  });

  it("exposes Python named backreferences through JavaScript RegExp", () => {
    const re = ecmaRe("(?P<word>[a-z]+)=(?P=word)", "a");

    expect(re.test("token=token")).toBe(true);
    expect(re.test("token=value")).toBe(false);
  });

  it("keeps Python absolute anchors distinct from multiline anchors", () => {
    const re = ecmaRe("(?m)\\Afoo.*bar\\Z", "s");

    expect(re.test("foo\nbar")).toBe(true);
    expect(re.test("x\nfoo\nbar")).toBe(false);
    expect(re.test("foo\nbar\nx")).toBe(false);
  });

  it("matches a literal backspace control character outside character classes", () => {
    const re = ecmaRe("\b", "a");

    expect(re.test("\b")).toBe(true);
    expect(re.test("word")).toBe(false);
  });
});

describe("Unicode and ASCII semantics", () => {
  it("uses Python Unicode semantics by default", () => {
    const re = ecmaRe("^\\w+\\s\\d+$");

    expect(re.test("東京 १२३")).toBe(true);
    expect(re.flags).toContain("v");
  });

  it("uses ASCII semantics through the Python a flag", () => {
    const re = ecmaRe("^\\w+\\s\\d+$", "a");

    expect(re.test("abc 123")).toBe(true);
    expect(re.test("東京 १२३")).toBe(false);
    expect(re.flags).not.toContain("v");
  });

  it("applies Unicode shorthands inside character classes", () => {
    const re = ecmaRe("^[\\d\\s]+$");

    expect(re.test("१२३\u00a0")).toBe(true);
  });

  it("uses Unicode-aware word boundaries by default", () => {
    const re = ecmaRe("\\bcafé\\b");

    expect(re.test(" café ")).toBe(true);
    expect(re.test("xcaféx")).toBe(false);
  });

  it("keeps native ASCII word-boundary semantics in ASCII mode", () => {
    const boundary = ecmaRe("\\bword\\b", "a");
    const nonBoundary = ecmaRe("\\B_\\B", "a");

    expect(boundary.test(" word ")).toBe(true);
    expect(boundary.test("swordfish")).toBe(false);
    expect(nonBoundary.test("a_b")).toBe(true);
    expect(nonBoundary.test("a-_")).toBe(false);
  });
});

describe("strict mode and approximation options", () => {
  it("throws on unsupported features in strict mode", () => {
    expect(() => ecmaRe("a++")).toThrow(EcmaReError);
    expect(() => ecmaRe("(?>abc)")).toThrow(EcmaReError);
  });

  it("approximates explicitly enabled unsupported features and warns", () => {
    const onWarn = vi.fn();
    const re = ecmaRe("(?>a++)b", "a", {
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

describe("scoped modifiers", () => {
  it("scopes case-insensitive matching", () => {
    const re = ecmaRe("(?i:hello) world");

    expect(re.test("HELLO world")).toBe(true);
    expect(re.test("HELLO WORLD")).toBe(false);
  });

  it("scopes dotAll matching", () => {
    const re = ecmaRe("(?s:a.b)c.d");

    expect(re.test("a\nbcxd")).toBe(true);
    expect(re.test("a\nbc\nd")).toBe(false);
  });

  it("scopes multiline anchors", () => {
    const re = ecmaRe("(?m:^foo)");

    expect(re.test("bar\nfoo")).toBe(true);
    expect(ecmaRe("^foo").test("bar\nfoo")).toBe(false);
  });

  it("scopes disabled dotAll and multiline flags", () => {
    const dotAllDisabled = ecmaRe("(?-s:a.b)", "s");
    const multilineDisabled = ecmaRe("(?-m:^foo)", "m");

    expect(dotAllDisabled.test("a\nb")).toBe(false);
    expect(dotAllDisabled.test("axb")).toBe(true);
    expect(multilineDisabled.test("bar\nfoo")).toBe(false);
    expect(multilineDisabled.test("foo")).toBe(true);
  });
});

describe("error surface", () => {
  it("throws EcmaReError with parser positions", () => {
    try {
      ecmaRe("[abc");
      throw new Error("expected ecmaRe to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EcmaReError);
      expect((error as EcmaReError).position).toBeDefined();
    }
  });

  it("throws EcmaReError when emitted RegExp construction fails", () => {
    expect(() => ecmaRe("\\N{LATIN SMALL LETTER A}")).toThrow(EcmaReError);
  });

  it("rejects global flag groups after the pattern start", () => {
    expect(() => ecmaRe("a(?i)b")).toThrow(EcmaReError);
  });
});
