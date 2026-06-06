import { describe, expect, it, vi } from "vitest";
import { EcmaReError, ecmaRe } from "../src/index";

describe("nested captures and backreferences", () => {
  it("matches deeply nested numbered backreferences", () => {
    const re = ecmaRe("((((a))))\\4\\3\\2\\1");

    expect(re.test("aaaaa")).toBe(true);
    expect(re.test("aaaa")).toBe(false);
    expect("aaaaa".match(re)?.slice(1)).toEqual(["a", "a", "a", "a"]);
  });

  it("matches a tenth backreference without ambiguity", () => {
    const re = ecmaRe(
      "(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)\\10\\9\\8\\7\\6\\5\\4\\3\\2\\1",
    );

    expect(re.test("abcdefghijjihgfedcba")).toBe(true);
    expect(re.test("abcdefghijabcdefghij")).toBe(false);
  });

  it("matches nested named groups and named backreferences", () => {
    const re = ecmaRe(
      "(?P<outer>(?P<inner>[a-z]+)-(?P=inner))_(?P=outer)",
      "a",
    );

    expect(re.test("abc-abc_abc-abc")).toBe(true);
    expect(re.test("abc-abc_abc-def")).toBe(false);
  });
});

describe("lookaround combinations", () => {
  it("handles lookbehind with alternatives of the same length", () => {
    const re = ecmaRe("(?<=ab|cd)f");

    expect(re.test("abf")).toBe(true);
    expect(re.test("cdf")).toBe(true);
    expect(re.test("af")).toBe(false);
  });

  it("rejects variable-width lookbehind like Python", () => {
    expect(() => ecmaRe("(?<=ab|cde)f")).toThrow(EcmaReError);
  });

  it("allows variable-width lookbehind when explicitly enabled", () => {
    const re = ecmaRe("(?<=ab|cde)f", "", {
      allowVariableLengthLookbehind: true,
    });

    expect(re.test("abf")).toBe(true);
    expect(re.test("cdef")).toBe(true);
    expect(re.test("af")).toBe(false);
  });

  it("allows fixed-width backreferences inside lookbehind", () => {
    const re = ecmaRe("(a)(?<=\\1)b", "a");

    expect(re.test("ab")).toBe(true);
    expect(re.test("bb")).toBe(false);
  });

  it("treats nested lookarounds inside lookbehind as zero-width", () => {
    const re = ecmaRe("(?<=(?=a))a", "a");

    expect(re.test("a")).toBe(true);
    expect(re.test("b")).toBe(false);
  });

  it("checks conditional width before rejecting conditionals as unsupported", () => {
    expect(() => ecmaRe("(a)?(?<=(?(1)a|b))c", "a")).toThrow(EcmaReError);
  });

  it("combines negative lookbehind and negative lookahead", () => {
    const re = ecmaRe("(?<!a)b(?!c)");

    expect(re.test("xbd")).toBe(true);
    expect(re.test("abc")).toBe(false);
    expect(re.test("xbc")).toBe(false);
  });

  it("uses captures from lookahead in a later backreference", () => {
    const re = ecmaRe("(?=(a+))\\1b", "a");

    expect(re.test("aaab")).toBe(true);
    expect("aaab".match(re)?.[1]).toBe("aaa");
  });
});

describe("real-world Python patterns", () => {
  it("validates IPv4 addresses in verbose mode", () => {
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
      "a",
    );

    expect(re.test("192.168.1.1")).toBe(true);
    expect(re.test("255.255.255.255")).toBe(true);
    expect(re.test("256.1.1.1")).toBe(false);
  });

  it("extracts ISO 8601 datetime fields", () => {
    const re = ecmaRe(
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
    const re = ecmaRe(
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
    const re = ecmaRe(
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
    const re = ecmaRe(
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
    const re = ecmaRe(
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
    const re = ecmaRe("(?i:a)(?-i:b)(?s:.)c.");

    expect(re.test("Ab\ncd")).toBe(true);
    expect(re.test("AB\ncd")).toBe(false);
    expect(re.test("Ab\nc\n")).toBe(false);
  });

  it("strips inline comment groups in verbose mode", () => {
    const re = ecmaRe("(?x)a(?# ignored ) b", "a");

    expect(re.test("ab")).toBe(true);
    expect(re.test("a b")).toBe(false);
  });

  it("strips verbose line comments through end of input", () => {
    const re = ecmaRe("(?x)a # trailing comment", "a");

    expect(re.test("a")).toBe(true);
    expect(re.test("#")).toBe(false);
  });

  it("removes a trailing inline comment group without changing the atom", () => {
    const re = ecmaRe("a(?# only comment)", "a");

    expect("ba".match(re)?.index).toBe(1);
    expect(re.test("b")).toBe(false);
  });
});

describe("syntax edge cases", () => {
  it("treats invalid brace quantifier forms as literals where Python does", () => {
    expect(ecmaRe("^a{2,}$", "a").test("aaa")).toBe(true);
    expect(ecmaRe("^a{b}$", "a").test("a{b}")).toBe(true);
    expect(ecmaRe("^a{2x}$", "a").test("a{2x}")).toBe(true);
    expect(ecmaRe("^{\\}$", "a").test("{}")).toBe(true);
  });

  it("handles escaped regex metacharacters as literals", () => {
    const outside = ecmaRe("^\\*\\+\\{\\}\\|\\^\\$\\/\\-$", "a");
    const inside = ecmaRe(
      "^[\\]\\[\\^\\.\\*\\+\\?\\(\\)\\{\\}\\|\\/\\$\\x41\\u0042]+$",
      "a",
    );

    expect(outside.test("*+{}|^$/-")).toBe(true);
    expect(inside.test("][^.*+?(){}|/$AB")).toBe(true);
    expect(inside.test("-")).toBe(false);
  });

  it("handles leading ] literals and octal escapes inside character classes", () => {
    const re = ecmaRe("^[]\\141\\0\\xAF\\u00AF]+$", "a");

    expect(re.test("]a\0¯")).toBe(true);
    expect(re.test("b")).toBe(false);
  });

  it("handles low-frequency escapes inside character classes", () => {
    const re = ecmaRe(
      "^[\\w\\W\\D\\S\\b\\x08\\n\\r\\t\\f\\v\\a\\\\\\-\\&]+$",
      "a",
    );

    expect(re.test("A!\b\n\r\t\f\v\u0007\\-&")).toBe(true);
  });

  it("rejects character-class ranges whose endpoint is not a literal", () => {
    expect(() => ecmaRe("[a-\\d]", "a")).toThrow(EcmaReError);
    expect(() => ecmaRe("[\\d-a]", "a")).toThrow(EcmaReError);
  });

  it("treats a trailing dash before ] as a character-class literal", () => {
    const re = ecmaRe("^[a-]$", "a");

    expect(re.test("a")).toBe(true);
    expect(re.test("-")).toBe(true);
    expect(re.test("b")).toBe(false);
  });

  it("escapes v-mode character-class punctuation required by ECMAScript", () => {
    const re = ecmaRe("^[(){}|/]+$");

    expect(re.test("(){}|/")).toBe(true);
    expect(re.flags).toContain("v");
  });

  it("parses conditional groups before rejecting them as unsupported", () => {
    expect(() => ecmaRe("(?P<x>a)(?(x)b|c)")).toThrow(EcmaReError);
    expect(() => ecmaRe("(?(missing)b)")).toThrow(EcmaReError);
  });

  it("rejects invalid named-group references early", () => {
    expect(() => ecmaRe("(?P<x>a)(?P<x>b)")).toThrow(EcmaReError);
    expect(() => ecmaRe("(?P<x>(?P=x))")).toThrow(EcmaReError);
    expect(() => ecmaRe("(?P=)")).toThrow(EcmaReError);
    expect(() => ecmaRe("(?P=missing)")).toThrow(EcmaReError);
    expect(() => ecmaRe("(?P=1x)")).toThrow(EcmaReError);
    expect(() => ecmaRe("(?P:a)")).toThrow(EcmaReError);
    expect(() => ecmaRe("(?<name>a)")).toThrow(EcmaReError);
  });

  it("rejects three-digit octal escapes outside Python's byte range", () => {
    expect(() => ecmaRe("\\400")).toThrow(EcmaReError);
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
      expect(() => ecmaRe(pattern, "a")).toThrow(EcmaReError);
    }
  });
});

describe("Unicode stress", () => {
  it("matches mixed-script Unicode words", () => {
    const re = ecmaRe("^\\w+$");

    expect(re.test("Hello_世界_Москва_مرحبا")).toBe(true);
    expect(re.test("hello-world")).toBe(false);
  });

  it("detects Unicode word boundaries around mixed scripts", () => {
    const re = ecmaRe("\\b東京\\b");

    expect(re.test(" 東京 ")).toBe(true);
    expect(re.test("x東京x")).toBe(false);
  });

  it("matches non-ASCII decimal digits", () => {
    const re = ecmaRe("^\\d+$");

    expect(re.test("१२३४")).toBe(true);
    expect(re.test("１２３４")).toBe(true);
    expect(re.test("abcd")).toBe(false);
  });

  it("matches Unicode non-word shorthand inside and outside character classes", () => {
    const outside = ecmaRe("^\\W+$");
    const inside = ecmaRe("^[\\W]+$");

    expect(outside.test("! ")).toBe(true);
    expect(inside.test("! ")).toBe(true);
    expect(outside.test("東京")).toBe(false);
    expect(inside.test("東京")).toBe(false);
  });
});

describe("everything combined", () => {
  it("combines anchors, named groups, lookaround, verbose mode, and backrefs", () => {
    const re = ecmaRe(
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
    const re = ecmaRe("(?P<word>[a-z]++)@(?>[a-z]++\\.[a-z]++)", "a", {
      allowAtomicGroupApproximation: true,
      allowPossessiveQuantifierApproximation: true,
      onWarn,
    });

    expect(re.test("user@example.com")).toBe(true);
    expect(onWarn).toHaveBeenCalledTimes(4);
  });

  it("throws for unsupported constructs even inside complex contexts", () => {
    expect(() =>
      ecmaRe("\\A(a)(?(1)b|c)\\Z", "", {
        allowAtomicGroupApproximation: true,
        allowPossessiveQuantifierApproximation: true,
      }),
    ).toThrow(EcmaReError);
  });
});
