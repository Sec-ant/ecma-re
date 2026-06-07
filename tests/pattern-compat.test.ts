import { describe, expect, it, vi } from "vitest";
import { EcmaReError } from "../src/index";
import { compileEcmaRe } from "./helpers";

describe("nested captures and backreferences", () => {
  it("matches deeply nested numbered backreferences", () => {
    const re = compileEcmaRe("((((a))))\\4\\3\\2\\1");

    expect(re.test("aaaaa")).toBe(true);
    expect(re.test("aaaa")).toBe(false);
    expect("aaaaa".match(re)?.slice(1)).toEqual(["a", "a", "a", "a"]);
  });

  it("matches a tenth backreference without ambiguity", () => {
    const re = compileEcmaRe(
      "(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)\\10\\9\\8\\7\\6\\5\\4\\3\\2\\1",
    );

    expect(re.test("abcdefghijjihgfedcba")).toBe(true);
    expect(re.test("abcdefghijabcdefghij")).toBe(false);
  });

  it("matches nested named groups and named backreferences", () => {
    const re = compileEcmaRe(
      "(?P<outer>(?P<inner>[a-z]+)-(?P=inner))_(?P=outer)",
      "a",
    );

    expect(re.test("abc-abc_abc-abc")).toBe(true);
    expect(re.test("abc-abc_abc-def")).toBe(false);
  });
});

describe("Python syntax transforms", () => {
  it("exposes Python named groups as JavaScript named groups", () => {
    const re = compileEcmaRe("(?P<first>\\w+) (?P<last>\\w+)", "a");

    expect("Ada Lovelace".match(re)?.groups).toMatchObject({
      first: "Ada",
      last: "Lovelace",
    });
  });

  it("exposes Python named backreferences through JavaScript RegExp", () => {
    const re = compileEcmaRe("(?P<word>[a-z]+)=(?P=word)", "a");

    expect(re.test("token=token")).toBe(true);
    expect(re.test("token=value")).toBe(false);
  });

  it("keeps Python absolute anchors distinct from multiline anchors", () => {
    const re = compileEcmaRe("(?m)\\Afoo.*bar\\Z", "s");

    expect(re.test("foo\nbar")).toBe(true);
    expect(re.test("x\nfoo\nbar")).toBe(false);
    expect(re.test("foo\nbar\nx")).toBe(false);
  });

  it("matches a literal backspace control character outside character classes", () => {
    const re = compileEcmaRe("\b", "a");

    expect(re.test("\b")).toBe(true);
    expect(re.test("word")).toBe(false);
  });
});

describe("lookaround combinations", () => {
  it("handles lookbehind with alternatives of the same length", () => {
    const re = compileEcmaRe("(?<=ab|cd)f");

    expect(re.test("abf")).toBe(true);
    expect(re.test("cdf")).toBe(true);
    expect(re.test("af")).toBe(false);
  });

  it("rejects variable-width lookbehind like Python", () => {
    expect(() => compileEcmaRe("(?<=ab|cde)f")).toThrow(EcmaReError);
  });

  it("allows variable-width lookbehind when explicitly enabled", () => {
    const re = compileEcmaRe("(?<=ab|cde)f", "", {
      allowVariableLengthLookbehind: true,
    });

    expect(re.test("abf")).toBe(true);
    expect(re.test("cdef")).toBe(true);
    expect(re.test("af")).toBe(false);
  });

  it("allows fixed-width backreferences inside lookbehind", () => {
    const re = compileEcmaRe("(a)(?<=\\1)b", "a");

    expect(re.test("ab")).toBe(true);
    expect(re.test("bb")).toBe(false);
  });

  it("treats nested lookarounds inside lookbehind as zero-width", () => {
    const re = compileEcmaRe("(?<=(?=a))a", "a");

    expect(re.test("a")).toBe(true);
    expect(re.test("b")).toBe(false);
  });

  it("checks conditional width before rejecting conditionals as unsupported", () => {
    expect(() => compileEcmaRe("(a)?(?<=(?(1)a|b))c", "a")).toThrow(
      EcmaReError,
    );
  });

  it("combines negative lookbehind and negative lookahead", () => {
    const re = compileEcmaRe("(?<!a)b(?!c)");

    expect(re.test("xbd")).toBe(true);
    expect(re.test("abc")).toBe(false);
    expect(re.test("xbc")).toBe(false);
  });

  it("uses captures from lookahead in a later backreference", () => {
    const re = compileEcmaRe("(?=(a+))\\1b", "a");

    expect(re.test("aaab")).toBe(true);
    expect("aaab".match(re)?.[1]).toBe("aaa");
  });
});

describe("real-world Python patterns", () => {
  it("validates IPv4 addresses in verbose mode", () => {
    const re = compileEcmaRe(
      `(?x)
       \\A
       (?:
         (?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)
         \\.
       ){3}
       (?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)
       \\Z
      `,
      "a",
    );

    expect(re.test("192.168.1.1")).toBe(true);
    expect(re.test("255.255.255.255")).toBe(true);
    expect(re.test("256.1.1.1")).toBe(false);
  });

  it("extracts ISO 8601 datetime fields", () => {
    const re = compileEcmaRe(
      `(?x)
       (?P<year>\\d{4})-(?P<month>0[1-9]|1[0-2])-(?P<day>0[1-9]|[12]\\d|3[01])
       [T ]
       (?P<hour>[01]\\d|2[0-3]):(?P<minute>[0-5]\\d):(?P<second>[0-5]\\d)
       (?:\\.(?P<frac>\\d+))?
       (?P<tz>Z|[+-]\\d{2}:\\d{2})?
      `,
      "a",
    );

    const match = "2024-12-31 23:59:59.999+08:00".match(re);
    expect(match?.groups).toMatchObject({
      year: "2024",
      month: "12",
      day: "31",
      frac: "999",
      tz: "+08:00",
    });
    expect(re.test("2024-13-01T00:00:00")).toBe(false);
  });

  it("parses URLs with optional authority parts", () => {
    const re = compileEcmaRe(
      `(?x)
       (?P<scheme>[a-z][a-z0-9+.\\-]*)://
       (?:(?P<user>[^@:]+)(?::(?P<pass>[^@]*))?@)?
       (?P<host>[^/:?#]+)
       (?::(?P<port>\\d+))?
       (?P<path>/[^?#]*)?
       (?:\\?(?P<query>[^#]*))?
       (?:\\#(?P<frag>.*))?
      `,
      "a",
    );

    expect(
      "https://user:pass@example.com:8080/path?q=1#frag".match(re)?.groups,
    ).toMatchObject({
      scheme: "https",
      user: "user",
      pass: "pass",
      host: "example.com",
      port: "8080",
      path: "/path",
      query: "q=1",
      frag: "frag",
    });
    expect(
      "ftp://files.example.com/pub/docs".match(re)?.groups?.user,
    ).toBeUndefined();
  });

  it("parses structured log lines", () => {
    const re = compileEcmaRe(
      `(?x)
       (?P<timestamp>\\d{4}-\\d{2}-\\d{2}\\s\\d{2}:\\d{2}:\\d{2})
       \\s+\\[(?P<level>DEBUG|INFO|WARN|ERROR|FATAL)\\]
       \\s+(?P<module>[\\w.]+)\\s*-\\s*(?P<message>.+)
      `,
      "a",
    );

    const line =
      "2024-03-15 14:30:00 [ERROR] app.server.handler - Connection refused";
    expect(line.match(re)?.groups).toMatchObject({
      level: "ERROR",
      module: "app.server.handler",
      message: "Connection refused",
    });
  });
});

describe("verbose, comments, and scoped modifiers", () => {
  it("preserves character-class text while stripping verbose comments", () => {
    const re = compileEcmaRe(
      `(?x)
       [abc   # still literal inside the class
        def]
      `,
      "a",
    );

    expect(re.test("a")).toBe(true);
    expect(re.test(" ")).toBe(true);
    expect(re.test("#")).toBe(true);
  });

  it("preserves leading ] and # literals inside verbose character classes", () => {
    const re = compileEcmaRe(
      `(?x)
       [^]#] # real comment outside the class
      `,
      "a",
    );

    expect(re.test("a")).toBe(true);
    expect(re.test("]")).toBe(false);
    expect(re.test("#")).toBe(false);
  });

  it("keeps scoped flags from leaking", () => {
    const re = compileEcmaRe("(?i:a)(?-i:b)(?s:.)c.");

    expect(re.test("Ab\ncd")).toBe(true);
    expect(re.test("AB\ncd")).toBe(false);
    expect(re.test("Ab\nc\n")).toBe(false);
  });

  it("scopes case-insensitive matching", () => {
    const re = compileEcmaRe("(?i:hello) world");

    expect(re.test("HELLO world")).toBe(true);
    expect(re.test("HELLO WORLD")).toBe(false);
  });

  it("scopes dotAll matching", () => {
    const re = compileEcmaRe("(?s:a.b)c.d");

    expect(re.test("a\nbcxd")).toBe(true);
    expect(re.test("a\nbc\nd")).toBe(false);
  });

  it("scopes multiline anchors", () => {
    const re = compileEcmaRe("(?m:^foo)");

    expect(re.test("bar\nfoo")).toBe(true);
    expect(compileEcmaRe("^foo").test("bar\nfoo")).toBe(false);
  });

  it("scopes disabled dotAll and multiline flags", () => {
    const dotAllDisabled = compileEcmaRe("(?-s:a.b)", "s");
    const multilineDisabled = compileEcmaRe("(?-m:^foo)", "m");

    expect(dotAllDisabled.test("a\nb")).toBe(false);
    expect(dotAllDisabled.test("axb")).toBe(true);
    expect(multilineDisabled.test("bar\nfoo")).toBe(false);
    expect(multilineDisabled.test("foo")).toBe(true);
  });

  it("limits multiline anchors to Python newline boundaries", () => {
    const start = compileEcmaRe("^b", "m");
    const end = compileEcmaRe("a$", "m");

    expect(start.test("a\nb")).toBe(true);
    expect(start.test("a\rb")).toBe(false);
    expect(start.test("a\u2028b")).toBe(false);
    expect(end.test("a\nb")).toBe(true);
    expect(end.test("a\rb")).toBe(false);
    expect(end.test("a\u2028b")).toBe(false);
  });

  it("validates and normalizes scoped inline flags like Python", () => {
    expect(compileEcmaRe("(?ii:a)", "a").test("A")).toBe(true);
    expect(() => compileEcmaRe("(?i-i:a)", "a")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("(?au:a)", "a")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("(?-a:a)", "a")).toThrow(EcmaReError);
  });

  it("applies scoped verbose flags without leaking", () => {
    const enabled = compileEcmaRe("(?x:a b)", "a");
    const disabled = compileEcmaRe("(?x)a(?-x: b)c", "a");

    expect(enabled.test("ab")).toBe(true);
    expect(enabled.test("a b")).toBe(false);
    expect(disabled.test("a bc")).toBe(true);
    expect(disabled.test("abc")).toBe(false);
  });

  it("does not erase verbose whitespace inside regex tokens", () => {
    const brace = compileEcmaRe("(?x)^a{1, 2}$", "a");

    expect(() => compileEcmaRe("(?x)(? :a)", "a")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("(?x)a* ?", "a")).toThrow(EcmaReError);
    expect(brace.test("a{1,2}")).toBe(true);
    expect(brace.test("aa")).toBe(false);
  });

  it("strips inline comment groups in verbose mode", () => {
    const re = compileEcmaRe("(?x)a(?# ignored ) b", "a");

    expect(re.test("ab")).toBe(true);
    expect(re.test("a b")).toBe(false);
  });

  it("strips verbose line comments through end of input", () => {
    const re = compileEcmaRe("(?x)a # trailing comment", "a");

    expect(re.test("a")).toBe(true);
    expect(re.test("#")).toBe(false);
  });

  it("removes a trailing inline comment group without changing the atom", () => {
    const re = compileEcmaRe("a(?# only comment)", "a");

    expect("ba".match(re)?.index).toBe(1);
    expect(re.test("b")).toBe(false);
  });
});

describe("syntax edge cases", () => {
  it("treats invalid brace quantifier forms as literals where Python does", () => {
    expect(compileEcmaRe("^a{2,}$", "a").test("aaa")).toBe(true);
    expect(compileEcmaRe("^a{b}$", "a").test("a{b}")).toBe(true);
    expect(compileEcmaRe("^a{2x}$", "a").test("a{2x}")).toBe(true);
    expect(compileEcmaRe("^{\\}$", "a").test("{}")).toBe(true);
  });

  it("supports omitted lower bounds in brace quantifiers", () => {
    const re = compileEcmaRe("^a{,3}$", "a");

    expect(re.test("")).toBe(true);
    expect(re.test("aaa")).toBe(true);
    expect(re.test("aaaa")).toBe(false);
  });

  it("rejects brace quantifiers whose lower bound exceeds the upper bound", () => {
    expect(() => compileEcmaRe("a{3,2}", "a")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("a{3,2}?", "a")).toThrow(EcmaReError);
  });

  it("handles escaped regex metacharacters as literals", () => {
    const outside = compileEcmaRe("^\\*\\+\\{\\}\\|\\^\\$\\/\\-$", "a");
    const inside = compileEcmaRe(
      "^[\\]\\[\\^\\.\\*\\+\\?\\(\\)\\{\\}\\|\\/\\$\\x41\\u0042]+$",
      "a",
    );

    expect(outside.test("*+{}|^$/-")).toBe(true);
    expect(inside.test("][^.*+?(){}|/$AB")).toBe(true);
    expect(inside.test("-")).toBe(false);
  });

  it("handles leading ] literals and octal escapes inside character classes", () => {
    const re = compileEcmaRe("^[]\\141\\0\\xAF\\u00AF]+$", "a");

    expect(re.test("]a\0¯")).toBe(true);
    expect(re.test("b")).toBe(false);
  });

  it("handles low-frequency escapes inside character classes", () => {
    const re = compileEcmaRe(
      "^[\\w\\W\\D\\S\\b\\x08\\n\\r\\t\\f\\v\\a\\\\\\-\\&]+$",
      "a",
    );

    expect(re.test("A!\b\n\r\t\f\v\u0007\\-&")).toBe(true);
  });

  it("rejects unknown ASCII-letter escapes like Python", () => {
    expect(() => compileEcmaRe("\\q")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("[\\q]")).toThrow(EcmaReError);
  });

  it("keeps unknown non-letter escapes as literals like Python", () => {
    expect(compileEcmaRe("^\\&$", "a").test("&")).toBe(true);
    expect(compileEcmaRe("^[\\&]$", "a").test("&")).toBe(true);
  });

  it("rejects character-class ranges whose endpoint is not a literal", () => {
    expect(() => compileEcmaRe("[a-\\d]", "a")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("[\\d-a]", "a")).toThrow(EcmaReError);
  });

  it("treats a trailing dash before ] as a character-class literal", () => {
    const re = compileEcmaRe("^[a-]$", "a");

    expect(re.test("a")).toBe(true);
    expect(re.test("-")).toBe(true);
    expect(re.test("b")).toBe(false);
  });

  it("escapes v-mode character-class punctuation required by ECMAScript", () => {
    const re = compileEcmaRe("^[(){}|/]+$");
    const doubled = compileEcmaRe("^[&&!!##%%**++,,..::;;<<==>>??@@^^``~~]+$");
    const doubledPunctuation = [
      "&",
      "!",
      "#",
      "%",
      "*",
      "+",
      ",",
      ".",
      ":",
      ";",
      "<",
      "=",
      ">",
      "?",
      "@",
      "^",
      "`",
      "~",
    ].join("");

    expect(re.test("(){}|/")).toBe(true);
    expect(doubled.test(doubledPunctuation)).toBe(true);
    expect(re.flags).toContain("v");
  });

  it("parses conditional groups before rejecting them as unsupported", () => {
    expect(() => compileEcmaRe("(?P<x>a)(?(x)b|c)")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("(?(missing)b)")).toThrow(EcmaReError);
  });

  it("rejects invalid named-group references early", () => {
    expect(() => compileEcmaRe("(?P<x>a)(?P<x>b)")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("(?P<x>(?P=x))")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("(?P=)")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("(?P=missing)")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("(?P=1x)")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("(?P:a)")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("(?<name>a)")).toThrow(EcmaReError);
  });

  it("rejects global flag groups after the pattern start", () => {
    expect(() => compileEcmaRe("a(?i)b")).toThrow(EcmaReError);
  });

  it("supports Python Unicode escapes and group names", () => {
    const unicodeEscape = compileEcmaRe("^\\U0001F600[\\U0001F601]$", "a");
    const named = compileEcmaRe("(?P<名>\\w+)-(?P=名)");

    expect(unicodeEscape.test("😀😁")).toBe(true);
    expect(named.test("東京-東京")).toBe(true);
    expect(named.test("東京-大阪")).toBe(false);
  });

  it("supports Python named Unicode escapes", () => {
    const literal = compileEcmaRe(
      "^\\N{LATIN SMALL LETTER A}\\N{EM DASH}\\N{NULL}\\N{HANGUL SYLLABLE GA}\\N{TANGUT IDEOGRAPH-17000}$",
      "a",
    );
    const charClass = compileEcmaRe(
      "^[\\N{NUL}\\N{CJK UNIFIED IDEOGRAPH-4E00}]$",
      "a",
    );

    expect(literal.test("a—\0가𗀀")).toBe(true);
    expect(charClass.test("\0")).toBe(true);
    expect(charClass.test("一")).toBe(true);
  });

  it("keeps named Unicode escape names intact in verbose mode", () => {
    const re = compileEcmaRe("^\\N{LATIN SMALL LETTER A}$", "x");

    expect(re.test("a")).toBe(true);
  });

  it("rejects multi-codepoint named Unicode escapes", () => {
    expect(() => compileEcmaRe("\\N{KEYCAP DIGIT ONE}", "a")).toThrow(
      EcmaReError,
    );
  });

  it("rejects malformed and invalid algorithmic named Unicode escapes", () => {
    expect(() => compileEcmaRe("\\N", "a")).toThrow(EcmaReError);
    expect(() => compileEcmaRe("\\N{LATIN SMALL LETTER A", "a")).toThrow(
      EcmaReError,
    );
    expect(() =>
      compileEcmaRe("\\N{CJK UNIFIED IDEOGRAPH-04E00}", "a"),
    ).toThrow(EcmaReError);
    expect(() => compileEcmaRe("\\N{HANGUL SYLLABLE NOTREAL}", "a")).toThrow(
      EcmaReError,
    );
  });

  it("rejects three-digit octal escapes outside Python's byte range", () => {
    expect(() => compileEcmaRe("\\400")).toThrow(EcmaReError);
  });

  it("rejects malformed group prefixes with parser errors", () => {
    for (const pattern of [
      "(",
      "(?",
      "(?P",
      "(?P<>a)",
      "(?P<name",
      "(?<",
      "(?#unterminated",
      "(?x)(?#unterminated",
      "(?(",
      "(?i-a",
      "(?@)",
      "[\\",
      "[a-",
    ]) {
      expect(() => compileEcmaRe(pattern, "a")).toThrow(EcmaReError);
    }
  });
});

describe("Unicode and ASCII semantics", () => {
  it("uses Python Unicode semantics by default", () => {
    const re = compileEcmaRe("^\\w+\\s\\d+$");

    expect(re.test("東京 १२३")).toBe(true);
    expect(re.flags).toContain("v");
  });

  it("uses ASCII semantics through the Python a flag", () => {
    const re = compileEcmaRe("^\\w+\\s\\d+$", "a");

    expect(re.test("abc 123")).toBe(true);
    expect(re.test("東京 १२३")).toBe(false);
    expect(re.flags).not.toContain("v");
  });

  it("applies Unicode shorthands inside character classes", () => {
    const re = compileEcmaRe("^[\\d\\s]+$");

    expect(re.test("१२३\u00a0")).toBe(true);
  });

  it("uses Unicode-aware word boundaries by default", () => {
    const re = compileEcmaRe("\\bcafé\\b");

    expect(re.test(" café ")).toBe(true);
    expect(re.test("xcaféx")).toBe(false);
  });

  it("keeps native ASCII word-boundary semantics in ASCII mode", () => {
    const boundary = compileEcmaRe("\\bword\\b", "a");
    const nonBoundary = compileEcmaRe("\\B_\\B", "a");

    expect(boundary.test(" word ")).toBe(true);
    expect(boundary.test("swordfish")).toBe(false);
    expect(nonBoundary.test("a_b")).toBe(true);
    expect(nonBoundary.test("a-_")).toBe(false);
  });
});

describe("Unicode stress", () => {
  it("matches mixed-script Unicode words", () => {
    const re = compileEcmaRe("^\\w+$");

    expect(re.test("Hello_世界_Москва_مرحبا")).toBe(true);
    expect(re.test("hello-world")).toBe(false);
  });

  it("detects Unicode word boundaries around mixed scripts", () => {
    const re = compileEcmaRe("\\b東京\\b");

    expect(re.test(" 東京 ")).toBe(true);
    expect(re.test("x東京x")).toBe(false);
  });

  it("matches non-ASCII decimal digits", () => {
    const re = compileEcmaRe("^\\d+$");

    expect(re.test("१२३४")).toBe(true);
    expect(re.test("１２３４")).toBe(true);
    expect(re.test("abcd")).toBe(false);
  });

  it("keeps ASCII whitespace shorthands ASCII-only", () => {
    const space = compileEcmaRe("^\\s$", "a");
    const nonSpace = compileEcmaRe("^\\S$", "a");
    const classSpace = compileEcmaRe("^[\\s]$", "a");
    const classNonSpace = compileEcmaRe("^[\\S]$", "a");

    expect(space.test(" ")).toBe(true);
    expect(space.test("\u00a0")).toBe(false);
    expect(nonSpace.test("\u00a0")).toBe(true);
    expect(classSpace.test("\u00a0")).toBe(false);
    expect(classNonSpace.test("\u00a0")).toBe(true);
  });

  it("limits ASCII ignorecase folding to ASCII characters", () => {
    const literal = compileEcmaRe("^ü$", "ia");
    const charClass = compileEcmaRe("^[Aé]$", "ia");
    const negatedClass = compileEcmaRe("^[^é]$", "ia");

    expect(literal.test("ü")).toBe(true);
    expect(literal.test("Ü")).toBe(false);
    expect(charClass.test("A")).toBe(true);
    expect(charClass.test("a")).toBe(true);
    expect(charClass.test("é")).toBe(true);
    expect(charClass.test("É")).toBe(false);
    expect(negatedClass.test("É")).toBe(true);
    expect(negatedClass.test("é")).toBe(false);
  });

  it("keeps ASCII ignorecase ASCII-only when v mode is otherwise required", () => {
    const lowerRange = compileEcmaRe("^[a-z]\\U0001F600$", "ia");
    const upperRange = compileEcmaRe("^[A-Z]\\U0001F600$", "ia");

    expect(lowerRange.test("k😀")).toBe(true);
    expect(lowerRange.test("K😀")).toBe(true);
    expect(lowerRange.test("K😀")).toBe(false);
    expect(lowerRange.test("ſ😀")).toBe(false);
    expect(upperRange.test("K😀")).toBe(true);
    expect(upperRange.test("k😀")).toBe(true);
    expect(upperRange.test("K😀")).toBe(false);
    expect(upperRange.test("ſ😀")).toBe(false);
  });

  it("honors scoped ASCII and Unicode ignorecase mode switches", () => {
    const re = compileEcmaRe("(?i)^(?a:k)(?u:k)$");

    expect(re.test("KK")).toBe(true);
    expect(re.test("KK")).toBe(false);
  });

  it("matches Python Unicode whitespace controls", () => {
    const space = compileEcmaRe("^\\s$");
    const nonSpace = compileEcmaRe("^\\S$");
    const classSpace = compileEcmaRe("^[\\s]$");
    const classNonSpace = compileEcmaRe("^[\\S]$");

    expect(space.test("\x1c")).toBe(true);
    expect(nonSpace.test("\x1c")).toBe(false);
    expect(classSpace.test("\x1c")).toBe(true);
    expect(classNonSpace.test("\x1c")).toBe(false);
  });

  it("matches Unicode non-word shorthand inside and outside character classes", () => {
    const outside = compileEcmaRe("^\\W+$");
    const inside = compileEcmaRe("^[\\W]+$");

    expect(outside.test("! ")).toBe(true);
    expect(inside.test("! ")).toBe(true);
    expect(outside.test("東京")).toBe(false);
    expect(inside.test("東京")).toBe(false);
  });

  it("applies Python Unicode ignorecase equivalence classes", () => {
    const range = compileEcmaRe("^[a-z]+$", "i");
    const literal = compileEcmaRe("^[İſK]+$", "i");
    const ascii = compileEcmaRe("^[a-z]+$", "ia");

    expect(range.test("İıſK")).toBe(true);
    expect(literal.test("iSk")).toBe(true);
    expect(ascii.test("İ")).toBe(false);
  });
});

describe("everything combined", () => {
  it("combines anchors, named groups, lookaround, verbose mode, and backrefs", () => {
    const re = compileEcmaRe(
      `(?x)
       \\A
       <(?P<tag>[a-z]+)
       \\s+
       (?P<attr>[a-z]+)="(?P<val>[^"]*)"
       >
       (?P<body>.*?)
       </(?P=tag)>
       \\Z
      `,
      "sa",
    );

    expect(
      '<div class="hero">\ncontent\n</div>'.match(re)?.groups,
    ).toMatchObject({
      tag: "div",
      attr: "class",
      val: "hero",
      body: "\ncontent\n",
    });
    expect(re.test('<div class="hero"></span>')).toBe(false);
  });

  it("approximates multiple explicitly enabled constructs in one pattern", () => {
    const onWarn = vi.fn();
    const re = compileEcmaRe("(?P<word>[a-z]++)@(?>[a-z]++\\.[a-z]++)", "a", {
      allowAtomicGroupApproximation: true,
      allowPossessiveQuantifierApproximation: true,
      onWarn,
    });

    expect(re.test("user@example.com")).toBe(true);
    expect(onWarn).toHaveBeenCalledTimes(4);
  });

  it("throws for unsupported constructs even inside complex contexts", () => {
    expect(() =>
      compileEcmaRe("\\A(a)(?(1)b|c)\\Z", "", {
        allowAtomicGroupApproximation: true,
        allowPossessiveQuantifierApproximation: true,
      }),
    ).toThrow(EcmaReError);
  });
});
