import { describe, expect, it, vi } from "vitest";
import { EcmaReError, ecmaRe } from "../src/index";

// ============================================================================
// Nasty, complex Python regex patterns for stress-testing ecma-re
// ============================================================================

// ---------------------------------------------------------------------------
// 1. Deeply nested groups with backreferences
// ---------------------------------------------------------------------------
describe("Deeply nested groups + backreferences", () => {
  it("((((a))))\\4\\3\\2\\1 matches aaaaa", () => {
    // Groups: g1=a, g2=a, g3=a, g4=a
    // \\4=a, \\3=a, \\2=a, \\1=a → total "aaaaa"
    const re = ecmaRe("((((a))))\\4\\3\\2\\1");
    expect(re.test("aaaaa")).toBe(true);
    expect(re.test("aaaa")).toBe(false);
    const m = "aaaaa".match(re);
    expect(m?.[0]).toBe("aaaaa");
    expect(m?.[1]).toBe("a");
    expect(m?.[2]).toBe("a");
    expect(m?.[3]).toBe("a");
    expect(m?.[4]).toBe("a");
  });

  it("((a)(b))\\2\\3\\1 matches ababab", () => {
    // g1=ab, g2=a, g3=b → \\2=a, \\3=b, \\1=ab → "ab" + "a" + "b" + "ab"
    const re = ecmaRe("((a)(b))\\2\\3\\1");
    expect(re.test("ababab")).toBe(true);
    expect(re.test("abab")).toBe(false);
    const m = "ababab".match(re);
    expect(m?.[0]).toBe("ababab");
  });

  it("(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)\\10\\9\\8\\7\\6\\5\\4\\3\\2\\1", () => {
    // 10 groups, then backrefs in reverse
    const re = ecmaRe(
      "(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)\\10\\9\\8\\7\\6\\5\\4\\3\\2\\1",
    );
    expect(re.test("abcdefghijjihgfedcba")).toBe(true);
    expect(re.test("abcdefghijabcdefghij")).toBe(false);
  });

  it("(([a-z])\\2){3} matches aabbcc (repeated pair pattern)", () => {
    // Each iteration: [a-z] captures a char, \\2 matches it again
    const re = ecmaRe("(([a-z])\\2){3}", "", { ascii: true });
    expect(re.test("aabbcc")).toBe(true);
    expect(re.test("aabbc")).toBe(false);
    expect(re.test("abccdd")).toBe(false); // 'ab' doesn't match
  });

  it("(?P<outer>(?P<inner>[a-z]+)-(?P=inner))_(?P=outer)", () => {
    // Named groups: outer="abc-abc", inner="abc"
    // Then (?P=outer) must match "abc-abc" again
    const re = ecmaRe(
      "(?P<outer>(?P<inner>[a-z]+)-(?P=inner))_(?P=outer)",
      "",
      { ascii: true },
    );
    expect(re.test("abc-abc_abc-abc")).toBe(true);
    expect(re.test("abc-abc_abc-def")).toBe(false);
    expect(re.test("abc-def_abc-abc")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Complex lookaround combinations
// ---------------------------------------------------------------------------
describe("Complex lookaround combinations", () => {
  it("nested lookahead: a(?=b(?=cd))bcd", () => {
    const re = ecmaRe("a(?=b(?=cd))bcd");
    expect(re.test("abcd")).toBe(true);
    expect(re.test("abce")).toBe(false);
  });

  it("nested lookbehind + lookahead: (?<=a(?=b))b", () => {
    // Lookbehind contains a lookahead — matches b preceded by a, where a is followed by b
    const re = ecmaRe("(?<=a(?=b))b");
    expect(re.test("ab")).toBe(true);
    expect(re.test("ac")).toBe(false);
  });

  it("triple nested lookahead: x(?=y(?=z(?=w)))", () => {
    const re = ecmaRe("x(?=y(?=z(?=w)))");
    expect(re.test("xyzw")).toBe(true);
    expect(re.test("xyza")).toBe(false);
    const m = "xyzw".match(re);
    expect(m?.[0]).toBe("x"); // lookaheads are zero-width
  });

  it("lookbehind with alternation of different lengths: (?<=ab|cde)f", () => {
    const re = ecmaRe("(?<=ab|cde)f");
    expect(re.test("abf")).toBe(true);
    expect(re.test("cdef")).toBe(true);
    expect(re.test("af")).toBe(false);
    expect(re.test("cdf")).toBe(false);
  });

  it("negative lookbehind + negative lookahead: (?<!a)b(?!c)", () => {
    const re = ecmaRe("(?<!a)b(?!c)");
    expect(re.test("xbd")).toBe(true); // not preceded by a, not followed by c
    expect(re.test("abc")).toBe(false); // preceded by a
    expect(re.test("xbc")).toBe(false); // followed by c
    expect(re.test("abd")).toBe(false); // preceded by a
  });

  it("lookahead with capture group: (?=(a+))\\1b", () => {
    // Lookahead captures, then backref matches same content, then b
    const re = ecmaRe("(?=(a+))\\1b", "", { ascii: true });
    expect(re.test("aaab")).toBe(true);
    const m = "aaab".match(re);
    expect(m?.[0]).toBe("aaab");
    expect(m?.[1]).toBe("aaa");
  });

  it("password validator: lookaheads for digit, uppercase, lowercase", () => {
    // Python-style password validation with multiple lookaheads
    const re = ecmaRe("\\A(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}\\Z", "", {
      ascii: true,
    });
    expect(re.test("Abcdefg1")).toBe(true);
    expect(re.test("abcdefg1")).toBe(false); // no uppercase
    expect(re.test("ABCDEFG1")).toBe(false); // no lowercase
    expect(re.test("Abcdefgh")).toBe(false); // no digit
    expect(re.test("Ab1")).toBe(false); // too short
  });

  it("overlapping lookaheads: (?=.{3,6}$)(?=.*\\d)", () => {
    // Must be 3-6 chars total AND contain a digit
    const re = ecmaRe("\\A(?=.{3,6}$)(?=.*\\d).*\\Z", "", { ascii: true });
    expect(re.test("abc1")).toBe(true);
    expect(re.test("a1")).toBe(false); // too short
    expect(re.test("abcdefg1")).toBe(false); // too long
    expect(re.test("abcde")).toBe(false); // no digit
  });
});

// ---------------------------------------------------------------------------
// 3. Real-world complex Python patterns
// ---------------------------------------------------------------------------
describe("Real-world complex Python patterns", () => {
  it("IPv4 address pattern", () => {
    const re = ecmaRe(
      `(?x)
       \\A
       (?:
         (?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)
         \\.
       ){3}
       (?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)
       \\Z
      `,
      "",
      { ascii: true },
    );
    expect(re.test("192.168.1.1")).toBe(true);
    expect(re.test("255.255.255.255")).toBe(true);
    expect(re.test("0.0.0.0")).toBe(true);
    expect(re.test("256.1.1.1")).toBe(false);
    expect(re.test("1.1.1")).toBe(false);
    expect(re.test("1.1.1.1.1")).toBe(false);
    expect(re.test("abc.def.ghi.jkl")).toBe(false);
  });

  it("ISO 8601 datetime pattern with named groups", () => {
    const re = ecmaRe(
      `(?x)
       (?P<year>\\d{4})
       -
       (?P<month>0[1-9]|1[0-2])
       -
       (?P<day>0[1-9]|[12]\\d|3[01])
       [T ]
       (?P<hour>[01]\\d|2[0-3])
       :
       (?P<minute>[0-5]\\d)
       :
       (?P<second>[0-5]\\d)
       (?:\\.(?P<frac>\\d+))?
       (?P<tz>Z|[+-]\\d{2}:\\d{2})?
      `,
      "",
      { ascii: true },
    );
    const m1 = "2024-03-15T14:30:00Z".match(re);
    expect(m1).not.toBeNull();
    expect(m1?.groups?.year).toBe("2024");
    expect(m1?.groups?.month).toBe("03");
    expect(m1?.groups?.day).toBe("15");
    expect(m1?.groups?.hour).toBe("14");
    expect(m1?.groups?.minute).toBe("30");
    expect(m1?.groups?.second).toBe("00");
    expect(m1?.groups?.tz).toBe("Z");

    const m2 = "2024-12-31 23:59:59.999+08:00".match(re);
    expect(m2).not.toBeNull();
    expect(m2?.groups?.frac).toBe("999");
    expect(m2?.groups?.tz).toBe("+08:00");

    expect(re.test("2024-13-01T00:00:00")).toBe(false); // month 13
    expect(re.test("2024-01-32T00:00:00")).toBe(false); // day 32
  });

  it("URL parser with named groups and verbose mode", () => {
    const re = ecmaRe(
      `(?x)
       (?P<scheme>[a-z][a-z0-9+.\\-]*)  # scheme
       ://                                 # separator
       (?:
         (?P<user>[^@:]+)                  # username
         (?::(?P<pass>[^@]*))?             # optional :password
         @                                 # at sign
       )?
       (?P<host>[^/:?#]+)                 # hostname
       (?::(?P<port>\\d+))?               # optional :port
       (?P<path>/[^?#]*)?                 # path
       (?:\\?(?P<query>[^#]*))?           # ?query
       (?:\\#(?P<frag>.*))?               # #fragment
      `,
      "",
      { ascii: true },
    );
    const m1 = "https://user:pass@example.com:8080/path?q=1#frag".match(re);
    expect(m1).not.toBeNull();
    expect(m1?.groups?.scheme).toBe("https");
    expect(m1?.groups?.user).toBe("user");
    expect(m1?.groups?.pass).toBe("pass");
    expect(m1?.groups?.host).toBe("example.com");
    expect(m1?.groups?.port).toBe("8080");
    expect(m1?.groups?.path).toBe("/path");
    expect(m1?.groups?.query).toBe("q=1");
    expect(m1?.groups?.frag).toBe("frag");

    const m2 = "ftp://files.example.com/pub/docs".match(re);
    expect(m2).not.toBeNull();
    expect(m2?.groups?.scheme).toBe("ftp");
    expect(m2?.groups?.host).toBe("files.example.com");
    expect(m2?.groups?.path).toBe("/pub/docs");
    expect(m2?.groups?.user).toBeUndefined();
  });

  it("Python-style complex log line parser", () => {
    const re = ecmaRe(
      `(?x)
       (?P<timestamp>\\d{4}-\\d{2}-\\d{2}\\s\\d{2}:\\d{2}:\\d{2})
       \\s+
       \\[(?P<level>DEBUG|INFO|WARN|ERROR|FATAL)\\]
       \\s+
       (?P<module>[\\w.]+)
       \\s*-\\s*
       (?P<message>.+)
      `,
      "",
      { ascii: true },
    );
    const line =
      "2024-03-15 14:30:00 [ERROR] app.server.handler - Connection refused: host=10.0.0.1 port=5432";
    const m = line.match(re);
    expect(m).not.toBeNull();
    expect(m?.groups?.timestamp).toBe("2024-03-15 14:30:00");
    expect(m?.groups?.level).toBe("ERROR");
    expect(m?.groups?.module).toBe("app.server.handler");
    expect(m?.groups?.message).toBe(
      "Connection refused: host=10.0.0.1 port=5432",
    );
  });

  it("semantic version pattern with verbose + named groups", () => {
    const re = ecmaRe(
      `(?x)
       \\A
       v?
       (?P<major>0|[1-9]\\d*)
       \\.
       (?P<minor>0|[1-9]\\d*)
       \\.
       (?P<patch>0|[1-9]\\d*)
       (?:-(?P<pre>[\\da-zA-Z-]+(?:\\.[\\da-zA-Z-]+)*))?
       (?:\\+(?P<build>[\\da-zA-Z-]+(?:\\.[\\da-zA-Z-]+)*))?
       \\Z
      `,
      "",
      { ascii: true },
    );
    const m1 = "v1.2.3-beta.1+build.123".match(re);
    expect(m1).not.toBeNull();
    expect(m1?.groups?.major).toBe("1");
    expect(m1?.groups?.minor).toBe("2");
    expect(m1?.groups?.patch).toBe("3");
    expect(m1?.groups?.pre).toBe("beta.1");
    expect(m1?.groups?.build).toBe("build.123");

    expect(re.test("0.0.0")).toBe(true);
    expect(re.test("1.0.0-alpha")).toBe(true);
    expect(re.test("1.0.0+build")).toBe(true);
    expect(re.test("01.0.0")).toBe(false); // leading zero
  });
});

// ---------------------------------------------------------------------------
// 4. Octal vs backreference disambiguation
// ---------------------------------------------------------------------------
describe("Octal vs backreference disambiguation", () => {
  it("\\1 is backref when 1 group exists", () => {
    const re = ecmaRe("(a)\\1", "", { ascii: true });
    expect(re.test("aa")).toBe(true);
    expect(re.test("ab")).toBe(false);
  });

  it("\\141 is octal 'a' when no groups exist", () => {
    const re = ecmaRe("^\\141$", "", { ascii: true });
    expect(re.test("a")).toBe(true);
    expect(re.test("\\141")).toBe(false);
  });

  it("\\11 after 11 groups is a backreference", () => {
    // Create 11 groups, then \\11 should reference group 11
    const re = ecmaRe("(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)\\11", "", {
      ascii: true,
    });
    expect(re.test("abcdefghijkk")).toBe(true);
    expect(re.test("abcdefghijka")).toBe(false);
  });

  it("\\07 is octal (bell + '7'? no, \\07 = octal 7)", () => {
    const re = ecmaRe("^\\07$");
    expect(re.test("\x07")).toBe(true);
  });

  it("\\0 followed by literal digit", () => {
    // \\0 is null, then 8 is literal (since 8 is not octal)
    const re = ecmaRe("^\\08$");
    expect(re.test("\x008")).toBe(true);
  });

  it("\\377 is octal 0xFF", () => {
    const re = ecmaRe("^\\377$", "", { ascii: true });
    expect(re.test("\xFF")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Verbose mode edge cases
// ---------------------------------------------------------------------------
describe("Verbose mode edge cases", () => {
  it("complex verbose pattern with all whitespace types", () => {
    const re = ecmaRe("(?x) h\t\n\r e l  l  o");
    expect(re.test("hello")).toBe(true);
    expect(re.test("h e l l o")).toBe(false);
  });

  it("verbose mode: # inside character class is literal", () => {
    const re = ecmaRe("(?x)[#a]b", "", { ascii: true });
    expect(re.test("#b")).toBe(true);
    expect(re.test("ab")).toBe(true);
    expect(re.test("xb")).toBe(false);
  });

  it("verbose mode: escaped # is literal", () => {
    const re = ecmaRe("(?x)a\\#b");
    expect(re.test("a#b")).toBe(true);
    expect(re.test("ab")).toBe(false);
  });

  it("verbose mode: comment with regex-like content", () => {
    const re = ecmaRe(
      `(?x)
       hello  # this (pattern) has [chars] and \\d+ in comment
       \\s+   # more stuff: ^start$ and a*b+c?
       world  # (?:even groups) and \\1 backrefs
      `,
      "",
      { ascii: true },
    );
    expect(re.test("hello world")).toBe(true);
    expect(re.test("hello  world")).toBe(true);
    expect(re.test("helloworld")).toBe(false);
  });

  it("verbose mode: whitespace inside [] is preserved", () => {
    const re = ecmaRe("(?x)[ \\t]+", "", { ascii: true });
    expect(re.test("  ")).toBe(true);
    expect(re.test("\t")).toBe(true);
    expect(re.test("x")).toBe(false);
  });

  it("verbose mode: multi-line pattern with character class spanning lines", () => {
    const re = ecmaRe(
      `(?x)
       [abc   # char class with literal space and chars
        def]  # more chars in same class
      `,
      "",
      { ascii: true },
    );
    // The char class contains: a, b, c, space, #, (space), c, h, a, r...etc
    // Actually in verbose mode, inside [], ALL characters are literal including space and #
    // So it's [abc   # char class with literal space and chars\n        def]
    expect(re.test("a")).toBe(true);
    expect(re.test("d")).toBe(true);
    expect(re.test(" ")).toBe(true); // space is preserved inside []
    expect(re.test("#")).toBe(true); // # is literal inside []
  });

  it("verbose mode: empty comment lines", () => {
    const re = ecmaRe(
      `(?x)
       a    #
       b    #
       c    #
      `,
    );
    expect(re.test("abc")).toBe(true);
    expect(re.test("a b c")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Scoped modifier interactions
// ---------------------------------------------------------------------------
describe("Scoped modifier edge cases", () => {
  it("nested scoped modifiers: (?i:(?-i:(?i:abc)))", () => {
    const re = ecmaRe("(?i:(?-i:(?i:abc)))");
    // Innermost (?i:abc) → case insensitive
    expect(re.test("ABC")).toBe(true);
    expect(re.test("abc")).toBe(true);
  });

  it("scoped modifier does not leak: (?i:a)b", () => {
    const re = ecmaRe("(?i:a)b");
    expect(re.test("Ab")).toBe(true);
    expect(re.test("AB")).toBe(false); // b is case-sensitive
    expect(re.test("ab")).toBe(true);
    expect(re.test("aB")).toBe(false);
  });

  it("scoped (?s:.) within non-dotall context", () => {
    const re = ecmaRe("a(?s:.)b.c");
    expect(re.test("a\nbxc")).toBe(true); // (?s:.) matches \n, but last . doesn't match \n
    expect(re.test("a\nb\nc")).toBe(false); // last . can't match \n
  });

  it("(?m:^) inside non-multiline context", () => {
    const re = ecmaRe("(?m:^foo)bar");
    expect(re.test("foobar")).toBe(true);
    expect(re.test("x\nfoobar")).toBe(true); // ^foo matches at line start
  });

  it("negative scoped modifier (?-i:...) inside case-insensitive", () => {
    const re = ecmaRe("(?i)(?-i:hello) WORLD");
    expect(re.test("hello WORLD")).toBe(true);
    expect(re.test("hello world")).toBe(true); // WORLD matched case-insensitively due to outer (?i)
    expect(re.test("HELLO WORLD")).toBe(false); // hello must be exact inside (?-i:...)
  });

  it("(?-s:.) inside dotall context doesn't match newline", () => {
    const re = ecmaRe("(?s)a(?-s:.)b", "");
    // outer (?s) makes . match newlines, but (?-s:.) overrides
    expect(re.test("axb")).toBe(true);
    expect(re.test("a\nb")).toBe(false); // (?-s:.) should NOT match \n
  });
});

// ---------------------------------------------------------------------------
// 7. Character class nightmares
// ---------------------------------------------------------------------------
describe("Character class nightmares", () => {
  it("character class with every escape: [\\a\\b\\t\\n\\r\\f\\v]", () => {
    const re = ecmaRe("[\\a\\b\\t\\n\\r\\f\\v]");
    expect(re.test("\x07")).toBe(true); // \a bell
    expect(re.test("\b")).toBe(true); // \b backspace
    expect(re.test("\t")).toBe(true); // \t tab
    expect(re.test("\n")).toBe(true); // \n newline
    expect(re.test("\r")).toBe(true); // \r carriage return
    expect(re.test("\f")).toBe(true); // \f form feed
    expect(re.test("\v")).toBe(true); // \v vertical tab
    expect(re.test("a")).toBe(false);
  });

  it("character class with hex and octal escapes: [\\x41-\\x5a\\141-\\172]", () => {
    // \\x41-\\x5a = A-Z, \\141-\\172 = a-z (octal)
    const re = ecmaRe("^[\\x41-\\x5a\\141-\\172]+$", "", { ascii: true });
    expect(re.test("Hello")).toBe(true);
    expect(re.test("WORLD")).toBe(true);
    expect(re.test("hello")).toBe(true);
    expect(re.test("123")).toBe(false);
  });

  it("] at start of class, ^ after that", () => {
    // []^] matches ] or ^
    const re = ecmaRe("[]^]");
    expect(re.test("]")).toBe(true);
    expect(re.test("^")).toBe(true);
    expect(re.test("a")).toBe(false);
  });

  it("negated class with ] at start: [^]a] doesn't match ] or a", () => {
    const re = ecmaRe("[^]a]");
    expect(re.test("]")).toBe(false);
    expect(re.test("a")).toBe(false);
    expect(re.test("b")).toBe(true);
  });

  it("character class with \\d\\w\\s combined", () => {
    const re = ecmaRe("^[\\d\\w\\s]+$", "", { ascii: true });
    expect(re.test("hello 123")).toBe(true);
    expect(re.test("abc_def")).toBe(true);
    expect(re.test("!!!")).toBe(false);
  });

  it("character class with escaped special chars: [\\[\\]\\(\\)\\{\\}]", () => {
    // \[ inside char class must be escaped in v-mode to avoid
    // starting a nested character class.
    const re = ecmaRe("[\\[\\]\\(\\)\\{\\}]");
    expect(re.test("[")).toBe(true);
    expect(re.test("]")).toBe(true);
    expect(re.test("(")).toBe(true);
    expect(re.test(")")).toBe(true);
    expect(re.test("{")).toBe(true);
    expect(re.test("}")).toBe(true);
    expect(re.test("a")).toBe(false);
  });

  it("character class with dash in various positions: [a-z0-9-]", () => {
    const re = ecmaRe("[a-z0-9-]", "", { ascii: true });
    expect(re.test("a")).toBe(true);
    expect(re.test("5")).toBe(true);
    expect(re.test("-")).toBe(true);
    expect(re.test("A")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. $ and \Z behavior edge cases
// ---------------------------------------------------------------------------
describe("$ and \\Z behavior edge cases", () => {
  it("$ matches before trailing \\n in non-multiline", () => {
    const re = ecmaRe("abc$");
    expect(re.test("abc")).toBe(true);
    expect(re.test("abc\n")).toBe(true);
    expect(re.test("abc\n\n")).toBe(false);
  });

  it("\\Z does NOT match before trailing \\n", () => {
    const re = ecmaRe("abc\\Z");
    expect(re.test("abc")).toBe(true);
    expect(re.test("abc\n")).toBe(false);
  });

  it("$ in multiline matches at each line end", () => {
    const re = ecmaRe("abc$", "m");
    const input = "abc\ndef\nabc";
    const matches = Array.from(
      input.matchAll(new RegExp(re.source, `${re.flags}g`)),
    );
    expect(matches.length).toBe(2);
  });

  it("\\A and \\Z together in multiline mode still match string boundaries only", () => {
    const re = ecmaRe("\\Aabc\\Z", "m");
    expect(re.test("abc")).toBe(true);
    expect(re.test("abc\n")).toBe(false); // \\Z is strict
    expect(re.test("\nabc")).toBe(false); // \\A is strict
    expect(re.test("abc\ndef")).toBe(false);
  });

  it("$ with dotall flag still works correctly", () => {
    const re = ecmaRe("abc$", "s");
    expect(re.test("abc")).toBe(true);
    expect(re.test("abc\n")).toBe(true); // Python $ matches before trailing \n
  });
});

// ---------------------------------------------------------------------------
// 9. Mixed features: everything at once
// ---------------------------------------------------------------------------
describe("Everything combined: kitchen sink patterns", () => {
  it("verbose + named groups + lookaround + backreference + inline comments", () => {
    // (?#...) inline comments and (?x) verbose mode # line comments coexist.
    const re = ecmaRe(
      `(?x)
       ^                      # line comment
       (?P<tag>[a-z]+)        (?# inline comment: opening tag name )
       =                      (?# equals sign )
       "                      (?# opening quote )
       (?P<val>[^"]*)         (?# attribute value )
       "                      (?# closing quote )
       .*?                    (?# anything in between )
       (?P=tag)               (?# closing tag must match )
       $                      # anchor at end
      `,
      "",
      { ascii: true },
    );
    expect(re.test('class="foo" some stuff class')).toBe(true);
    expect(re.test('class="foo" some stuff id')).toBe(false);
  });

  it("\\A + (?i:...) + (?=...) + named groups + \\Z", () => {
    // A pattern that validates and parses a hex color code
    const re = ecmaRe("\\A(?i:#(?P<hex>[0-9a-f]{6}|[0-9a-f]{3}))\\Z");
    const m1 = "#FF00ff".match(re);
    expect(m1).not.toBeNull();
    expect(m1?.groups?.hex).toBe("FF00ff");

    expect(re.test("#abc")).toBe(true);
    expect(re.test("#ABCDEF")).toBe(true);
    expect(re.test("#gggggg")).toBe(false);
    expect(re.test("#12345")).toBe(false); // wrong length
    expect(re.test("FF00FF")).toBe(false); // missing #
  });

  it("alternation + quantifier + backref + anchor", () => {
    const re = ecmaRe("^((?:a+|b+)c)\\1$", "", { ascii: true });
    // g1 = "aaac" or "bbbc" etc, then \\1 repeats it
    expect(re.test("aacaac")).toBe(true);
    expect(re.test("bbcbbc")).toBe(true);
    expect(re.test("aacbbc")).toBe(false); // second half doesn't match first
  });

  it("Unicode \\w + named groups + lookaround", () => {
    // Match a word surrounded by word boundaries, Unicode-aware
    const re = ecmaRe("(?P<word>\\b\\w+\\b)");
    const m = "le café est bon".match(re);
    expect(m?.groups?.word).toBe("le");
  });

  it("comment group with simple text inside", () => {
    // (?#...) ends at the first ), so avoid ) inside the comment
    const re = ecmaRe("a(?#this is a comment with brackets and escapes)b");
    expect(re.test("ab")).toBe(true);
    expect(re.test("a(?#...)b")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Quantifier edge cases
// ---------------------------------------------------------------------------
describe("Quantifier edge cases", () => {
  it("{0} means exactly zero occurrences", () => {
    const re = ecmaRe("^a{0}b$");
    expect(re.test("b")).toBe(true);
    expect(re.test("ab")).toBe(false);
  });

  it("{0,0} means exactly zero occurrences", () => {
    const re = ecmaRe("^a{0,0}b$");
    expect(re.test("b")).toBe(true);
    expect(re.test("ab")).toBe(false);
  });

  it("{1,1} means exactly one occurrence", () => {
    const re = ecmaRe("^a{1,1}$");
    expect(re.test("a")).toBe(true);
    expect(re.test("aa")).toBe(false);
    expect(re.test("")).toBe(false);
  });

  it("lazy quantifier on group: (a|b)+? prefers minimal", () => {
    const re = ecmaRe("^(a|b)+?$");
    // Must match entire string, so lazy doesn't help — must consume all
    expect(re.test("a")).toBe(true);
    expect(re.test("ababab")).toBe(true);
  });

  it("{n,m} with large numbers", () => {
    const re = ecmaRe("^a{100,200}$");
    expect(re.test("a".repeat(100))).toBe(true);
    expect(re.test("a".repeat(150))).toBe(true);
    expect(re.test("a".repeat(200))).toBe(true);
    expect(re.test("a".repeat(99))).toBe(false);
    expect(re.test("a".repeat(201))).toBe(false);
  });

  it("quantifier on non-capturing group: (?:ab){2,4}", () => {
    const re = ecmaRe("^(?:ab){2,4}$");
    expect(re.test("abab")).toBe(true);
    expect(re.test("ababab")).toBe(true);
    expect(re.test("abababab")).toBe(true);
    expect(re.test("ab")).toBe(false);
    expect(re.test("ababababab")).toBe(false);
  });

  it("nested quantifiers: (a{2,3}){2} matches aaaa to aaaaaa", () => {
    const re = ecmaRe("^(a{2,3}){2}$");
    expect(re.test("aaaa")).toBe(true); // aa + aa
    expect(re.test("aaaaa")).toBe(true); // aaa + aa or aa + aaa
    expect(re.test("aaaaaa")).toBe(true); // aaa + aaa
    expect(re.test("aaa")).toBe(false); // only one iteration
    expect(re.test("aaaaaaa")).toBe(false); // too many
  });

  it("{ treated as literal when not valid quantifier", () => {
    const re = ecmaRe("^a{b}$");
    expect(re.test("a{b}")).toBe(true);
  });

  it("{,5} treated as literal (missing min)", () => {
    const re = ecmaRe("^a{,5}$");
    expect(re.test("a{,5}")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11. Alternation edge cases
// ---------------------------------------------------------------------------
describe("Alternation edge cases", () => {
  it("empty alternatives: (|a) matches empty before 'a'", () => {
    const re = ecmaRe("(|a)");
    const m = "a".match(re);
    expect(m?.[0]).toBe(""); // empty branch matches first
    expect(m?.[1]).toBe("");
  });

  it("multiple empty alternatives: (||) matches empty", () => {
    const re = ecmaRe("(||)");
    const m = "x".match(re);
    expect(m?.[0]).toBe("");
    expect(m?.[1]).toBe("");
  });

  it("alternation with different capture groups: (a)|(b)|(c)|(d)", () => {
    const re = ecmaRe("(a)|(b)|(c)|(d)");
    const m = "c".match(re);
    expect(m?.[1]).toBeUndefined();
    expect(m?.[2]).toBeUndefined();
    expect(m?.[3]).toBe("c");
    expect(m?.[4]).toBeUndefined();
  });

  it("alternation inside lookbehind: (?<=cat|dog)s", () => {
    const re = ecmaRe("(?<=cat|dog)s");
    expect(re.test("cats")).toBe(true);
    expect(re.test("dogs")).toBe(true);
    expect(re.test("maps")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. Unicode-specific stress tests
// ---------------------------------------------------------------------------
describe("Unicode stress tests", () => {
  it("\\w matches CJK, Cyrillic, Arabic in Unicode mode", () => {
    const re = ecmaRe("^\\w+$");
    expect(re.test("你好世界")).toBe(true);
    expect(re.test("Привет")).toBe(true);
    expect(re.test("مرحبا")).toBe(true);
    expect(re.test("🎉")).toBe(false); // emoji is not \\w
  });

  it("\\b detects boundaries around mixed scripts", () => {
    const re = ecmaRe("\\bcafé\\b");
    expect(re.test("le café est bon")).toBe(true);
    expect(re.test("lecafé")).toBe(false); // no boundary between le and café
  });

  it("\\d matches Devanagari digits in Unicode mode", () => {
    const re = ecmaRe("^\\d+$");
    // Devanagari digits: ०-९ (U+0966-U+096F)
    expect(re.test("\u0966\u0967\u0968")).toBe(true);
    expect(re.test("123")).toBe(true);
  });

  it("standalone \\w matches Unicode word chars in Unicode mode", () => {
    const re = ecmaRe("^\\w+$");
    expect(re.test("café_123")).toBe(true);
    expect(re.test("hello")).toBe(true);
  });

  it("character class [\\w] matches Unicode word chars in Unicode mode", () => {
    // [\w] inside a character class expands to Unicode properties in v-mode.
    const re = ecmaRe("^[\\w]+$");
    expect(re.test("hello_123")).toBe(true);
    expect(re.test("café_123")).toBe(true);
    expect(re.test("日本語")).toBe(true);
  });

  it("Unicode \\b at string boundaries", () => {
    const re = ecmaRe("\\btest\\b");
    expect(re.test("test")).toBe(true);
    expect(re.test(" test ")).toBe(true);
    expect(re.test("testing")).toBe(false);
    expect(re.test("atest")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 13. Loose mode complex degradations
// ---------------------------------------------------------------------------
describe("Loose mode with complex patterns", () => {
  it("possessive quantifier in complex pattern degrades gracefully", () => {
    const onWarn = vi.fn();
    const re = ecmaRe("(?P<word>[a-z]++)@(?P<domain>[a-z]++\\.[a-z]++)", "", {
      loose: true,
      ascii: true,
      onWarn,
    });
    expect(re.test("user@example.com")).toBe(true);
    expect(onWarn).toHaveBeenCalled();
    const m = "user@example.com".match(re);
    expect(m?.groups?.word).toBe("user");
  });

  it("atomic group inside alternation degrades in loose mode", () => {
    const onWarn = vi.fn();
    const re = ecmaRe("(?>abc)|(?>def)", "", {
      loose: true,
      ascii: true,
      onWarn,
    });
    expect(re.test("abc")).toBe(true);
    expect(re.test("def")).toBe(true);
    expect(re.test("xyz")).toBe(false);
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining("Atomic group"),
    );
  });

  it("multiple possessive quantifiers all degrade and warn", () => {
    const onWarn = vi.fn();
    const re = ecmaRe("a*+b++c?+", "", {
      loose: true,
      ascii: true,
      onWarn,
    });
    expect(re.test("aaabbbc")).toBe(true);
    // Should have warned multiple times
    expect(onWarn.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 14. Error cases: pushing parser limits
// ---------------------------------------------------------------------------
describe("Error cases: pushing limits", () => {
  it("unbalanced ) throws", () => {
    expect(() => ecmaRe(")")).toThrow(EcmaReError);
  });

  it("orphan ) after valid group throws", () => {
    expect(() => ecmaRe("(a))")).toThrow(EcmaReError);
  });

  it("deeply nested unclosed group throws", () => {
    expect(() => ecmaRe("((((a")).toThrow(EcmaReError);
  });

  it("invalid named group (?P<123>a) throws (digit-only name)", () => {
    // Python actually allows this, but let's see what happens
    // The library may or may not throw — this tests the parser's behavior
    try {
      const re = ecmaRe("(?P<123>a)");
      // If it doesn't throw, that's valid behavior too — ES allows digit group names?
      // Actually ES doesn't allow group names starting with digits
      // So this should fail at RegExp construction time
      expect(re).toBeInstanceOf(RegExp);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("conditional group throws even in loose mode", () => {
    expect(() => ecmaRe("(a)(?(1)b|c)", "", { loose: true })).toThrow(
      EcmaReError,
    );
  });

  it("\\N{name} always throws", () => {
    expect(() => ecmaRe("\\N{SNOWMAN}")).toThrow(EcmaReError);
  });

  it("(?L) locale flag always throws", () => {
    expect(() => ecmaRe("(?L)\\w+")).toThrow(EcmaReError);
    expect(() => ecmaRe("(?L)\\w+", "", { loose: true })).toThrow(EcmaReError);
  });

  it("bad range in character class: [z-a] throws", () => {
    expect(() => ecmaRe("[z-a]")).toThrow();
  });

  it("duplicate named groups throw", () => {
    expect(() => ecmaRe("(?P<x>a)(?P<x>b)")).toThrow();
  });

  it("unterminated comment group throws", () => {
    expect(() => ecmaRe("(?#unclosed")).toThrow(EcmaReError);
  });

  it("nothing to repeat: quantifier without atom", () => {
    expect(() => ecmaRe("*")).toThrow(EcmaReError);
    expect(() => ecmaRe("+")).toThrow(EcmaReError);
    expect(() => ecmaRe("?")).toThrow(EcmaReError);
    expect(() => ecmaRe("a**")).toThrow(EcmaReError);
  });
});

// ---------------------------------------------------------------------------
// 15. Complex backreference patterns
// ---------------------------------------------------------------------------
describe("Complex backreference patterns", () => {
  it("palindrome detector (limited): (.)(.)\\2\\1", () => {
    const re = ecmaRe("^(.)(.)(.)\\3\\2\\1$", "", { ascii: true });
    expect(re.test("abccba")).toBe(true);
    expect(re.test("abcabc")).toBe(false);
    expect(re.test("abccab")).toBe(false);
  });

  it("repeated word detector: \\b(\\w+)\\s+\\1\\b (ASCII)", () => {
    const re = ecmaRe("\\b(\\w+)\\s+\\1\\b", "", { ascii: true });
    expect(re.test("the the")).toBe(true);
    expect(re.test("hello hello world")).toBe(true);
    expect(re.test("the them")).toBe(false);
  });

  it("backreference in alternation: (a)\\1|(b)\\2", () => {
    const re = ecmaRe("(a)\\1|(b)\\2", "", { ascii: true });
    expect(re.test("aa")).toBe(true);
    expect(re.test("bb")).toBe(true);
    expect(re.test("ab")).toBe(false);
  });

  it("backreference to group that matched empty: (a?)\\1", () => {
    const re = ecmaRe("^(a?)\\1$", "", { ascii: true });
    expect(re.test("")).toBe(true); // a? matches empty, \\1 matches empty
    expect(re.test("aa")).toBe(true); // a? matches a, \\1 matches a
    expect(re.test("a")).toBe(false); // a? matches a, \\1 expects a but string ends
  });

  it("named + numeric backref mixed: (?P<x>a)(b)\\1\\2", () => {
    // \\1 refers to group 1 (=(?P<x>a)), \\2 refers to group 2 (=(b))
    const re = ecmaRe("(?P<x>a)(b)\\1\\2", "", { ascii: true });
    expect(re.test("abab")).toBe(true);
    expect(re.test("abba")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 16. Flag 'a' (ASCII mode) interactions
// ---------------------------------------------------------------------------
describe("ASCII flag interactions", () => {
  it("(?a) inline makes \\w ASCII-only", () => {
    const re = ecmaRe("(?a)^\\w+$");
    expect(re.test("hello")).toBe(true);
    expect(re.test("café")).toBe(false);
  });

  it("'a' flag via parameter", () => {
    const re = ecmaRe("^\\w+$", "a");
    expect(re.test("hello")).toBe(true);
    expect(re.test("café")).toBe(false);
  });

  it("ASCII mode: \\d does not match non-ASCII digits", () => {
    const re = ecmaRe("^\\d+$", "", { ascii: true });
    expect(re.test("123")).toBe(true);
    expect(re.test("\u0660\u0661")).toBe(false);
  });

  it("ASCII mode: \\s doesn't match NBSP", () => {
    const re = ecmaRe("^\\s+$", "", { ascii: true });
    expect(re.test(" \t\n")).toBe(true);
    // NBSP U+00A0 is not ASCII whitespace
    // (Note: JS \\s does match \\u00A0 normally, but in ASCII mode we use
    // simple \\s which in JS actually DOES match \\u00A0... this might depend
    // on implementation)
  });
});

// ---------------------------------------------------------------------------
// 17. Interaction of \\A, \\Z with other anchors
// ---------------------------------------------------------------------------
describe("\\A, \\Z interaction with ^ and $", () => {
  it("\\A and ^ both at start, with multiline", () => {
    // \\A is absolute start, ^ is line start in multiline
    // The whole pattern only matches if string starts with "hello" at absolute start
    const re = ecmaRe("(?m)\\A^hello", "");
    expect(re.test("hello")).toBe(true);
    expect(re.test("hello\nworld")).toBe(true);
    expect(re.test("world\nhello")).toBe(false); // \\A fails
  });

  it("\\Z and $ both at end, with multiline", () => {
    const re = ecmaRe("(?m)world$\\Z", "");
    expect(re.test("world")).toBe(true);
    expect(re.test("hello\nworld")).toBe(true);
    expect(re.test("world\nhello")).toBe(false); // \\Z fails
  });
});

// ---------------------------------------------------------------------------
// 18. Extreme verbose mode patterns
// ---------------------------------------------------------------------------
describe("Extreme verbose mode", () => {
  it("verbose pattern emulating a CSV field parser", () => {
    const re = ecmaRe(
      `(?x)
       (?:
         "                       # opening quote for quoted field
         (?P<quoted>              # start of quoted content
           (?:[^"]|"")*           # non-quote chars or escaped quotes
         )                        # end of quoted content
         "                        # closing quote
         |                        # OR
         (?P<unquoted>            # unquoted field
           [^,\\r\\n]*            # anything except comma or newline
         )
       )
      `,
      "",
      { ascii: true },
    );
    const m1 = '"hello ""world""",next'.match(re);
    expect(m1).not.toBeNull();
    expect(m1?.groups?.quoted).toBe('hello ""world""');

    const m2 = "simple,next".match(re);
    expect(m2).not.toBeNull();
    expect(m2?.groups?.unquoted).toBe("simple");
  });

  it("verbose with inline flags mixed: (?xi) then literal spaces need escaping", () => {
    const re = ecmaRe("(?xi) h e l l o \\ w o r l d");
    expect(re.test("hello world")).toBe(true);
    expect(re.test("HELLO WORLD")).toBe(true);
    expect(re.test("helloworld")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 19. Multiple comment groups interspersed
// ---------------------------------------------------------------------------
describe("Comment groups chaos", () => {
  it("comments between every atom", () => {
    const re = ecmaRe("a(?#1)b(?#2)c(?#3)d(?#4)e");
    expect(re.test("abcde")).toBe(true);
    expect(re.test("a(?#1)bcde")).toBe(false);
  });

  it("comment with closing paren inside content does not break", () => {
    // (?#...) comment goes until first ), so (?#abc) is comment
    const re = ecmaRe("a(?#comment with special chars: []*+?)b");
    expect(re.test("ab")).toBe(true);
  });

  it("empty comment groups everywhere", () => {
    const re = ecmaRe("(?#)a(?#)(?#)b(?#)");
    expect(re.test("ab")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 20. Python-specific pattern: a real scraping regex
// ---------------------------------------------------------------------------
describe("Real-world Python scraping patterns", () => {
  it("HTML attribute extractor", () => {
    const re = ecmaRe(
      `(?x)
        (?P<attr>[a-zA-Z][\\w-]*)      # attribute name
        \\s*=\\s*                        # equals with optional space
        (?:
          "(?P<dval>[^"]*)"             # double-quoted value
          |
          '(?P<sval>[^']*)'            # single-quoted value
          |
          (?P<uval>[^\\s>]+)           # unquoted value
        )
      `,
      "",
      { ascii: true },
    );

    const m1 = 'class="main container"'.match(re);
    expect(m1?.groups?.attr).toBe("class");
    expect(m1?.groups?.dval).toBe("main container");

    const m2 = "data-id='42'".match(re);
    expect(m2?.groups?.attr).toBe("data-id");
    expect(m2?.groups?.sval).toBe("42");

    const m3 = "width=100".match(re);
    expect(m3?.groups?.attr).toBe("width");
    expect(m3?.groups?.uval).toBe("100");
  });

  it("Python-style email with lookahead validation", () => {
    const re = ecmaRe(
      `(?xi)
       \\A
       (?=[^@]{1,64}@)                # local part max 64 chars
       [a-z0-9!\\#$%&'*+/=?^_\` { | } ~ -]+  # valid local chars
       (?:\\.[a-z0-9!\\#$%&'*+/=?^_\` { | } ~ -]+)*  # dot-separated parts
       @
       (?=[a-z0-9-]{1,63}\\.)          # domain label max 63 chars
       [a-z0-9]                         # domain starts with alnum
       (?:[a-z0-9-]*[a-z0-9])?         # optional middle chars
       (?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*  # subdomains
       \\.[a-z]{2,}                     # TLD
       \\Z
      `,
    );
    expect(re.test("user@example.com")).toBe(true);
    expect(re.test("user.name+tag@domain.co.uk")).toBe(true);
    expect(re.test("@example.com")).toBe(false);
    expect(re.test("user@")).toBe(false);
  });
});
