import { describe, expect, it, vi } from "vitest";
import { EsreError, esre } from "../src/index";

// ---------------------------------------------------------------------------
// 1. Basic patterns
// ---------------------------------------------------------------------------
describe("Basic patterns", () => {
  it("matches a literal string", () => {
    const re = esre("hello");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("goodbye world")).toBe(false);
  });

  it("matches a single character with dot", () => {
    const re = esre("h.llo");
    expect(re.test("hello")).toBe(true);
    expect(re.test("hxllo")).toBe(true);
    expect(re.test("hllo")).toBe(false);
  });

  it("dot does not match newline without s flag", () => {
    const re = esre("a.b");
    expect(re.test("a\nb")).toBe(false);
    expect(re.test("axb")).toBe(true);
  });

  it("dot matches newline with s flag", () => {
    const re = esre("a.b", "s");
    expect(re.test("a\nb")).toBe(true);
  });

  it("caret anchors at start of string", () => {
    const re = esre("^hello");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("say hello")).toBe(false);
  });

  it("dollar anchors at end of string", () => {
    const re = esre("world$");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("world hello")).toBe(false);
  });

  it("matches empty pattern", () => {
    const re = esre("");
    expect(re.test("")).toBe(true);
    expect(re.test("x")).toBe(true); // empty regex matches anywhere
  });
});

// ---------------------------------------------------------------------------
// 2. Character classes
// ---------------------------------------------------------------------------
describe("Character classes", () => {
  it("matches characters in a simple class", () => {
    const re = esre("[abc]");
    expect(re.test("a")).toBe(true);
    expect(re.test("b")).toBe(true);
    expect(re.test("d")).toBe(false);
  });

  it("matches negated character class", () => {
    const re = esre("[^abc]");
    expect(re.test("d")).toBe(true);
    expect(re.test("a")).toBe(false);
  });

  it("matches character ranges", () => {
    const re = esre("^[a-z]+$");
    expect(re.test("hello")).toBe(true);
    expect(re.test("Hello")).toBe(false);
  });

  it("matches shorthand \\d inside class", () => {
    const re = esre("[\\d]+", "", { ascii: true });
    expect(re.test("123")).toBe(true);
    expect(re.test("abc")).toBe(false);
  });

  it("matches shorthand \\w inside class", () => {
    const re = esre("[\\w]+", "", { ascii: true });
    expect(re.test("hello_123")).toBe(true);
    expect(re.test("!!!")).toBe(false);
  });

  it("handles ] as first character in class (literal)", () => {
    const re = esre("[]abc]");
    expect(re.test("]")).toBe(true);
    expect(re.test("a")).toBe(true);
  });

  it("handles ] as first character in negated class", () => {
    const re = esre("[^]abc]");
    expect(re.test("]")).toBe(false);
    expect(re.test("x")).toBe(true);
  });

  it("handles \\b as backspace inside character class", () => {
    const re = esre("[\\b]");
    expect(re.test("\b")).toBe(true);
    expect(re.test("b")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Quantifiers
// ---------------------------------------------------------------------------
describe("Quantifiers", () => {
  it("matches zero or more with *", () => {
    const re = esre("^ab*c$");
    expect(re.test("ac")).toBe(true);
    expect(re.test("abc")).toBe(true);
    expect(re.test("abbbbc")).toBe(true);
  });

  it("matches one or more with +", () => {
    const re = esre("^ab+c$");
    expect(re.test("ac")).toBe(false);
    expect(re.test("abc")).toBe(true);
    expect(re.test("abbbbc")).toBe(true);
  });

  it("matches zero or one with ?", () => {
    const re = esre("^ab?c$");
    expect(re.test("ac")).toBe(true);
    expect(re.test("abc")).toBe(true);
    expect(re.test("abbc")).toBe(false);
  });

  it("matches exact count with {n}", () => {
    const re = esre("^a{3}$");
    expect(re.test("aa")).toBe(false);
    expect(re.test("aaa")).toBe(true);
    expect(re.test("aaaa")).toBe(false);
  });

  it("matches range with {n,m}", () => {
    const re = esre("^a{2,4}$");
    expect(re.test("a")).toBe(false);
    expect(re.test("aa")).toBe(true);
    expect(re.test("aaaa")).toBe(true);
    expect(re.test("aaaaa")).toBe(false);
  });

  it("matches at least n with {n,}", () => {
    const re = esre("^a{2,}$");
    expect(re.test("a")).toBe(false);
    expect(re.test("aa")).toBe(true);
    expect(re.test("aaaaa")).toBe(true);
  });

  it("supports lazy quantifier *?", () => {
    const re = esre("a*?");
    // lazy matches as few as possible — first match is empty
    const m = "aaa".match(re);
    expect(m).not.toBeNull();
    expect(m?.[0]).toBe("");
  });

  it("supports lazy quantifier +?", () => {
    const re = esre("a+?");
    const m = "aaa".match(re);
    expect(m).not.toBeNull();
    expect(m?.[0]).toBe("a");
  });

  it("supports lazy quantifier ??", () => {
    const re = esre("a??");
    const m = "aaa".match(re);
    expect(m).not.toBeNull();
    expect(m?.[0]).toBe("");
  });

  it("treats { as literal when not a valid quantifier", () => {
    const re = esre("^a{b$");
    expect(re.test("a{b")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Groups
// ---------------------------------------------------------------------------
describe("Groups", () => {
  it("supports capturing groups", () => {
    const re = esre("(foo)(bar)");
    const m = "foobar".match(re);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("foo");
    expect(m?.[2]).toBe("bar");
  });

  it("supports non-capturing groups", () => {
    const re = esre("(?:foo)(bar)");
    const m = "foobar".match(re);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("bar"); // first capture is (bar), not (?:foo)
  });

  it("supports named groups (?P<name>...)", () => {
    const re = esre("(?P<year>\\d{4})-(?P<month>\\d{2})", "", {
      ascii: true,
    });
    const m = "2024-03".match(re);
    expect(m).not.toBeNull();
    expect(m?.groups?.year).toBe("2024");
    expect(m?.groups?.month).toBe("03");
  });

  it("supports named backreferences (?P=name)", () => {
    const re = esre("(?P<word>[a-z]+) (?P=word)", "", { ascii: true });
    expect(re.test("hello hello")).toBe(true);
    expect(re.test("hello world")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Lookaround
// ---------------------------------------------------------------------------
describe("Lookaround", () => {
  it("supports positive lookahead (?=...)", () => {
    const re = esre("foo(?=bar)");
    expect(re.test("foobar")).toBe(true);
    expect(re.test("foobaz")).toBe(false);
  });

  it("supports negative lookahead (?!...)", () => {
    const re = esre("foo(?!bar)");
    expect(re.test("foobaz")).toBe(true);
    expect(re.test("foobar")).toBe(false);
  });

  it("supports positive lookbehind (?<=...)", () => {
    const re = esre("(?<=foo)bar");
    expect(re.test("foobar")).toBe(true);
    expect(re.test("bazbar")).toBe(false);
  });

  it("supports negative lookbehind (?<!...)", () => {
    const re = esre("(?<!foo)bar");
    expect(re.test("bazbar")).toBe(true);
    expect(re.test("foobar")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Alternation
// ---------------------------------------------------------------------------
describe("Alternation", () => {
  it("matches either alternative", () => {
    const re = esre("^(cat|dog)$");
    expect(re.test("cat")).toBe(true);
    expect(re.test("dog")).toBe(true);
    expect(re.test("bird")).toBe(false);
  });

  it("supports alternation without groups", () => {
    const re = esre("^cat|dog$");
    expect(re.test("cat")).toBe(true);
    expect(re.test("dog")).toBe(true);
  });

  it("supports multiple alternatives", () => {
    const re = esre("^(a|b|c|d)$");
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
    const re = esre("(.)\\1", "", { ascii: true });
    expect(re.test("aa")).toBe(true);
    expect(re.test("ab")).toBe(false);
  });

  it("supports backreference \\2 for second group", () => {
    const re = esre("(a)(b)\\2", "", { ascii: true });
    expect(re.test("abb")).toBe(true);
    expect(re.test("aba")).toBe(false);
  });

  it("supports named backreference (?P=name)", () => {
    const re = esre("(?P<ch>.)(?P=ch)", "", { ascii: true });
    expect(re.test("xx")).toBe(true);
    expect(re.test("xy")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Inline flags
// ---------------------------------------------------------------------------
describe("Inline flags", () => {
  it("(?i) enables case-insensitive matching", () => {
    const re = esre("(?i)hello");
    expect(re.test("HELLO")).toBe(true);
    expect(re.test("Hello")).toBe(true);
  });

  it("(?m) enables multiline mode", () => {
    const re = esre("(?m)^foo$");
    expect(re.test("bar\nfoo\nbaz")).toBe(true);
  });

  it("(?s) enables dotAll mode", () => {
    const re = esre("(?s)a.b");
    expect(re.test("a\nb")).toBe(true);
  });

  it("(?x) enables verbose mode", () => {
    const re = esre("(?x) h e l l o");
    expect(re.test("hello")).toBe(true);
    expect(re.test("h e l l o")).toBe(false);
  });

  it("multiple inline flags (?im)", () => {
    const re = esre("(?im)^hello$");
    expect(re.test("world\nHELLO\nfoo")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Flag parameter
// ---------------------------------------------------------------------------
describe("Flag parameter", () => {
  it("i flag enables case-insensitive matching", () => {
    const re = esre("hello", "i");
    expect(re.test("HELLO")).toBe(true);
  });

  it("m flag enables multiline mode", () => {
    const re = esre("^foo$", "m");
    expect(re.test("bar\nfoo\nbaz")).toBe(true);
  });

  it("s flag enables dotAll mode", () => {
    const re = esre("a.b", "s");
    expect(re.test("a\nb")).toBe(true);
  });

  it("x flag enables verbose mode", () => {
    const re = esre("h e l l o", "x");
    expect(re.test("hello")).toBe(true);
  });

  it("combined flags work together", () => {
    const re = esre("^hello$", "im");
    expect(re.test("world\nHELLO\nfoo")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. \A transformation
// ---------------------------------------------------------------------------
describe("\\A transformation", () => {
  it("\\A matches at the start of string", () => {
    const re = esre("\\Ahello");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("say hello")).toBe(false);
  });

  it("\\A does NOT match at line starts in multiline mode", () => {
    const re = esre("\\Afoo", "m");
    expect(re.test("foo")).toBe(true);
    expect(re.test("bar\nfoo")).toBe(false);
  });

  it("\\A anchors absolutely even with (?m)", () => {
    const re = esre("(?m)\\Ahello");
    expect(re.test("hello\nworld")).toBe(true);
    expect(re.test("world\nhello")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. \Z and \z transformation
// ---------------------------------------------------------------------------
describe("\\Z and \\z transformation", () => {
  it("\\Z matches at the end of string", () => {
    const re = esre("world\\Z");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("world hello")).toBe(false);
  });

  it("\\z matches at the end of string", () => {
    const re = esre("world\\z");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("world hello")).toBe(false);
  });

  it("\\Z does NOT match at line ends in multiline mode", () => {
    const re = esre("foo\\Z", "m");
    expect(re.test("foo")).toBe(true);
    expect(re.test("foo\nbar")).toBe(false);
  });

  it("\\z does NOT match at line ends in multiline mode", () => {
    const re = esre("foo\\z", "m");
    expect(re.test("foo")).toBe(true);
    expect(re.test("foo\nbar")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. $ transformation in non-multiline mode
// ---------------------------------------------------------------------------
describe("$ transformation in non-multiline mode", () => {
  it("$ matches before optional trailing newline", () => {
    const re = esre("world$");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("hello world\n")).toBe(true); // Python $ matches before \n at end
  });

  it("$ does not match before newline in the middle", () => {
    const re = esre("world$");
    expect(re.test("hello world\nmore")).toBe(false);
  });

  it("$ in multiline mode uses default ES behavior", () => {
    const re = esre("world$", "m");
    expect(re.test("hello world\nmore")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13. Named group syntax transformation
// ---------------------------------------------------------------------------
describe("Named group syntax transformation", () => {
  it("(?P<name>...) is converted to (?<name>...)", () => {
    const re = esre("(?P<greeting>hello)");
    const m = "hello".match(re);
    expect(m).not.toBeNull();
    expect(m?.groups?.greeting).toBe("hello");
  });

  it("multiple named groups work correctly", () => {
    const re = esre("(?P<first>[a-z]+) (?P<second>[a-z]+)", "", {
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
    const re = esre("(?P<w>[a-z]+)=(?P=w)", "", { ascii: true });
    expect(re.test("foo=foo")).toBe(true);
    expect(re.test("foo=bar")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 15. Comment groups
// ---------------------------------------------------------------------------
describe("Comment groups", () => {
  it("(?#...) is removed and does not affect matching", () => {
    const re = esre("foo(?#this is a comment)bar");
    expect(re.test("foobar")).toBe(true);
    expect(re.test("foo(?#this is a comment)bar")).toBe(false);
  });

  it("comment at the end of pattern", () => {
    const re = esre("hello(?#world)");
    expect(re.test("hello")).toBe(true);
  });

  it("multiple comment groups", () => {
    const re = esre("a(?#1)b(?#2)c");
    expect(re.test("abc")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 16. \a escape (bell character)
// ---------------------------------------------------------------------------
describe("\\a escape", () => {
  it("\\a matches the bell character (U+0007)", () => {
    const re = esre("\\a");
    expect(re.test("\x07")).toBe(true);
    expect(re.test("a")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 17. Octal escapes
// ---------------------------------------------------------------------------
describe("Octal escapes", () => {
  it("\\0 matches the null character", () => {
    const re = esre("\\0");
    expect(re.test("\0")).toBe(true);
  });

  it("\\141 matches the letter a (octal 141 = 97)", () => {
    // This is a 3 digit sequence starting with 1 — in a context with 0 groups,
    // it should be interpreted as octal
    const re = esre("^\\141$", "", { ascii: true });
    expect(re.test("a")).toBe(true);
  });

  it("\\012 matches newline (octal 012 = 10)", () => {
    const re = esre("\\012");
    expect(re.test("\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 18–21. Unicode mode tests (default)
// ---------------------------------------------------------------------------
describe("Unicode mode (default)", () => {
  it("\\w matches accented Latin characters", () => {
    const re = esre("^\\w+$"); // default = Unicode mode
    expect(re.test("café")).toBe(true);
    expect(re.test("naïve")).toBe(true);
  });

  it("\\w matches Chinese characters", () => {
    const re = esre("^\\w+$");
    expect(re.test("你好")).toBe(true);
  });

  it("\\w matches Cyrillic characters", () => {
    const re = esre("^\\w+$");
    expect(re.test("Привет")).toBe(true);
  });

  it("\\w matches underscore", () => {
    const re = esre("^\\w+$");
    expect(re.test("hello_world")).toBe(true);
  });

  it("\\W does not match Unicode letters", () => {
    const re = esre("^\\W+$");
    expect(re.test("café")).toBe(false);
    expect(re.test("!@#")).toBe(true);
  });

  it("\\d matches Unicode digits", () => {
    const re = esre("^\\d+$");
    expect(re.test("123")).toBe(true);
    // Arabic-Indic digits
    expect(re.test("\u0660\u0661\u0662")).toBe(true);
  });

  it("\\D does not match Unicode digits", () => {
    const re = esre("^\\D+$");
    expect(re.test("abc")).toBe(true);
    expect(re.test("123")).toBe(false);
  });

  it("\\s matches Unicode whitespace", () => {
    const re = esre("^\\s+$");
    expect(re.test(" \t\n")).toBe(true);
    // No-break space (U+00A0) is Unicode whitespace
    expect(re.test("\u00A0")).toBe(true);
  });

  it("\\S does not match Unicode whitespace", () => {
    const re = esre("^\\S+$");
    expect(re.test("hello")).toBe(true);
    expect(re.test("he llo")).toBe(false);
  });

  it("\\b works as Unicode-aware word boundary", () => {
    const re = esre("\\bcafé\\b");
    expect(re.test("le café est bon")).toBe(true);
    expect(re.test("lecafé")).toBe(false);
  });

  it("\\b detects boundary between Unicode word chars and non-word chars", () => {
    const re = esre("\\b你好\\b");
    expect(re.test("说你好吧")).toBe(false); // no boundary between 说 and 你
    expect(re.test(" 你好 ")).toBe(true); // spaces create boundaries
  });

  it("output regex has v flag in Unicode mode", () => {
    const re = esre("\\w");
    expect(re.flags).toContain("v");
  });
});

// ---------------------------------------------------------------------------
// 22. ASCII mode tests (ascii: true)
// ---------------------------------------------------------------------------
describe("ASCII mode (ascii: true)", () => {
  it("\\w only matches ASCII word characters", () => {
    const re = esre("^\\w+$", "", { ascii: true });
    expect(re.test("hello")).toBe(true);
    expect(re.test("café")).toBe(false); // é is not ASCII \w
  });

  it("\\d only matches ASCII digits", () => {
    const re = esre("^\\d+$", "", { ascii: true });
    expect(re.test("123")).toBe(true);
    expect(re.test("\u0660\u0661")).toBe(false); // Arabic-Indic digits
  });

  it("\\s only matches ASCII whitespace", () => {
    const re = esre("^\\s+$", "", { ascii: true });
    expect(re.test(" \t\n")).toBe(true);
  });

  it("\\b uses ASCII word boundary", () => {
    const re = esre("\\bhello\\b", "", { ascii: true });
    expect(re.test("say hello world")).toBe(true);
    expect(re.test("sayhelloworld")).toBe(false);
  });

  it("a flag in pattern triggers ASCII mode", () => {
    const re = esre("(?a)^\\w+$");
    expect(re.test("hello")).toBe(true);
    expect(re.test("café")).toBe(false);
  });

  it("a flag parameter triggers ASCII mode", () => {
    const re = esre("^\\w+$", "a");
    expect(re.test("hello")).toBe(true);
    expect(re.test("café")).toBe(false);
  });

  it("output regex does not have v flag in ASCII mode", () => {
    const re = esre("\\w", "", { ascii: true });
    expect(re.flags).not.toContain("v");
  });
});

// ---------------------------------------------------------------------------
// 23–24. Strict mode tests (default)
// ---------------------------------------------------------------------------
describe("Strict mode (default)", () => {
  it("possessive quantifier *+ throws EsreError", () => {
    expect(() => esre("a*+")).toThrow(EsreError);
  });

  it("possessive quantifier ++ throws EsreError", () => {
    expect(() => esre("a++")).toThrow(EsreError);
  });

  it("possessive quantifier ?+ throws EsreError", () => {
    expect(() => esre("a?+")).toThrow(EsreError);
  });

  it("possessive quantifier {2,}+ throws EsreError", () => {
    expect(() => esre("a{2,}+")).toThrow(EsreError);
  });

  it("atomic group (?>...) throws EsreError", () => {
    expect(() => esre("(?>abc)")).toThrow(EsreError);
  });
});

// ---------------------------------------------------------------------------
// 25–26. Always-throw features
// ---------------------------------------------------------------------------
describe("Always-unsupported features", () => {
  it("conditional group (?(1)a|b) throws EsreError even in loose mode", () => {
    expect(() => esre("(a)(?(1)b|c)", "", { loose: true })).toThrow(EsreError);
  });

  it("conditional group throws EsreError in strict mode", () => {
    expect(() => esre("(a)(?(1)b|c)")).toThrow(EsreError);
  });

  it("locale flag (?L) throws EsreError in strict mode", () => {
    expect(() => esre("(?L)abc")).toThrow(EsreError);
  });

  it("locale flag (?L) throws EsreError in loose mode", () => {
    expect(() => esre("(?L)abc", "", { loose: true })).toThrow(EsreError);
  });
});

// ---------------------------------------------------------------------------
// 27–28. Loose mode tests (loose: true)
// ---------------------------------------------------------------------------
describe("Loose mode (loose: true)", () => {
  it("possessive quantifier *+ degrades to greedy and warns", () => {
    const onWarn = vi.fn();
    const re = esre("a*+b", "", {
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
    const re = esre("a++b", "", {
      loose: true,
      ascii: true,
      onWarn,
    });
    expect(re.test("aaab")).toBe(true);
    expect(onWarn).toHaveBeenCalled();
  });

  it("atomic group (?>...) degrades to non-capturing and warns", () => {
    const onWarn = vi.fn();
    const re = esre("(?>abc)", "", {
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
    const re = esre("a?+b", "", {
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
    const re = esre("(?x) h e l l o   w o r l d");
    expect(re.test("helloworld")).toBe(true);
    expect(re.test("hello world")).toBe(false);
  });

  it("strips unescaped whitespace with x flag parameter", () => {
    const re = esre("h e l l o", "x");
    expect(re.test("hello")).toBe(true);
  });

  it("strips # comments in verbose mode", () => {
    const re = esre(
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
    const re = esre("(?x)[ ]", "", { ascii: true });
    expect(re.test(" ")).toBe(true);
    expect(re.test("x")).toBe(false);
  });

  it("preserves escaped space in verbose mode", () => {
    const re = esre("(?x)hello\\ world");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("helloworld")).toBe(false);
  });

  it("preserves escaped # in verbose mode", () => {
    const re = esre("(?x)hello\\#world");
    expect(re.test("hello#world")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 32–34. Error cases
// ---------------------------------------------------------------------------
describe("Error cases", () => {
  it("unterminated group throws EsreError", () => {
    expect(() => esre("(abc")).toThrow(EsreError);
  });

  it("unterminated character class throws EsreError", () => {
    expect(() => esre("[abc")).toThrow(EsreError);
  });

  it("trailing backslash throws EsreError", () => {
    expect(() => esre("abc\\")).toThrow(EsreError);
  });

  it("unterminated comment group throws EsreError", () => {
    expect(() => esre("(?#unclosed")).toThrow(EsreError);
  });

  it("nothing to repeat throws EsreError", () => {
    expect(() => esre("*")).toThrow(EsreError);
    expect(() => esre("+")).toThrow(EsreError);
    expect(() => esre("?")).toThrow(EsreError);
  });

  it("invalid hex escape throws EsreError", () => {
    expect(() => esre("\\xGG")).toThrow(EsreError);
  });

  it("\\N{name} throws EsreError", () => {
    expect(() => esre("\\N{LATIN SMALL LETTER A}")).toThrow(EsreError);
  });

  it("EsreError has correct name property", () => {
    try {
      esre("(abc");
    } catch (e) {
      expect(e).toBeInstanceOf(EsreError);
      expect((e as EsreError).name).toBe("EsreError");
    }
  });

  it("EsreError includes position for parser errors", () => {
    try {
      esre("[abc");
    } catch (e) {
      expect(e).toBeInstanceOf(EsreError);
      expect((e as EsreError).position).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 35. Scoped modifiers
// ---------------------------------------------------------------------------
describe("Scoped modifiers", () => {
  it("(?i:...) applies case-insensitive matching only within scope", () => {
    const re = esre("(?i:hello) world");
    expect(re.test("HELLO world")).toBe(true);
    expect(re.test("HELLO WORLD")).toBe(false); // 'world' is outside (?i:...)
  });

  it("(?-i:...) disables case-insensitive matching within scope", () => {
    const re = esre("(?-i:hello) world", "i");
    expect(re.test("hello WORLD")).toBe(true);
    expect(re.test("HELLO WORLD")).toBe(false); // hello is in (?-i:...)
  });

  it("(?s:...) applies dotAll only within scope", () => {
    const re = esre("(?s:a.b)c.d");
    expect(re.test("a\nbcxd")).toBe(true);
    expect(re.test("a\nbc\nd")).toBe(false); // second dot outside (?s:...)
  });

  it("(?m:...) applies multiline only within scope", () => {
    const re = esre("(?m:^foo)");
    expect(re.test("bar\nfoo")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Additional edge cases and integration tests
// ---------------------------------------------------------------------------
describe("Edge cases", () => {
  it("empty group ()", () => {
    const re = esre("()a");
    const m = "a".match(re);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("");
  });

  it("nested groups", () => {
    const re = esre("((a)(b))");
    const m = "ab".match(re);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("ab");
    expect(m?.[2]).toBe("a");
    expect(m?.[3]).toBe("b");
  });

  it("alternation in groups", () => {
    const re = esre("(a|b)(c|d)");
    expect("ac".match(re)).not.toBeNull();
    expect("bd".match(re)).not.toBeNull();
    expect("ae".match(re)).toBeNull();
  });

  it("quantifier on group", () => {
    const re = esre("^(ab)+$");
    expect(re.test("ababab")).toBe(true);
    expect(re.test("ab")).toBe(true);
    expect(re.test("abc")).toBe(false);
  });

  it("quantifier on character class", () => {
    const re = esre("^[abc]{3}$");
    expect(re.test("abc")).toBe(true);
    expect(re.test("ab")).toBe(false);
    expect(re.test("abcd")).toBe(false);
  });

  it("escaped metacharacters", () => {
    const re = esre("\\(hello\\)");
    expect(re.test("(hello)")).toBe(true);
    expect(re.test("hello")).toBe(false);
  });

  it("escaped dot matches literal dot", () => {
    const re = esre("a\\.b");
    expect(re.test("a.b")).toBe(true);
    expect(re.test("axb")).toBe(false);
  });

  it("\\t matches tab", () => {
    const re = esre("\\t");
    expect(re.test("\t")).toBe(true);
  });

  it("\\n matches newline", () => {
    const re = esre("\\n");
    expect(re.test("\n")).toBe(true);
  });

  it("\\r matches carriage return", () => {
    const re = esre("\\r");
    expect(re.test("\r")).toBe(true);
  });

  it("\\f matches form feed", () => {
    const re = esre("\\f");
    expect(re.test("\f")).toBe(true);
  });

  it("\\v matches vertical tab", () => {
    const re = esre("\\v");
    expect(re.test("\v")).toBe(true);
  });

  it("\\x hex escape works", () => {
    const re = esre("\\x41"); // 0x41 = 'A'
    expect(re.test("A")).toBe(true);
    expect(re.test("B")).toBe(false);
  });

  it("complex Python regex: email-like pattern", () => {
    const re = esre(
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
    const re = esre(
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
    const re = esre("^}$");
    expect(re.test("}")).toBe(true);
  });

  it("{ is treated as literal when not valid quantifier", () => {
    const re = esre("^{$");
    expect(re.test("{")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unicode shorthand inside character classes
// ---------------------------------------------------------------------------
describe("Unicode shorthands inside character classes", () => {
  it("[\\d] in Unicode mode matches Unicode digits", () => {
    const re = esre("^[\\d]+$"); // default Unicode mode
    expect(re.test("123")).toBe(true);
    expect(re.test("\u0660\u0661\u0662")).toBe(true); // Arabic-Indic digits
  });

  it("[\\s] in Unicode mode matches Unicode whitespace", () => {
    const re = esre("^[\\s]+$");
    expect(re.test(" \t\n")).toBe(true);
    expect(re.test("\u00A0")).toBe(true); // no-break space
  });

  it("[\\D] negated shorthand in Unicode mode", () => {
    const re = esre("^[\\D]+$");
    expect(re.test("abc")).toBe(true);
    expect(re.test("123")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multiple features combined
// ---------------------------------------------------------------------------
describe("Combined features", () => {
  it("named groups + verbose mode + flags", () => {
    const re = esre(
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
    const re = esre("(?<=\\()\\d+(?=\\))", "", { ascii: true });
    const m = "(123)".match(re);
    expect(m).not.toBeNull();
    expect(m?.[0]).toBe("123");
  });

  it("alternation + backreferences", () => {
    const re = esre("(a|b)\\1", "", { ascii: true });
    expect(re.test("aa")).toBe(true);
    expect(re.test("bb")).toBe(true);
    expect(re.test("ab")).toBe(false);
    expect(re.test("ba")).toBe(false);
  });

  it("\\A and \\Z together to match full string", () => {
    const re = esre("\\Ahello\\Z");
    expect(re.test("hello")).toBe(true);
    expect(re.test("hello world")).toBe(false);
    expect(re.test("say hello")).toBe(false);
  });

  it("Unicode \\w with named groups", () => {
    const re = esre("(?P<word>\\w+)");
    const m = "café".match(re);
    expect(m).not.toBeNull();
    expect(m?.groups?.word).toBe("café");
  });

  it("comment groups interspersed in complex pattern", () => {
    const re = esre(
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
    const re = esre("hello");
    expect(re).toBeInstanceOf(RegExp);
  });

  it("i flag appears in output", () => {
    const re = esre("hello", "i");
    expect(re.flags).toContain("i");
  });

  it("m flag appears in output", () => {
    const re = esre("hello", "m");
    expect(re.flags).toContain("m");
  });

  it("s flag appears in output", () => {
    const re = esre("hello", "s");
    expect(re.flags).toContain("s");
  });

  it("v flag appears in output when Unicode mode", () => {
    const re = esre("\\w");
    expect(re.flags).toContain("v");
  });

  it("no v flag in ASCII mode", () => {
    const re = esre("\\w", "", { ascii: true });
    expect(re.flags).not.toContain("v");
  });

  it("inline (?i) flag propagates to output", () => {
    const re = esre("(?i)hello");
    expect(re.flags).toContain("i");
  });
});

// ---------------------------------------------------------------------------
// Default options behavior
// ---------------------------------------------------------------------------
describe("Default options", () => {
  it("Unicode mode is the default", () => {
    const re = esre("^\\w+$");
    // Unicode mode means accented chars match \w
    expect(re.test("café")).toBe(true);
  });

  it("strict mode is the default", () => {
    expect(() => esre("a*+")).toThrow(EsreError);
  });

  it("options can be partially provided", () => {
    // Only provide ascii, strict should still be the default
    expect(() => esre("a*+", "", { ascii: true })).toThrow(EsreError);
  });

  it("flags parameter defaults to empty string", () => {
    const re = esre("hello");
    // No flags means no i, m, s
    expect(re.flags).not.toContain("i");
    expect(re.flags).not.toContain("m");
    expect(re.flags).not.toContain("s");
  });
});
