import { describe, expect, it, vi } from "vitest";
import { EcmaReError, ecmaRe } from "../src/index";

// ---------------------------------------------------------------------------
// 1. Basic patterns
// ---------------------------------------------------------------------------
describe("Basic patterns", () => {
  it("matches a literal string", () => {
    const re = ecmaRe("hello");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("goodbye world")).toBe(false);
  });

  it("matches a single character with dot", () => {
    const re = ecmaRe("h.llo");
    expect(re.test("hello")).toBe(true);
    expect(re.test("hxllo")).toBe(true);
    expect(re.test("hllo")).toBe(false);
  });

  it("dot does not match newline without s flag", () => {
    const re = ecmaRe("a.b");
    expect(re.test("a\nb")).toBe(false);
    expect(re.test("axb")).toBe(true);
  });

  it("dot matches newline with s flag", () => {
    const re = ecmaRe("a.b", "s");
    expect(re.test("a\nb")).toBe(true);
  });

  it("caret anchors at start of string", () => {
    const re = ecmaRe("^hello");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("say hello")).toBe(false);
  });

  it("dollar anchors at end of string", () => {
    const re = ecmaRe("world$");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("world hello")).toBe(false);
  });

  it("matches empty pattern", () => {
    const re = ecmaRe("");
    expect(re.test("")).toBe(true);
    expect(re.test("x")).toBe(true); // empty regex matches anywhere
  });
});

// ---------------------------------------------------------------------------
// 2. Character classes
// ---------------------------------------------------------------------------
describe("Character classes", () => {
  it("matches characters in a simple class", () => {
    const re = ecmaRe("[abc]");
    expect(re.test("a")).toBe(true);
    expect(re.test("b")).toBe(true);
    expect(re.test("d")).toBe(false);
  });

  it("matches negated character class", () => {
    const re = ecmaRe("[^abc]");
    expect(re.test("d")).toBe(true);
    expect(re.test("a")).toBe(false);
  });

  it("matches character ranges", () => {
    const re = ecmaRe("^[a-z]+$");
    expect(re.test("hello")).toBe(true);
    expect(re.test("Hello")).toBe(false);
  });

  it("matches shorthand \\d inside class", () => {
    const re = ecmaRe("[\\d]+", "", { ascii: true });
    expect(re.test("123")).toBe(true);
    expect(re.test("abc")).toBe(false);
  });

  it("matches shorthand \\w inside class", () => {
    const re = ecmaRe("[\\w]+", "", { ascii: true });
    expect(re.test("hello_123")).toBe(true);
    expect(re.test("!!!")).toBe(false);
  });

  it("handles ] as first character in class (literal)", () => {
    const re = ecmaRe("[]abc]");
    expect(re.test("]")).toBe(true);
    expect(re.test("a")).toBe(true);
  });

  it("handles ] as first character in negated class", () => {
    const re = ecmaRe("[^]abc]");
    expect(re.test("]")).toBe(false);
    expect(re.test("x")).toBe(true);
  });

  it("handles \\b as backspace inside character class", () => {
    const re = ecmaRe("[\\b]");
    expect(re.test("\b")).toBe(true);
    expect(re.test("b")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Quantifiers
// ---------------------------------------------------------------------------
describe("Quantifiers", () => {
  it("matches zero or more with *", () => {
    const re = ecmaRe("^ab*c$");
    expect(re.test("ac")).toBe(true);
    expect(re.test("abc")).toBe(true);
    expect(re.test("abbbbc")).toBe(true);
  });

  it("matches one or more with +", () => {
    const re = ecmaRe("^ab+c$");
    expect(re.test("ac")).toBe(false);
    expect(re.test("abc")).toBe(true);
    expect(re.test("abbbbc")).toBe(true);
  });

  it("matches zero or one with ?", () => {
    const re = ecmaRe("^ab?c$");
    expect(re.test("ac")).toBe(true);
    expect(re.test("abc")).toBe(true);
    expect(re.test("abbc")).toBe(false);
  });

  it("matches exact count with {n}", () => {
    const re = ecmaRe("^a{3}$");
    expect(re.test("aa")).toBe(false);
    expect(re.test("aaa")).toBe(true);
    expect(re.test("aaaa")).toBe(false);
  });

  it("matches range with {n,m}", () => {
    const re = ecmaRe("^a{2,4}$");
    expect(re.test("a")).toBe(false);
    expect(re.test("aa")).toBe(true);
    expect(re.test("aaaa")).toBe(true);
    expect(re.test("aaaaa")).toBe(false);
  });

  it("matches at least n with {n,}", () => {
    const re = ecmaRe("^a{2,}$");
    expect(re.test("a")).toBe(false);
    expect(re.test("aa")).toBe(true);
    expect(re.test("aaaaa")).toBe(true);
  });

  it("supports lazy quantifier *?", () => {
    const re = ecmaRe("a*?");
    // lazy matches as few as possible — first match is empty
    const m = "aaa".match(re);
    expect(m).not.toBeNull();
    expect(m?.[0]).toBe("");
  });

  it("supports lazy quantifier +?", () => {
    const re = ecmaRe("a+?");
    const m = "aaa".match(re);
    expect(m).not.toBeNull();
    expect(m?.[0]).toBe("a");
  });

  it("supports lazy quantifier ??", () => {
    const re = ecmaRe("a??");
    const m = "aaa".match(re);
    expect(m).not.toBeNull();
    expect(m?.[0]).toBe("");
  });

  it("treats { as literal when not a valid quantifier", () => {
    const re = ecmaRe("^a{b$");
    expect(re.test("a{b")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Groups
// ---------------------------------------------------------------------------
describe("Groups", () => {
  it("supports capturing groups", () => {
    const re = ecmaRe("(foo)(bar)");
    const m = "foobar".match(re);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("foo");
    expect(m?.[2]).toBe("bar");
  });

  it("supports non-capturing groups", () => {
    const re = ecmaRe("(?:foo)(bar)");
    const m = "foobar".match(re);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("bar"); // first capture is (bar), not (?:foo)
  });

  it("supports named groups (?P<name>...)", () => {
    const re = ecmaRe("(?P<year>\\d{4})-(?P<month>\\d{2})", "", {
      ascii: true,
    });
    const m = "2024-03".match(re);
    expect(m).not.toBeNull();
    expect(m?.groups?.year).toBe("2024");
    expect(m?.groups?.month).toBe("03");
  });

  it("supports named backreferences (?P=name)", () => {
    const re = ecmaRe("(?P<word>[a-z]+) (?P=word)", "", { ascii: true });
    expect(re.test("hello hello")).toBe(true);
    expect(re.test("hello world")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Lookaround
// ---------------------------------------------------------------------------
describe("Lookaround", () => {
  it("supports positive lookahead (?=...)", () => {
    const re = ecmaRe("foo(?=bar)");
    expect(re.test("foobar")).toBe(true);
    expect(re.test("foobaz")).toBe(false);
  });

  it("supports negative lookahead (?!...)", () => {
    const re = ecmaRe("foo(?!bar)");
    expect(re.test("foobaz")).toBe(true);
    expect(re.test("foobar")).toBe(false);
  });

  it("supports positive lookbehind (?<=...)", () => {
    const re = ecmaRe("(?<=foo)bar");
    expect(re.test("foobar")).toBe(true);
    expect(re.test("bazbar")).toBe(false);
  });

  it("supports negative lookbehind (?<!...)", () => {
    const re = ecmaRe("(?<!foo)bar");
    expect(re.test("bazbar")).toBe(true);
    expect(re.test("foobar")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Alternation
// ---------------------------------------------------------------------------
describe("Alternation", () => {
  it("matches either alternative", () => {
    const re = ecmaRe("^(cat|dog)$");
    expect(re.test("cat")).toBe(true);
    expect(re.test("dog")).toBe(true);
    expect(re.test("bird")).toBe(false);
  });

  it("supports alternation without groups", () => {
    const re = ecmaRe("^cat|dog$");
    expect(re.test("cat")).toBe(true);
    expect(re.test("dog")).toBe(true);
  });

  it("supports multiple alternatives", () => {
    const re = ecmaRe("^(a|b|c|d)$");
    expect(re.test("a")).toBe(true);
    expect(re.test("d")).toBe(true);
    expect(re.test("e")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Backreferences
// ---------------------------------------------------------------------------
describe("Backreferences", () => {
  it("supports numeric backreference \\1", () => {
    const re = ecmaRe("(.)\\1", "", { ascii: true });
    expect(re.test("aa")).toBe(true);
    expect(re.test("ab")).toBe(false);
  });

  it("supports backreference \\2 for second group", () => {
    const re = ecmaRe("(a)(b)\\2", "", { ascii: true });
    expect(re.test("abb")).toBe(true);
    expect(re.test("aba")).toBe(false);
  });

  it("supports named backreference (?P=name)", () => {
    const re = ecmaRe("(?P<ch>.)(?P=ch)", "", { ascii: true });
    expect(re.test("xx")).toBe(true);
    expect(re.test("xy")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Inline flags
// ---------------------------------------------------------------------------
describe("Inline flags", () => {
  it("(?i) enables case-insensitive matching", () => {
    const re = ecmaRe("(?i)hello");
    expect(re.test("HELLO")).toBe(true);
    expect(re.test("Hello")).toBe(true);
  });

  it("(?m) enables multiline mode", () => {
    const re = ecmaRe("(?m)^foo$");
    expect(re.test("bar\nfoo\nbaz")).toBe(true);
  });

  it("(?s) enables dotAll mode", () => {
    const re = ecmaRe("(?s)a.b");
    expect(re.test("a\nb")).toBe(true);
  });

  it("(?x) enables verbose mode", () => {
    const re = ecmaRe("(?x) h e l l o");
    expect(re.test("hello")).toBe(true);
    expect(re.test("h e l l o")).toBe(false);
  });

  it("multiple inline flags (?im)", () => {
    const re = ecmaRe("(?im)^hello$");
    expect(re.test("world\nHELLO\nfoo")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Flag parameter
// ---------------------------------------------------------------------------
describe("Flag parameter", () => {
  it("i flag enables case-insensitive matching", () => {
    const re = ecmaRe("hello", "i");
    expect(re.test("HELLO")).toBe(true);
  });

  it("m flag enables multiline mode", () => {
    const re = ecmaRe("^foo$", "m");
    expect(re.test("bar\nfoo\nbaz")).toBe(true);
  });

  it("s flag enables dotAll mode", () => {
    const re = ecmaRe("a.b", "s");
    expect(re.test("a\nb")).toBe(true);
  });

  it("x flag enables verbose mode", () => {
    const re = ecmaRe("h e l l o", "x");
    expect(re.test("hello")).toBe(true);
  });

  it("combined flags work together", () => {
    const re = ecmaRe("^hello$", "im");
    expect(re.test("world\nHELLO\nfoo")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. \A transformation
// ---------------------------------------------------------------------------
describe("\\A transformation", () => {
  it("\\A matches at the start of string", () => {
    const re = ecmaRe("\\Ahello");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("say hello")).toBe(false);
  });

  it("\\A does NOT match at line starts in multiline mode", () => {
    const re = ecmaRe("\\Afoo", "m");
    expect(re.test("foo")).toBe(true);
    expect(re.test("bar\nfoo")).toBe(false);
  });

  it("\\A anchors absolutely even with (?m)", () => {
    const re = ecmaRe("(?m)\\Ahello");
    expect(re.test("hello\nworld")).toBe(true);
    expect(re.test("world\nhello")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. \Z and \z transformation
// ---------------------------------------------------------------------------
describe("\\Z and \\z transformation", () => {
  it("\\Z matches at the end of string", () => {
    const re = ecmaRe("world\\Z");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("world hello")).toBe(false);
  });

  it("\\z matches at the end of string", () => {
    const re = ecmaRe("world\\z");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("world hello")).toBe(false);
  });

  it("\\Z does NOT match at line ends in multiline mode", () => {
    const re = ecmaRe("foo\\Z", "m");
    expect(re.test("foo")).toBe(true);
    expect(re.test("foo\nbar")).toBe(false);
  });

  it("\\z does NOT match at line ends in multiline mode", () => {
    const re = ecmaRe("foo\\z", "m");
    expect(re.test("foo")).toBe(true);
    expect(re.test("foo\nbar")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. $ transformation in non-multiline mode
// ---------------------------------------------------------------------------
describe("$ transformation in non-multiline mode", () => {
  it("$ matches before optional trailing newline", () => {
    const re = ecmaRe("world$");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("hello world\n")).toBe(true); // Python $ matches before \n at end
  });

  it("$ does not match before newline in the middle", () => {
    const re = ecmaRe("world$");
    expect(re.test("hello world\nmore")).toBe(false);
  });

  it("$ in multiline mode uses default ES behavior", () => {
    const re = ecmaRe("world$", "m");
    expect(re.test("hello world\nmore")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13. Named group syntax transformation
// ---------------------------------------------------------------------------
describe("Named group syntax transformation", () => {
  it("(?P<name>...) is converted to (?<name>...)", () => {
    const re = ecmaRe("(?P<greeting>hello)");
    const m = "hello".match(re);
    expect(m).not.toBeNull();
    expect(m?.groups?.greeting).toBe("hello");
  });

  it("multiple named groups work correctly", () => {
    const re = ecmaRe("(?P<first>[a-z]+) (?P<second>[a-z]+)", "", {
      ascii: true,
    });
    const m = "hello world".match(re);
    expect(m).not.toBeNull();
    expect(m?.groups?.first).toBe("hello");
    expect(m?.groups?.second).toBe("world");
  });
});

// ---------------------------------------------------------------------------
// 14. Named backreference transformation
// ---------------------------------------------------------------------------
describe("Named backreference transformation", () => {
  it("(?P=name) is converted to \\k<name>", () => {
    const re = ecmaRe("(?P<w>[a-z]+)=(?P=w)", "", { ascii: true });
    expect(re.test("foo=foo")).toBe(true);
    expect(re.test("foo=bar")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 15. Comment groups
// ---------------------------------------------------------------------------
describe("Comment groups", () => {
  it("(?#...) is removed and does not affect matching", () => {
    const re = ecmaRe("foo(?#this is a comment)bar");
    expect(re.test("foobar")).toBe(true);
    expect(re.test("foo(?#this is a comment)bar")).toBe(false);
  });

  it("comment at the end of pattern", () => {
    const re = ecmaRe("hello(?#world)");
    expect(re.test("hello")).toBe(true);
  });

  it("multiple comment groups", () => {
    const re = ecmaRe("a(?#1)b(?#2)c");
    expect(re.test("abc")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 16. \a escape (bell character)
// ---------------------------------------------------------------------------
describe("\\a escape", () => {
  it("\\a matches the bell character (U+0007)", () => {
    const re = ecmaRe("\\a");
    expect(re.test("\x07")).toBe(true);
    expect(re.test("a")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 17. Octal escapes
// ---------------------------------------------------------------------------
describe("Octal escapes", () => {
  it("\\0 matches the null character", () => {
    const re = ecmaRe("\\0");
    expect(re.test("\0")).toBe(true);
  });

  it("\\141 matches the letter a (octal 141 = 97)", () => {
    // This is a 3 digit sequence starting with 1 — in a context with 0 groups,
    // it should be interpreted as octal
    const re = ecmaRe("^\\141$", "", { ascii: true });
    expect(re.test("a")).toBe(true);
  });

  it("\\012 matches newline (octal 012 = 10)", () => {
    const re = ecmaRe("\\012");
    expect(re.test("\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 18–21. Unicode mode tests (default)
// ---------------------------------------------------------------------------
describe("Unicode mode (default)", () => {
  it("\\w matches accented Latin characters", () => {
    const re = ecmaRe("^\\w+$"); // default = Unicode mode
    expect(re.test("café")).toBe(true);
    expect(re.test("naïve")).toBe(true);
  });

  it("\\w matches Chinese characters", () => {
    const re = ecmaRe("^\\w+$");
    expect(re.test("你好")).toBe(true);
  });

  it("\\w matches Cyrillic characters", () => {
    const re = ecmaRe("^\\w+$");
    expect(re.test("Привет")).toBe(true);
  });

  it("\\w matches underscore", () => {
    const re = ecmaRe("^\\w+$");
    expect(re.test("hello_world")).toBe(true);
  });

  it("\\W does not match Unicode letters", () => {
    const re = ecmaRe("^\\W+$");
    expect(re.test("café")).toBe(false);
    expect(re.test("!@#")).toBe(true);
  });

  it("\\d matches Unicode digits", () => {
    const re = ecmaRe("^\\d+$");
    expect(re.test("123")).toBe(true);
    // Arabic-Indic digits
    expect(re.test("\u0660\u0661\u0662")).toBe(true);
  });

  it("\\D does not match Unicode digits", () => {
    const re = ecmaRe("^\\D+$");
    expect(re.test("abc")).toBe(true);
    expect(re.test("123")).toBe(false);
  });

  it("\\s matches Unicode whitespace", () => {
    const re = ecmaRe("^\\s+$");
    expect(re.test(" \t\n")).toBe(true);
    // No-break space (U+00A0) is Unicode whitespace
    expect(re.test("\u00A0")).toBe(true);
  });

  it("\\S does not match Unicode whitespace", () => {
    const re = ecmaRe("^\\S+$");
    expect(re.test("hello")).toBe(true);
    expect(re.test("he llo")).toBe(false);
  });

  it("\\b works as Unicode-aware word boundary", () => {
    const re = ecmaRe("\\bcafé\\b");
    expect(re.test("le café est bon")).toBe(true);
    expect(re.test("lecafé")).toBe(false);
  });

  it("\\b detects boundary between Unicode word chars and non-word chars", () => {
    const re = ecmaRe("\\b你好\\b");
    expect(re.test("说你好吧")).toBe(false); // no boundary between 说 and 你
    expect(re.test(" 你好 ")).toBe(true); // spaces create boundaries
  });

  it("output regex has v flag in Unicode mode", () => {
    const re = ecmaRe("\\w");
    expect(re.flags).toContain("v");
  });
});

// ---------------------------------------------------------------------------
// 22. ASCII mode tests (ascii: true)
// ---------------------------------------------------------------------------
describe("ASCII mode (ascii: true)", () => {
  it("\\w only matches ASCII word characters", () => {
    const re = ecmaRe("^\\w+$", "", { ascii: true });
    expect(re.test("hello")).toBe(true);
    expect(re.test("café")).toBe(false); // é is not ASCII \w
  });

  it("\\d only matches ASCII digits", () => {
    const re = ecmaRe("^\\d+$", "", { ascii: true });
    expect(re.test("123")).toBe(true);
    expect(re.test("\u0660\u0661")).toBe(false); // Arabic-Indic digits
  });

  it("\\s only matches ASCII whitespace", () => {
    const re = ecmaRe("^\\s+$", "", { ascii: true });
    expect(re.test(" \t\n")).toBe(true);
  });

  it("\\b uses ASCII word boundary", () => {
    const re = ecmaRe("\\bhello\\b", "", { ascii: true });
    expect(re.test("say hello world")).toBe(true);
    expect(re.test("sayhelloworld")).toBe(false);
  });

  it("a flag in pattern triggers ASCII mode", () => {
    const re = ecmaRe("(?a)^\\w+$");
    expect(re.test("hello")).toBe(true);
    expect(re.test("café")).toBe(false);
  });

  it("a flag parameter triggers ASCII mode", () => {
    const re = ecmaRe("^\\w+$", "a");
    expect(re.test("hello")).toBe(true);
    expect(re.test("café")).toBe(false);
  });

  it("output regex does not have v flag in ASCII mode", () => {
    const re = ecmaRe("\\w", "", { ascii: true });
    expect(re.flags).not.toContain("v");
  });
});

// ---------------------------------------------------------------------------
// 23–24. Strict mode tests (default)
// ---------------------------------------------------------------------------
describe("Strict mode (default)", () => {
  it("possessive quantifier *+ throws EcmaReError", () => {
    expect(() => ecmaRe("a*+")).toThrow(EcmaReError);
  });

  it("possessive quantifier ++ throws EcmaReError", () => {
    expect(() => ecmaRe("a++")).toThrow(EcmaReError);
  });

  it("possessive quantifier ?+ throws EcmaReError", () => {
    expect(() => ecmaRe("a?+")).toThrow(EcmaReError);
  });

  it("possessive quantifier {2,}+ throws EcmaReError", () => {
    expect(() => ecmaRe("a{2,}+")).toThrow(EcmaReError);
  });

  it("atomic group (?>...) throws EcmaReError", () => {
    expect(() => ecmaRe("(?>abc)")).toThrow(EcmaReError);
  });
});

// ---------------------------------------------------------------------------
// 25–26. Always-throw features
// ---------------------------------------------------------------------------
describe("Always-unsupported features", () => {
  it("conditional group (?(1)a|b) throws EcmaReError even in loose mode", () => {
    expect(() => ecmaRe("(a)(?(1)b|c)", "", { loose: true })).toThrow(
      EcmaReError,
    );
  });

  it("conditional group throws EcmaReError in strict mode", () => {
    expect(() => ecmaRe("(a)(?(1)b|c)")).toThrow(EcmaReError);
  });

  it("locale flag (?L) throws EcmaReError in strict mode", () => {
    expect(() => ecmaRe("(?L)abc")).toThrow(EcmaReError);
  });

  it("locale flag (?L) throws EcmaReError in loose mode", () => {
    expect(() => ecmaRe("(?L)abc", "", { loose: true })).toThrow(EcmaReError);
  });
});

// ---------------------------------------------------------------------------
// 27–28. Loose mode tests (loose: true)
// ---------------------------------------------------------------------------
describe("Loose mode (loose: true)", () => {
  it("possessive quantifier *+ degrades to greedy and warns", () => {
    const onWarn = vi.fn();
    const re = ecmaRe("a*+b", "", {
      loose: true,
      ascii: true,
      onWarn,
    });
    expect(re.test("aaab")).toBe(true);
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining("Possessive quantifier"),
    );
  });

  it("possessive quantifier ++ degrades to greedy and warns", () => {
    const onWarn = vi.fn();
    const re = ecmaRe("a++b", "", {
      loose: true,
      ascii: true,
      onWarn,
    });
    expect(re.test("aaab")).toBe(true);
    expect(onWarn).toHaveBeenCalled();
  });

  it("atomic group (?>...) degrades to non-capturing and warns", () => {
    const onWarn = vi.fn();
    const re = ecmaRe("(?>abc)", "", {
      loose: true,
      ascii: true,
      onWarn,
    });
    expect(re.test("abc")).toBe(true);
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining("Atomic group"),
    );
  });

  it("?+ degrades to greedy and warns", () => {
    const onWarn = vi.fn();
    const re = ecmaRe("a?+b", "", {
      loose: true,
      ascii: true,
      onWarn,
    });
    expect(re.test("ab")).toBe(true);
    expect(re.test("b")).toBe(true);
    expect(onWarn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 29–31. Verbose mode tests
// ---------------------------------------------------------------------------
describe("Verbose mode", () => {
  it("strips unescaped whitespace with (?x) flag", () => {
    const re = ecmaRe("(?x) h e l l o   w o r l d");
    expect(re.test("helloworld")).toBe(true);
    expect(re.test("hello world")).toBe(false);
  });

  it("strips unescaped whitespace with x flag parameter", () => {
    const re = ecmaRe("h e l l o", "x");
    expect(re.test("hello")).toBe(true);
  });

  it("strips # comments in verbose mode", () => {
    const re = ecmaRe(
      `(?x)
      hello  # match hello
      \\s+   # followed by whitespace
      world  # then world
      `,
      "",
      { ascii: true },
    );
    expect(re.test("hello world")).toBe(true);
    expect(re.test("helloworld")).toBe(false); // \s+ requires whitespace
  });

  it("preserves whitespace inside character classes in verbose mode", () => {
    const re = ecmaRe("(?x)[ ]", "", { ascii: true });
    expect(re.test(" ")).toBe(true);
    expect(re.test("x")).toBe(false);
  });

  it("preserves escaped space in verbose mode", () => {
    const re = ecmaRe("(?x)hello\\ world");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("helloworld")).toBe(false);
  });

  it("preserves escaped # in verbose mode", () => {
    const re = ecmaRe("(?x)hello\\#world");
    expect(re.test("hello#world")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 32–34. Error cases
// ---------------------------------------------------------------------------
describe("Error cases", () => {
  it("unterminated group throws EcmaReError", () => {
    expect(() => ecmaRe("(abc")).toThrow(EcmaReError);
  });

  it("unterminated character class throws EcmaReError", () => {
    expect(() => ecmaRe("[abc")).toThrow(EcmaReError);
  });

  it("trailing backslash throws EcmaReError", () => {
    expect(() => ecmaRe("abc\\")).toThrow(EcmaReError);
  });

  it("unterminated comment group throws EcmaReError", () => {
    expect(() => ecmaRe("(?#unclosed")).toThrow(EcmaReError);
  });

  it("nothing to repeat throws EcmaReError", () => {
    expect(() => ecmaRe("*")).toThrow(EcmaReError);
    expect(() => ecmaRe("+")).toThrow(EcmaReError);
    expect(() => ecmaRe("?")).toThrow(EcmaReError);
  });

  it("invalid hex escape throws EcmaReError", () => {
    expect(() => ecmaRe("\\xGG")).toThrow(EcmaReError);
  });

  it("\\N{name} throws EcmaReError", () => {
    expect(() => ecmaRe("\\N{LATIN SMALL LETTER A}")).toThrow(EcmaReError);
  });

  it("EcmaReError has correct name property", () => {
    try {
      ecmaRe("(abc");
    } catch (e) {
      expect(e).toBeInstanceOf(EcmaReError);
      expect((e as EcmaReError).name).toBe("EcmaReError");
    }
  });

  it("EcmaReError includes position for parser errors", () => {
    try {
      ecmaRe("[abc");
    } catch (e) {
      expect(e).toBeInstanceOf(EcmaReError);
      expect((e as EcmaReError).position).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 35. Scoped modifiers
// ---------------------------------------------------------------------------
describe("Scoped modifiers", () => {
  it("(?i:...) applies case-insensitive matching only within scope", () => {
    const re = ecmaRe("(?i:hello) world");
    expect(re.test("HELLO world")).toBe(true);
    expect(re.test("HELLO WORLD")).toBe(false); // 'world' is outside (?i:...)
  });

  it("(?-i:...) disables case-insensitive matching within scope", () => {
    const re = ecmaRe("(?-i:hello) world", "i");
    expect(re.test("hello WORLD")).toBe(true);
    expect(re.test("HELLO WORLD")).toBe(false); // hello is in (?-i:...)
  });

  it("(?s:...) applies dotAll only within scope", () => {
    const re = ecmaRe("(?s:a.b)c.d");
    expect(re.test("a\nbcxd")).toBe(true);
    expect(re.test("a\nbc\nd")).toBe(false); // second dot outside (?s:...)
  });

  it("(?m:...) applies multiline only within scope", () => {
    const re = ecmaRe("(?m:^foo)");
    expect(re.test("bar\nfoo")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Additional edge cases and integration tests
// ---------------------------------------------------------------------------
describe("Edge cases", () => {
  it("empty group ()", () => {
    const re = ecmaRe("()a");
    const m = "a".match(re);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("");
  });

  it("nested groups", () => {
    const re = ecmaRe("((a)(b))");
    const m = "ab".match(re);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("ab");
    expect(m?.[2]).toBe("a");
    expect(m?.[3]).toBe("b");
  });

  it("alternation in groups", () => {
    const re = ecmaRe("(a|b)(c|d)");
    expect("ac".match(re)).not.toBeNull();
    expect("bd".match(re)).not.toBeNull();
    expect("ae".match(re)).toBeNull();
  });

  it("quantifier on group", () => {
    const re = ecmaRe("^(ab)+$");
    expect(re.test("ababab")).toBe(true);
    expect(re.test("ab")).toBe(true);
    expect(re.test("abc")).toBe(false);
  });

  it("quantifier on character class", () => {
    const re = ecmaRe("^[abc]{3}$");
    expect(re.test("abc")).toBe(true);
    expect(re.test("ab")).toBe(false);
    expect(re.test("abcd")).toBe(false);
  });

  it("escaped metacharacters", () => {
    const re = ecmaRe("\\(hello\\)");
    expect(re.test("(hello)")).toBe(true);
    expect(re.test("hello")).toBe(false);
  });

  it("escaped dot matches literal dot", () => {
    const re = ecmaRe("a\\.b");
    expect(re.test("a.b")).toBe(true);
    expect(re.test("axb")).toBe(false);
  });

  it("\\t matches tab", () => {
    const re = ecmaRe("\\t");
    expect(re.test("\t")).toBe(true);
  });

  it("\\n matches newline", () => {
    const re = ecmaRe("\\n");
    expect(re.test("\n")).toBe(true);
  });

  it("\\r matches carriage return", () => {
    const re = ecmaRe("\\r");
    expect(re.test("\r")).toBe(true);
  });

  it("\\f matches form feed", () => {
    const re = ecmaRe("\\f");
    expect(re.test("\f")).toBe(true);
  });

  it("\\v matches vertical tab", () => {
    const re = ecmaRe("\\v");
    expect(re.test("\v")).toBe(true);
  });

  it("\\x hex escape works", () => {
    const re = ecmaRe("\\x41"); // 0x41 = 'A'
    expect(re.test("A")).toBe(true);
    expect(re.test("B")).toBe(false);
  });

  it("complex Python regex: email-like pattern", () => {
    const re = ecmaRe(
      "(?P<user>[\\w.+-]+)@(?P<domain>[\\w-]+\\.)+(?P<tld>[a-zA-Z]{2,})",
      "",
      { ascii: true },
    );
    const m = "user@example.com".match(re);
    expect(m).not.toBeNull();
    expect(m?.groups?.user).toBe("user");
    expect(m?.groups?.tld).toBe("com");
  });

  it("complex Python regex: date pattern with verbose mode", () => {
    const re = ecmaRe(
      `
      (?P<year>\\d{4})   # four digit year
      -                   # separator
      (?P<month>\\d{2})   # two digit month
      -                   # separator
      (?P<day>\\d{2})     # two digit day
      `,
      "x",
      { ascii: true },
    );
    const m = "2024-03-15".match(re);
    expect(m).not.toBeNull();
    expect(m?.groups?.year).toBe("2024");
    expect(m?.groups?.month).toBe("03");
    expect(m?.groups?.day).toBe("15");
  });

  it("} is treated as literal", () => {
    const re = ecmaRe("^}$");
    expect(re.test("}")).toBe(true);
  });

  it("{ is treated as literal when not valid quantifier", () => {
    const re = ecmaRe("^{$");
    expect(re.test("{")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unicode shorthand inside character classes
// ---------------------------------------------------------------------------
describe("Unicode shorthands inside character classes", () => {
  it("[\\d] in Unicode mode matches Unicode digits", () => {
    const re = ecmaRe("^[\\d]+$"); // default Unicode mode
    expect(re.test("123")).toBe(true);
    expect(re.test("\u0660\u0661\u0662")).toBe(true); // Arabic-Indic digits
  });

  it("[\\s] in Unicode mode matches Unicode whitespace", () => {
    const re = ecmaRe("^[\\s]+$");
    expect(re.test(" \t\n")).toBe(true);
    expect(re.test("\u00A0")).toBe(true); // no-break space
  });

  it("[\\D] negated shorthand in Unicode mode", () => {
    const re = ecmaRe("^[\\D]+$");
    expect(re.test("abc")).toBe(true);
    expect(re.test("123")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multiple features combined
// ---------------------------------------------------------------------------
describe("Combined features", () => {
  it("named groups + verbose mode + flags", () => {
    const re = ecmaRe(
      `(?ix)
       (?P<proto>  https? )  # protocol
       ://                   # separator
       (?P<host>  [^/]+ )   # hostname
      `,
      "",
      { ascii: true },
    );
    const m = "HTTPS://Example.COM/path".match(re);
    expect(m).not.toBeNull();
    expect(m?.groups?.proto).toBe("HTTPS");
    expect(m?.groups?.host).toBe("Example.COM");
  });

  it("lookaround + quantifiers + character classes", () => {
    const re = ecmaRe("(?<=\\()\\d+(?=\\))", "", { ascii: true });
    const m = "(123)".match(re);
    expect(m).not.toBeNull();
    expect(m?.[0]).toBe("123");
  });

  it("alternation + backreferences", () => {
    const re = ecmaRe("(a|b)\\1", "", { ascii: true });
    expect(re.test("aa")).toBe(true);
    expect(re.test("bb")).toBe(true);
    expect(re.test("ab")).toBe(false);
    expect(re.test("ba")).toBe(false);
  });

  it("\\A and \\Z together to match full string", () => {
    const re = ecmaRe("\\Ahello\\Z");
    expect(re.test("hello")).toBe(true);
    expect(re.test("hello world")).toBe(false);
    expect(re.test("say hello")).toBe(false);
  });

  it("Unicode \\w with named groups", () => {
    const re = ecmaRe("(?P<word>\\w+)");
    const m = "café".match(re);
    expect(m).not.toBeNull();
    expect(m?.groups?.word).toBe("café");
  });

  it("comment groups interspersed in complex pattern", () => {
    const re = ecmaRe(
      "(?P<a>[a-z]+)(?#first part) (?P<b>[a-z]+)(?#second part)",
      "",
      { ascii: true },
    );
    const m = "hello world".match(re);
    expect(m).not.toBeNull();
    expect(m?.groups?.a).toBe("hello");
    expect(m?.groups?.b).toBe("world");
  });
});

// ---------------------------------------------------------------------------
// Return type and flags verification
// ---------------------------------------------------------------------------
describe("Return type and flags", () => {
  it("returns a RegExp object", () => {
    const re = ecmaRe("hello");
    expect(re).toBeInstanceOf(RegExp);
  });

  it("i flag appears in output", () => {
    const re = ecmaRe("hello", "i");
    expect(re.flags).toContain("i");
  });

  it("m flag appears in output", () => {
    const re = ecmaRe("hello", "m");
    expect(re.flags).toContain("m");
  });

  it("s flag appears in output", () => {
    const re = ecmaRe("hello", "s");
    expect(re.flags).toContain("s");
  });

  it("v flag appears in output when Unicode mode", () => {
    const re = ecmaRe("\\w");
    expect(re.flags).toContain("v");
  });

  it("no v flag in ASCII mode", () => {
    const re = ecmaRe("\\w", "", { ascii: true });
    expect(re.flags).not.toContain("v");
  });

  it("inline (?i) flag propagates to output", () => {
    const re = ecmaRe("(?i)hello");
    expect(re.flags).toContain("i");
  });
});

// ---------------------------------------------------------------------------
// Default options behavior
// ---------------------------------------------------------------------------
describe("Default options", () => {
  it("Unicode mode is the default", () => {
    const re = ecmaRe("^\\w+$");
    // Unicode mode means accented chars match \w
    expect(re.test("café")).toBe(true);
  });

  it("strict mode is the default", () => {
    expect(() => ecmaRe("a*+")).toThrow(EcmaReError);
  });

  it("options can be partially provided", () => {
    // Only provide ascii, strict should still be the default
    expect(() => ecmaRe("a*+", "", { ascii: true })).toThrow(EcmaReError);
  });

  it("flags parameter defaults to empty string", () => {
    const re = ecmaRe("hello");
    // No flags means no i, m, s
    expect(re.flags).not.toContain("i");
    expect(re.flags).not.toContain("m");
    expect(re.flags).not.toContain("s");
  });
});
