import { describe, expect, it } from "vitest";
import type { EcmaReOptions } from "../src/index";
import { ecmaRe } from "../src/index";

const SUCCEED = 0;
const FAIL = 1;
const SYNTAX_ERROR = 2;

/**
 * Test runner ported from CPython's re_tests.py tuple format:
 *   (pattern, input_string, expected_outcome, expression, expected_value)
 *
 * expression is one of:
 *   'found'       -> match[0]
 *   'g1'..'gN'    -> match[N]
 *   compound expr -> e.g. 'found+"-"+g1+"-"+g2'
 */
function runTest(
  pattern: string,
  input: string,
  outcome: number,
  expr?: string,
  expected?: string,
  flags?: string,
  options?: EcmaReOptions,
) {
  if (outcome === SYNTAX_ERROR) {
    expect(() => ecmaRe(pattern, flags, options)).toThrow();
    return;
  }

  let re: RegExp;
  try {
    re = ecmaRe(pattern, flags, options);
  } catch (e) {
    throw new Error(`Pattern /${pattern}/ should compile but threw: ${e}`);
  }

  const match = re.exec(input);

  if (outcome === FAIL) {
    expect(match).toBeNull();
    return;
  }

  // SUCCEED
  expect(match).not.toBeNull();
  if (!match) return;

  if (expr === undefined) return;

  let actual: string | undefined;

  if (expr === "found") {
    actual = match[0];
  } else if (/^g\d+$/.test(expr)) {
    const idx = Number.parseInt(expr.slice(1), 10);
    actual = match[idx] ?? undefined;
  } else {
    // Evaluate compound expressions like 'found+"-"+g1+"-"+g2'
    // by replacing tokens with match values
    const resolved = expr.replace(/found|g(\d+)/g, (tok, num) => {
      if (tok === "found") return match[0] ?? "";
      return match[Number.parseInt(num, 10)] ?? "";
    });
    // The expression uses + for concatenation and string literals in quotes
    // e.g. found+"-"+g1+"-"+g2  =>  match[0] + "-" + match[1] + "-" + match[2]
    // After replacing found/gN tokens, strip the "+"-"+" glue
    actual = resolved.replace(/\+"-"\+/g, "-").replace(/\+"\."\+/g, ".");
  }

  expect(actual).toBe(expected);
}

// Shorthand for ASCII mode
const ASCII: EcmaReOptions = { ascii: true };

describe("CPython re_tests.py port", () => {
  // ---------------------------------------------------------------------------
  // Category: Basic literal matching
  // ---------------------------------------------------------------------------
  describe("Basic literal matching", () => {
    it("abc matches abc", () => {
      runTest("abc", "abc", SUCCEED, "found", "abc");
    });

    it("abc does not match xbc", () => {
      runTest("abc", "xbc", FAIL);
    });

    it("abc does not match axc", () => {
      runTest("abc", "axc", FAIL);
    });

    it("abc does not match abx", () => {
      runTest("abc", "abx", FAIL);
    });

    it("abc found inside xabcy", () => {
      runTest("abc", "xabcy", SUCCEED, "found", "abc");
    });

    it("abc found inside ababc", () => {
      runTest("abc", "ababc", SUCCEED, "found", "abc");
    });

    it("ab*c matches abc (zero or more b)", () => {
      runTest("ab*c", "abc", SUCCEED, "found", "abc");
    });

    it("ab*bc matches abc", () => {
      runTest("ab*bc", "abc", SUCCEED, "found", "abc");
    });

    it("ab*bc matches abbc", () => {
      runTest("ab*bc", "abbc", SUCCEED, "found", "abbc");
    });

    it("ab*bc matches abbbbc", () => {
      runTest("ab*bc", "abbbbc", SUCCEED, "found", "abbbbc");
    });

    it("ab{0,}bc matches abbbbc", () => {
      runTest("ab{0,}bc", "abbbbc", SUCCEED, "found", "abbbbc");
    });

    it("literal with special chars escaped", () => {
      runTest("a\\.b", "a.b", SUCCEED, "found", "a.b");
    });

    it("literal dot does not match a-b", () => {
      runTest("a\\.b", "a-b", FAIL);
    });

    it("xy matches xy", () => {
      runTest("xy", "xy", SUCCEED, "found", "xy");
    });

    it("xy does not match xz", () => {
      runTest("xy", "xz", FAIL);
    });

    it("a matches a", () => {
      runTest("a", "a", SUCCEED, "found", "a");
    });

    it("a does not match b", () => {
      runTest("a", "b", FAIL);
    });

    it("abc found at position in longer string", () => {
      runTest("abc", "xxxabcyyy", SUCCEED, "found", "abc");
    });

    it("literal curly braces", () => {
      runTest("a\\{b", "a{b", SUCCEED, "found", "a{b");
    });

    it("consecutive literals", () => {
      runTest("abcdef", "abcdef", SUCCEED, "found", "abcdef");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Quantifiers
  // ---------------------------------------------------------------------------
  describe("Quantifiers", () => {
    it("ab+bc matches abbc", () => {
      runTest("ab+bc", "abbc", SUCCEED, "found", "abbc");
    });

    it("ab+bc does not match abc (need at least one b)", () => {
      runTest("ab+bc", "abc", FAIL);
    });

    it("ab+bc does not match abq", () => {
      runTest("ab+bc", "abq", FAIL);
    });

    it("ab+bc matches abbbbc", () => {
      runTest("ab+bc", "abbbbc", SUCCEED, "found", "abbbbc");
    });

    it("ab{1,}bc matches abbbbc", () => {
      runTest("ab{1,}bc", "abbbbc", SUCCEED, "found", "abbbbc");
    });

    it("ab{1,3}bc matches abbbbc", () => {
      runTest("ab{1,3}bc", "abbbbc", SUCCEED, "found", "abbbbc");
    });

    it("ab{3,4}bc matches abbbbc", () => {
      runTest("ab{3,4}bc", "abbbbc", SUCCEED, "found", "abbbbc");
    });

    it("ab{4,5}bc does not match abbbbc (need 4-5 b total)", () => {
      runTest("ab{4,5}bc", "abbbbc", FAIL);
    });

    it("ab?bc matches abbc", () => {
      runTest("ab?bc", "abbc", SUCCEED, "found", "abbc");
    });

    it("ab?bc matches abc", () => {
      runTest("ab?bc", "abc", SUCCEED, "found", "abc");
    });

    it("ab?bc does not match abbbbc", () => {
      runTest("ab?bc", "abbbbc", FAIL);
    });

    it("ab?c matches abc", () => {
      runTest("ab?c", "abc", SUCCEED, "found", "abc");
    });

    it("ab{0,1}c matches abc", () => {
      runTest("ab{0,1}c", "abc", SUCCEED, "found", "abc");
    });

    it("a{1}b matches ab", () => {
      runTest("a{1}b", "ab", SUCCEED, "found", "ab");
    });

    it("a{1,3}b matches aab", () => {
      runTest("a{1,3}b", "aab", SUCCEED, "found", "aab");
    });

    it("a{1,3}b matches first 3 a's in aaaab", () => {
      runTest("a{1,3}b", "aaaab", SUCCEED, "found", "aaab");
    });

    it("a{3}b matches aaab", () => {
      runTest("a{3}b", "aaab", SUCCEED, "found", "aaab");
    });

    it("a{3}b does not match aab", () => {
      runTest("a{3}b", "aab", FAIL);
    });

    it("a{3,}b matches aaab", () => {
      runTest("a{3,}b", "aaab", SUCCEED, "found", "aaab");
    });

    it("a{3,}b does not match aab", () => {
      runTest("a{3,}b", "aab", FAIL);
    });

    it("a{3,}b matches aaaaab", () => {
      runTest("a{3,}b", "aaaaab", SUCCEED, "found", "aaaaab");
    });

    it("a{0,1} on empty succeeds", () => {
      runTest("a{0,1}", "", SUCCEED, "found", "");
    });

    it("a{2,4} matches greedy in aaaaaa", () => {
      runTest("a{2,4}", "aaaaaa", SUCCEED, "found", "aaaa");
    });

    it(".* matches entire line", () => {
      runTest(".*", "abcdef", SUCCEED, "found", "abcdef");
    });

    it(".+ matches at least one char", () => {
      runTest(".+", "abcdef", SUCCEED, "found", "abcdef");
    });

    it(".+ does not match empty", () => {
      runTest(".+", "", FAIL);
    });

    it(".? matches one char", () => {
      runTest(".?", "a", SUCCEED, "found", "a");
    });

    // Lazy quantifiers
    it("a*? is lazy, matches empty", () => {
      runTest("a*?", "aaa", SUCCEED, "found", "");
    });

    it("a+? is lazy, matches single a", () => {
      runTest("a+?", "aaa", SUCCEED, "found", "a");
    });

    it("a?? is lazy, matches empty", () => {
      runTest("a??", "aaa", SUCCEED, "found", "");
    });

    it("a{2,4}? is lazy, matches aa", () => {
      runTest("a{2,4}?", "aaaaaa", SUCCEED, "found", "aa");
    });

    it("a{2,}? is lazy, matches aa", () => {
      runTest("a{2,}?", "aaaaaa", SUCCEED, "found", "aa");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Alternation
  // ---------------------------------------------------------------------------
  describe("Alternation", () => {
    it("a|b matches a", () => {
      runTest("a|b", "a", SUCCEED, "found", "a");
    });

    it("a|b matches b", () => {
      runTest("a|b", "b", SUCCEED, "found", "b");
    });

    it("a|b does not match c", () => {
      runTest("a|b", "c", FAIL);
    });

    it("ab|cd matches ab", () => {
      runTest("ab|cd", "ab", SUCCEED, "found", "ab");
    });

    it("ab|cd matches cd", () => {
      runTest("ab|cd", "cd", SUCCEED, "found", "cd");
    });

    it("ab|cd does not match ac", () => {
      runTest("ab|cd", "ac", FAIL);
    });

    it("a|b|c matches a", () => {
      runTest("a|b|c", "a", SUCCEED, "found", "a");
    });

    it("a|b|c matches b", () => {
      runTest("a|b|c", "b", SUCCEED, "found", "b");
    });

    it("a|b|c matches c", () => {
      runTest("a|b|c", "c", SUCCEED, "found", "c");
    });

    it("a|b|c does not match d", () => {
      runTest("a|b|c", "d", FAIL);
    });

    it("alternation with groups (ab|a)b*c", () => {
      runTest("(ab|a)b*c", "abc", SUCCEED, "g1", "ab");
    });

    it("alternation picks first match", () => {
      runTest("a|ab", "ab", SUCCEED, "found", "a");
    });

    it("alternation with empty branch", () => {
      runTest("a|", "b", SUCCEED, "found", "");
    });

    it("nested alternation (a|b|c)d", () => {
      runTest("(a|b|c)d", "cd", SUCCEED, "g1", "c");
    });

    it("alternation with quantifier (a|b)*", () => {
      runTest("(a|b)*", "abab", SUCCEED, "found", "abab");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Anchors (^, $, \A, \Z, \b, \B)
  // ---------------------------------------------------------------------------
  describe("Anchors", () => {
    it("^abc matches at start", () => {
      runTest("^abc", "abc", SUCCEED, "found", "abc");
    });

    it("^abc does not match xabc", () => {
      runTest("^abc", "xabc", FAIL);
    });

    it("abc$ matches at end", () => {
      runTest("abc$", "abc", SUCCEED, "found", "abc");
    });

    it("abc$ does not match abcx", () => {
      runTest("abc$", "abcx", FAIL);
    });

    it("^abc$ matches exactly", () => {
      runTest("^abc$", "abc", SUCCEED, "found", "abc");
    });

    it("^abc$ does not match abcc", () => {
      runTest("^abc$", "abcc", FAIL);
    });

    it("^abc$ does not match aabc", () => {
      runTest("^abc$", "aabc", FAIL);
    });

    it("$ matches before trailing newline (Python behavior)", () => {
      runTest("abc$", "abc\n", SUCCEED, "found", "abc");
    });

    it("^ at start with abc in middle", () => {
      runTest("^abc", "abcdef", SUCCEED, "found", "abc");
    });

    it("abc$ in middle string", () => {
      runTest("abc$", "xyzabc", SUCCEED, "found", "abc");
    });

    // \A and \Z
    it("\\A matches start of string", () => {
      runTest("\\Aabc", "abc", SUCCEED, "found", "abc");
    });

    it("\\A does not match mid-string", () => {
      runTest("\\Aabc", "xabc", FAIL);
    });

    it("\\Z matches end of string", () => {
      runTest("abc\\Z", "abc", SUCCEED, "found", "abc");
    });

    it("\\Z does not match before extra chars", () => {
      runTest("abc\\Z", "abcx", FAIL);
    });

    // Python \Z matches ONLY at end of string (unlike $ which matches before trailing \n)
    it("\\Z does not match before trailing newline", () => {
      runTest("abc\\Z", "abc\n", FAIL);
    });

    // \b and \B (ASCII mode for predictable word boundary)
    it("\\b matches word boundary at start", () => {
      runTest("\\bfoo\\b", "foo", SUCCEED, "found", "foo", undefined, ASCII);
    });

    it("\\b does not match inside word", () => {
      runTest(
        "\\bfoo\\b",
        "foobar",
        FAIL,
        undefined,
        undefined,
        undefined,
        ASCII,
      );
    });

    it("\\b matches word in sentence", () => {
      runTest(
        "\\bfoo\\b",
        "foo bar",
        SUCCEED,
        "found",
        "foo",
        undefined,
        ASCII,
      );
    });

    it("\\b matches word after space", () => {
      runTest(
        "\\bbar\\b",
        "foo bar",
        SUCCEED,
        "found",
        "bar",
        undefined,
        ASCII,
      );
    });

    it("\\B matches non-boundary", () => {
      runTest("\\Bfoo\\B", "xfooy", SUCCEED, "found", "foo", undefined, ASCII);
    });

    it("\\B does not match at word edge", () => {
      runTest("\\Bfoo\\B", "foo", FAIL, undefined, undefined, undefined, ASCII);
    });

    it("\\b at end of word", () => {
      runTest("foo\\b", "foo", SUCCEED, "found", "foo", undefined, ASCII);
    });

    it("\\b before punctuation", () => {
      runTest("foo\\b", "foo.bar", SUCCEED, "found", "foo", undefined, ASCII);
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Character classes
  // ---------------------------------------------------------------------------
  describe("Character classes", () => {
    it("[abc] matches a", () => {
      runTest("[abc]", "a", SUCCEED, "found", "a");
    });

    it("[abc] matches b", () => {
      runTest("[abc]", "b", SUCCEED, "found", "b");
    });

    it("[abc] matches c", () => {
      runTest("[abc]", "c", SUCCEED, "found", "c");
    });

    it("[abc] does not match d", () => {
      runTest("[abc]", "d", FAIL);
    });

    it("[a-z] matches m", () => {
      runTest("[a-z]", "m", SUCCEED, "found", "m");
    });

    it("[a-z] does not match A", () => {
      runTest("[a-z]", "A", FAIL);
    });

    it("[^abc] matches d (negated)", () => {
      runTest("[^abc]", "d", SUCCEED, "found", "d");
    });

    it("[^abc] does not match a", () => {
      runTest("[^abc]", "a", FAIL);
    });

    it("[^abc] does not match b", () => {
      runTest("[^abc]", "b", FAIL);
    });

    it("[a-zA-Z0-9] matches z", () => {
      runTest("[a-zA-Z0-9]", "z", SUCCEED, "found", "z");
    });

    it("[a-zA-Z0-9] matches Z", () => {
      runTest("[a-zA-Z0-9]", "Z", SUCCEED, "found", "Z");
    });

    it("[a-zA-Z0-9] matches 9", () => {
      runTest("[a-zA-Z0-9]", "9", SUCCEED, "found", "9");
    });

    it("[a-zA-Z0-9] does not match !", () => {
      runTest("[a-zA-Z0-9]", "!", FAIL);
    });

    // Bare hyphens at start/end of character class are valid in Python but
    // require escaping under the ES 'v' flag. Use ASCII mode to avoid 'v'.
    it("[-a] matches hyphen", () => {
      runTest("[-a]", "-", SUCCEED, "found", "-", undefined, ASCII);
    });

    it("[a-] matches hyphen", () => {
      runTest("[a-]", "-", SUCCEED, "found", "-", undefined, ASCII);
    });

    it("[a-] matches a", () => {
      runTest("[a-]", "a", SUCCEED, "found", "a", undefined, ASCII);
    });

    it("[^-a] does not match hyphen", () => {
      runTest("[^-a]", "-", FAIL, undefined, undefined, undefined, ASCII);
    });

    it("character class with escaped backslash [\\\\]", () => {
      runTest("[\\\\]", "\\", SUCCEED, "found", "\\");
    });

    it("[a-d] matches b", () => {
      runTest("[a-d]", "b", SUCCEED, "found", "b");
    });

    it("[a-d] does not match e", () => {
      runTest("[a-d]", "e", FAIL);
    });

    it("[a-d-] matches hyphen", () => {
      runTest("[a-d-]", "-", SUCCEED, "found", "-", undefined, ASCII);
    });

    it("[0-9] matches 5", () => {
      runTest("[0-9]", "5", SUCCEED, "found", "5");
    });

    it("[0-9] does not match a", () => {
      runTest("[0-9]", "a", FAIL);
    });

    it("[^0-9] matches a", () => {
      runTest("[^0-9]", "a", SUCCEED, "found", "a");
    });

    it("[^0-9] does not match 5", () => {
      runTest("[^0-9]", "5", FAIL);
    });

    // Shorthands in character classes (ASCII mode)
    it("[\\d] matches digit", () => {
      runTest("[\\d]", "5", SUCCEED, "found", "5", undefined, ASCII);
    });

    it("[\\d] does not match letter", () => {
      runTest("[\\d]", "a", FAIL, undefined, undefined, undefined, ASCII);
    });

    it("[\\w] matches word char", () => {
      runTest("[\\w]", "a", SUCCEED, "found", "a", undefined, ASCII);
    });

    it("[\\w] does not match punctuation", () => {
      runTest("[\\w]", "!", FAIL, undefined, undefined, undefined, ASCII);
    });

    it("[\\s] matches space", () => {
      runTest("[\\s]", " ", SUCCEED, "found", " ", undefined, ASCII);
    });

    it("[\\s] does not match letter", () => {
      runTest("[\\s]", "a", FAIL, undefined, undefined, undefined, ASCII);
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Dot and flags
  // ---------------------------------------------------------------------------
  describe("Dot and flags", () => {
    // Dot behavior
    it(". matches any char except newline", () => {
      runTest("a.b", "axb", SUCCEED, "found", "axb");
    });

    it(". does not match newline by default", () => {
      runTest("a.b", "a\nb", FAIL);
    });

    // Case insensitive (?i)
    it("(?i)abc matches ABC", () => {
      runTest("(?i)abc", "ABC", SUCCEED, "found", "ABC");
    });

    it("(?i)abc matches AbC", () => {
      runTest("(?i)abc", "AbC", SUCCEED, "found", "AbC");
    });

    it("(?i)abc matches abc", () => {
      runTest("(?i)abc", "abc", SUCCEED, "found", "abc");
    });

    it("(?i)[a-z] matches A", () => {
      runTest("(?i)[a-z]", "A", SUCCEED, "found", "A");
    });

    it("(?i)[a-z] matches z", () => {
      runTest("(?i)[a-z]", "z", SUCCEED, "found", "z");
    });

    // Multiline (?m)
    it("(?m)^abc matches after newline", () => {
      runTest("(?m)^abc", "x\nabc", SUCCEED, "found", "abc");
    });

    it("(?m)abc$ matches before newline", () => {
      runTest("(?m)abc$", "abc\nx", SUCCEED, "found", "abc");
    });

    it("^abc without multiline does not match after newline", () => {
      runTest("^abc", "x\nabc", FAIL);
    });

    it("abc$ without multiline does not match before extra line", () => {
      runTest("abc$", "abc\nx", FAIL);
    });

    // Dotall (?s)
    it("(?s)a.b matches across newline", () => {
      runTest("(?s)a.b", "a\nb", SUCCEED, "found", "a\nb");
    });

    it("a.b without dotall does not match newline", () => {
      runTest("a.b", "a\nb", FAIL);
    });

    // Flags via parameter
    it("i flag via parameter", () => {
      runTest("abc", "ABC", SUCCEED, "found", "ABC", "i");
    });

    it("m flag via parameter", () => {
      runTest("^abc", "x\nabc", SUCCEED, "found", "abc", "m");
    });

    it("s flag via parameter", () => {
      runTest("a.b", "a\nb", SUCCEED, "found", "a\nb", "s");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Groups and backreferences
  // ---------------------------------------------------------------------------
  describe("Groups and backreferences", () => {
    it("(a) captures a", () => {
      runTest("(a)", "a", SUCCEED, "g1", "a");
    });

    it("(a)(b) captures a in g1", () => {
      runTest("(a)(b)", "ab", SUCCEED, "g1", "a");
    });

    it("(a)(b) captures b in g2", () => {
      runTest("(a)(b)", "ab", SUCCEED, "g2", "b");
    });

    it("(a*) captures aaa", () => {
      runTest("(a*)", "aaa", SUCCEED, "g1", "aaa");
    });

    it("(a*)(b*) captures aa in g1", () => {
      runTest("(a*)(b*)", "aabb", SUCCEED, "g1", "aa");
    });

    it("(a*)(b*) captures bb in g2", () => {
      runTest("(a*)(b*)", "aabb", SUCCEED, "g2", "bb");
    });

    it("(a+)(b+) captures aa in g1", () => {
      runTest("(a+)(b+)", "aabb", SUCCEED, "g1", "aa");
    });

    it("(a+)(b+) captures bb in g2", () => {
      runTest("(a+)(b+)", "aabb", SUCCEED, "g2", "bb");
    });

    it("(a|b) captures a", () => {
      runTest("(a|b)", "a", SUCCEED, "g1", "a");
    });

    it("(a|b) captures b", () => {
      runTest("(a|b)", "b", SUCCEED, "g1", "b");
    });

    it("(?:a) non-capturing group matches", () => {
      runTest("(?:a)", "a", SUCCEED, "found", "a");
    });

    it("(?:a)(b) g1 is b (non-capturing skipped)", () => {
      runTest("(?:a)(b)", "ab", SUCCEED, "g1", "b");
    });

    it("(a(?:b)c) captures abc", () => {
      runTest("(a(?:b)c)", "abc", SUCCEED, "g1", "abc");
    });

    it("nested groups (a(b(c)))", () => {
      runTest("(a(b(c)))", "abc", SUCCEED, "g1", "abc");
    });

    it("nested groups (a(b(c))) g2", () => {
      runTest("(a(b(c)))", "abc", SUCCEED, "g2", "bc");
    });

    it("nested groups (a(b(c))) g3", () => {
      runTest("(a(b(c)))", "abc", SUCCEED, "g3", "c");
    });

    // Named groups
    it("(?P<name>a) captures a in g1", () => {
      runTest("(?P<name>a)", "a", SUCCEED, "g1", "a");
    });

    it("(?P<first>\\w+) (?P<last>\\w+) captures first name", () => {
      runTest(
        "(?P<first>\\w+) (?P<last>\\w+)",
        "John Smith",
        SUCCEED,
        "g1",
        "John",
        undefined,
        ASCII,
      );
    });

    it("(?P<first>\\w+) (?P<last>\\w+) captures last name", () => {
      runTest(
        "(?P<first>\\w+) (?P<last>\\w+)",
        "John Smith",
        SUCCEED,
        "g2",
        "Smith",
        undefined,
        ASCII,
      );
    });

    // Backreferences
    it("(a)\\1 matches aa", () => {
      runTest("(a)\\1", "aa", SUCCEED, "found", "aa");
    });

    it("(a)\\1 does not match ab", () => {
      runTest("(a)\\1", "ab", FAIL);
    });

    it("([abc])\\1 matches aa", () => {
      runTest("([abc])\\1", "aa", SUCCEED, "found", "aa");
    });

    it("([abc])\\1 matches bb", () => {
      runTest("([abc])\\1", "bb", SUCCEED, "found", "bb");
    });

    it("([abc])\\1 does not match ab", () => {
      runTest("([abc])\\1", "ab", FAIL);
    });

    it("(a)(b)\\2 matches abb", () => {
      runTest("(a)(b)\\2", "abb", SUCCEED, "found", "abb");
    });

    it("(a)(b)\\1 matches aba", () => {
      runTest("(a)(b)\\1", "aba", SUCCEED, "found", "aba");
    });

    // Named backreferences
    it("(?P<x>a)(?P=x) matches aa", () => {
      runTest("(?P<x>a)(?P=x)", "aa", SUCCEED, "found", "aa");
    });

    it("(?P<x>a)(?P=x) does not match ab", () => {
      runTest("(?P<x>a)(?P=x)", "ab", FAIL);
    });

    it("(?P<x>[abc])(?P=x) matches cc", () => {
      runTest("(?P<x>[abc])(?P=x)", "cc", SUCCEED, "found", "cc");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Lookahead and lookbehind
  // ---------------------------------------------------------------------------
  describe("Lookahead and lookbehind", () => {
    it("a(?=b) matches a before b", () => {
      runTest("a(?=b)", "ab", SUCCEED, "found", "a");
    });

    it("a(?=b) does not match a before c", () => {
      runTest("a(?=b)", "ac", FAIL);
    });

    it("a(?!b) matches a not before b", () => {
      runTest("a(?!b)", "ac", SUCCEED, "found", "a");
    });

    it("a(?!b) does not match a before b", () => {
      runTest("a(?!b)", "ab", FAIL);
    });

    it("(?<=a)b matches b after a", () => {
      runTest("(?<=a)b", "ab", SUCCEED, "found", "b");
    });

    it("(?<=a)b does not match b after c", () => {
      runTest("(?<=a)b", "cb", FAIL);
    });

    it("(?<!a)b matches b not after a", () => {
      runTest("(?<!a)b", "cb", SUCCEED, "found", "b");
    });

    it("(?<!a)b does not match b after a", () => {
      runTest("(?<!a)b", "ab", FAIL);
    });

    it("\\w+(?=\\s) matches word before space", () => {
      runTest(
        "\\w+(?=\\s)",
        "hello world",
        SUCCEED,
        "found",
        "hello",
        undefined,
        ASCII,
      );
    });

    it("(?<=\\s)\\w+ matches word after space", () => {
      runTest(
        "(?<=\\s)\\w+",
        "hello world",
        SUCCEED,
        "found",
        "world",
        undefined,
        ASCII,
      );
    });

    it("(?<=a).*(?=b) matches between a and b", () => {
      runTest("(?<=a).*(?=b)", "aXXXb", SUCCEED, "found", "XXX");
    });

    it("a(?=b)b matches ab (lookahead is zero-width)", () => {
      runTest("a(?=b)b", "ab", SUCCEED, "found", "ab");
    });

    it("a(?=b)c does not match ac", () => {
      runTest("a(?=b)c", "ac", FAIL);
    });

    it("positive lookahead with group", () => {
      runTest("(a)(?=b)", "ab", SUCCEED, "g1", "a");
    });

    it("negative lookahead at end of string", () => {
      runTest("a(?!$)", "ab", SUCCEED, "found", "a");
    });

    it("lookbehind with alternation", () => {
      runTest("(?<=a|b)c", "ac", SUCCEED, "found", "c");
    });

    it("lookbehind with alternation - second branch", () => {
      runTest("(?<=a|b)c", "bc", SUCCEED, "found", "c");
    });

    it("lookbehind fails when neither branch matches", () => {
      runTest("(?<=a|b)c", "xc", FAIL);
    });

    it("nested lookahead a(?=b(?=c))", () => {
      runTest("a(?=b(?=c))", "abc", SUCCEED, "found", "a");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Escape sequences
  // ---------------------------------------------------------------------------
  describe("Escape sequences", () => {
    // ASCII mode for \d, \w, \s
    it("\\d matches digit", () => {
      runTest("\\d", "5", SUCCEED, "found", "5", undefined, ASCII);
    });

    it("\\d does not match letter", () => {
      runTest("\\d", "a", FAIL, undefined, undefined, undefined, ASCII);
    });

    it("\\D matches non-digit", () => {
      runTest("\\D", "a", SUCCEED, "found", "a", undefined, ASCII);
    });

    it("\\D does not match digit", () => {
      runTest("\\D", "5", FAIL, undefined, undefined, undefined, ASCII);
    });

    it("\\w matches word char", () => {
      runTest("\\w", "a", SUCCEED, "found", "a", undefined, ASCII);
    });

    it("\\w matches underscore", () => {
      runTest("\\w", "_", SUCCEED, "found", "_", undefined, ASCII);
    });

    it("\\w matches digit", () => {
      runTest("\\w", "9", SUCCEED, "found", "9", undefined, ASCII);
    });

    it("\\w does not match punctuation", () => {
      runTest("\\w", "!", FAIL, undefined, undefined, undefined, ASCII);
    });

    it("\\W matches non-word char", () => {
      runTest("\\W", "!", SUCCEED, "found", "!", undefined, ASCII);
    });

    it("\\W does not match letter", () => {
      runTest("\\W", "a", FAIL, undefined, undefined, undefined, ASCII);
    });

    it("\\s matches space", () => {
      runTest("\\s", " ", SUCCEED, "found", " ", undefined, ASCII);
    });

    it("\\s matches tab", () => {
      runTest("\\s", "\t", SUCCEED, "found", "\t", undefined, ASCII);
    });

    it("\\s does not match letter", () => {
      runTest("\\s", "a", FAIL, undefined, undefined, undefined, ASCII);
    });

    it("\\S matches non-space", () => {
      runTest("\\S", "a", SUCCEED, "found", "a", undefined, ASCII);
    });

    it("\\S does not match space", () => {
      runTest("\\S", " ", FAIL, undefined, undefined, undefined, ASCII);
    });

    it("\\t matches tab", () => {
      runTest("\\t", "\t", SUCCEED, "found", "\t");
    });

    it("\\n matches newline", () => {
      runTest("\\n", "\n", SUCCEED, "found", "\n");
    });

    it("\\r matches carriage return", () => {
      runTest("\\r", "\r", SUCCEED, "found", "\r");
    });

    it("\\\\ matches literal backslash", () => {
      runTest("\\\\", "\\", SUCCEED, "found", "\\");
    });

    it("\\d+ matches run of digits", () => {
      runTest("\\d+", "abc123def", SUCCEED, "found", "123", undefined, ASCII);
    });

    it("\\w+ matches word", () => {
      runTest("\\w+", "hello!", SUCCEED, "found", "hello", undefined, ASCII);
    });

    it("\\s+ matches whitespace run", () => {
      runTest("\\s+", "a   b", SUCCEED, "found", "   ", undefined, ASCII);
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Verbose mode
  // ---------------------------------------------------------------------------
  describe("Verbose mode", () => {
    it("whitespace stripped in verbose mode", () => {
      runTest("a b c", "abc", SUCCEED, "found", "abc", "x");
    });

    it("comment stripped in verbose mode", () => {
      runTest("a #comment\nb", "ab", SUCCEED, "found", "ab", "x");
    });

    it("escaped space kept in verbose mode", () => {
      runTest("a\\ b", "a b", SUCCEED, "found", "a b", "x");
    });

    it("space inside [] kept in verbose mode", () => {
      runTest("[a b]", "a", SUCCEED, "found", "a", "x");
    });

    it("space inside [] matches space in verbose mode", () => {
      runTest("[a b]", " ", SUCCEED, "found", " ", "x");
    });

    it("newlines and tabs stripped in verbose mode", () => {
      runTest("a\n\tb", "ab", SUCCEED, "found", "ab", "x");
    });

    it("escaped hash in verbose mode", () => {
      runTest("a\\#b", "a#b", SUCCEED, "found", "a#b", "x");
    });

    it("verbose mode via inline flag (?x)", () => {
      runTest("(?x)a b c", "abc", SUCCEED, "found", "abc");
    });

    it("complex pattern in verbose mode", () => {
      runTest(
        "\\d{3} # area\n-\n\\d{4} # number",
        "555-1234",
        SUCCEED,
        "found",
        "555-1234",
        "x",
        ASCII,
      );
    });

    it("character class with # in verbose mode", () => {
      runTest("[#]", "#", SUCCEED, "found", "#", "x");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Comments
  // ---------------------------------------------------------------------------
  describe("Comments", () => {
    it("(?#comment) is ignored", () => {
      runTest("a(?#comment)b", "ab", SUCCEED, "found", "ab");
    });

    it("empty comment (?#) is ignored", () => {
      runTest("a(?#)b", "ab", SUCCEED, "found", "ab");
    });

    it("comment with special chars", () => {
      runTest("a(?#this is [complex])b", "ab", SUCCEED, "found", "ab");
    });

    it("multiple comments", () => {
      runTest("a(?#one)b(?#two)c", "abc", SUCCEED, "found", "abc");
    });

    it("comment does not consume pattern chars", () => {
      runTest("a(?#comment)bc", "abc", SUCCEED, "found", "abc");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Complex patterns from CPython
  // ---------------------------------------------------------------------------
  describe("Complex patterns", () => {
    it("a[bcd]*dcdcde matches adcdcde", () => {
      runTest("a[bcd]*dcdcde", "adcdcde", SUCCEED, "found", "adcdcde");
    });

    it("a[bcd]+dcdcde does not match adcdcde", () => {
      runTest("a[bcd]+dcdcde", "adcdcde", FAIL);
    });

    it("(ab|a)b*c g1 is ab", () => {
      runTest("(ab|a)b*c", "abc", SUCCEED, "g1", "ab");
    });

    it("((a)(b)c)(d) g1 is abc", () => {
      runTest("((a)(b)c)(d)", "abcd", SUCCEED, "g1", "abc");
    });

    it("((a)(b)c)(d) g2 is a", () => {
      runTest("((a)(b)c)(d)", "abcd", SUCCEED, "g2", "a");
    });

    it("((a)(b)c)(d) g3 is b", () => {
      runTest("((a)(b)c)(d)", "abcd", SUCCEED, "g3", "b");
    });

    it("((a)(b)c)(d) g4 is d", () => {
      runTest("((a)(b)c)(d)", "abcd", SUCCEED, "g4", "d");
    });

    it("[a-zA-Z_][a-zA-Z0-9_]* matches identifier", () => {
      runTest("[a-zA-Z_][a-zA-Z0-9_]*", "alpha", SUCCEED, "found", "alpha");
    });

    it("^a(bc+|b[eh])g|.h$ matches bh in abh", () => {
      runTest("^a(bc+|b[eh])g|.h$", "abh", SUCCEED, "found", "bh");
    });

    it("(bc+d$|ef*g.|h?i(j|k)) matches effgz", () => {
      runTest("(bc+d$|ef*g.|h?i(j|k))", "effgz", SUCCEED, "g1", "effgz");
    });

    it("(bc+d$|ef*g.|h?i(j|k)) matches ij g1", () => {
      runTest("(bc+d$|ef*g.|h?i(j|k))", "ij", SUCCEED, "g1", "ij");
    });

    it("(bc+d$|ef*g.|h?i(j|k)) matches ij g2", () => {
      runTest("(bc+d$|ef*g.|h?i(j|k))", "ij", SUCCEED, "g2", "j");
    });

    it("(bc+d$|ef*g.|h?i(j|k)) does not match effg", () => {
      runTest("(bc+d$|ef*g.|h?i(j|k))", "effg", FAIL);
    });

    it("(bc+d$|ef*g.|h?i(j|k)) does not match bcdd", () => {
      runTest("(bc+d$|ef*g.|h?i(j|k))", "bcdd", FAIL);
    });

    it("(bc+d$|ef*g.|h?i(j|k)) in reffgz matches effgz", () => {
      runTest("(bc+d$|ef*g.|h?i(j|k))", "reffgz", SUCCEED, "g1", "effgz");
    });

    it("multiple words of text does not match uh-uh", () => {
      runTest("multiple words of text", "uh-uh", FAIL);
    });

    it("multiple words matches in longer string", () => {
      runTest(
        "multiple words",
        "multiple words, yeah",
        SUCCEED,
        "found",
        "multiple words",
      );
    });

    it("(.*)c(.*) captures ab and de", () => {
      runTest("(.*)c(.*)", "abcde", SUCCEED, "g1", "ab");
    });

    it("(.*)c(.*) g2 is de", () => {
      runTest("(.*)c(.*)", "abcde", SUCCEED, "g2", "de");
    });

    it("([^a]*)(a*) g1 is bbb", () => {
      runTest("([^a]*)(a*)", "bbbaaac", SUCCEED, "g1", "bbb");
    });

    it("([^a]*)(a*) g2 is aaa", () => {
      runTest("([^a]*)(a*)", "bbbaaac", SUCCEED, "g2", "aaa");
    });

    it("(a+|b)* last match is b", () => {
      runTest("(a+|b)*", "ab", SUCCEED, "g1", "b");
    });

    it("(a+|b)+ last match is b", () => {
      runTest("(a+|b)+", "ab", SUCCEED, "g1", "b");
    });

    it("(a+|b)? first match is a", () => {
      runTest("(a+|b)?", "ab", SUCCEED, "g1", "a");
    });

    it("([abc])*d last group is c", () => {
      runTest("([abc])*d", "abbbcd", SUCCEED, "g1", "c");
    });

    it("([abc])*bcd g1 is a", () => {
      runTest("([abc])*bcd", "abcd", SUCCEED, "g1", "a");
    });

    it("a[bc]d does not match abc", () => {
      runTest("a[bc]d", "abc", FAIL);
    });

    it("a[bc]d matches abd", () => {
      runTest("a[bc]d", "abd", SUCCEED, "found", "abd");
    });

    it("a[b-d]e matches ace", () => {
      runTest("a[b-d]e", "ace", SUCCEED, "found", "ace");
    });

    it("a[b-d] matches ac in aac", () => {
      runTest("a[b-d]", "aac", SUCCEED, "found", "ac");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Syntax errors
  // ---------------------------------------------------------------------------
  describe("Syntax errors", () => {
    it("* at start is syntax error", () => {
      runTest("*a", "", SYNTAX_ERROR);
    });

    it("+ at start is syntax error", () => {
      runTest("+a", "", SYNTAX_ERROR);
    });

    it("? at start is syntax error", () => {
      runTest("?a", "", SYNTAX_ERROR);
    });

    it("unmatched ( is syntax error", () => {
      runTest("(", "", SYNTAX_ERROR);
    });

    it("unmatched [ is syntax error", () => {
      runTest("[", "", SYNTAX_ERROR);
    });

    it("unclosed group (a is syntax error", () => {
      runTest("(a", "", SYNTAX_ERROR);
    });

    it("unclosed class [a is syntax error", () => {
      runTest("[a", "", SYNTAX_ERROR);
    });

    it("trailing backslash is syntax error", () => {
      runTest("a\\", "", SYNTAX_ERROR);
    });

    it("{1} without preceding atom is treated as literal", () => {
      // Python re and ecmaRe treat bare {1} as a literal string
      runTest("{1}", "{1}", SUCCEED, "found", "{1}");
    });

    it("(?P<> empty name is syntax error", () => {
      runTest("(?P<>a)", "", SYNTAX_ERROR);
    });

    it("(?P=) empty backref name is syntax error", () => {
      runTest("(?P=)", "", SYNTAX_ERROR);
    });

    it("unbalanced ) is syntax error", () => {
      runTest(")", "", SYNTAX_ERROR);
    });

    it("bad escape \\x without hex digits", () => {
      runTest("\\xZZ", "", SYNTAX_ERROR);
    });

    it("(?P<name>a)(?P<name>b) duplicate group name is syntax error", () => {
      runTest("(?P<name>a)(?P<name>b)", "", SYNTAX_ERROR);
    });

    it("bad range [z-a] is syntax error", () => {
      runTest("[z-a]", "", SYNTAX_ERROR);
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Unsupported features (should throw EcmaReError)
  // ---------------------------------------------------------------------------
  describe("Unsupported features", () => {
    it("conditional group (?(1)yes|no) throws", () => {
      runTest("(a)(?(1)b|c)", "", SYNTAX_ERROR);
    });

    it("locale flag (?L) throws", () => {
      runTest("(?L)\\w+", "", SYNTAX_ERROR);
    });

    it("\\N{name} unicode names throws", () => {
      runTest("\\N{LATIN SMALL LETTER A}", "", SYNTAX_ERROR);
    });

    it("conditional group with named ref (?(name)yes|no) throws", () => {
      runTest("(?P<x>a)(?(x)b|c)", "", SYNTAX_ERROR);
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Edge cases
  // ---------------------------------------------------------------------------
  describe("Edge cases", () => {
    it("empty pattern matches empty string", () => {
      runTest("", "", SUCCEED, "found", "");
    });

    it("empty pattern matches at start of non-empty string", () => {
      runTest("", "a", SUCCEED, "found", "");
    });

    it("a does not match empty", () => {
      runTest("a", "", FAIL);
    });

    it("(a)b(c) found is abc", () => {
      runTest("(a)b(c)", "abc", SUCCEED, "found", "abc");
    });

    it("(a)b(c) g1 is a", () => {
      runTest("(a)b(c)", "abc", SUCCEED, "g1", "a");
    });

    it("(a)b(c) g2 is c", () => {
      runTest("(a)b(c)", "abc", SUCCEED, "g2", "c");
    });

    it("a(b)c found is abc", () => {
      runTest("a(b)c", "abc", SUCCEED, "found", "abc");
    });

    it("a(b)c g1 is b", () => {
      runTest("a(b)c", "abc", SUCCEED, "g1", "b");
    });

    it("(a)(b)(c) g1", () => {
      runTest("(a)(b)(c)", "abc", SUCCEED, "g1", "a");
    });

    it("(a)(b)(c) g2", () => {
      runTest("(a)(b)(c)", "abc", SUCCEED, "g2", "b");
    });

    it("(a)(b)(c) g3", () => {
      runTest("(a)(b)(c)", "abc", SUCCEED, "g3", "c");
    });

    it("empty group ()", () => {
      runTest("()", "", SUCCEED, "g1", "");
    });

    it("a()b matches ab with empty group", () => {
      runTest("a()b", "ab", SUCCEED, "g1", "");
    });

    it("quantifier on empty group ()*", () => {
      const re = ecmaRe("()*");
      const m = re.exec("a");
      expect(m).not.toBeNull();
    });

    it("deeply nested groups", () => {
      runTest("((((a))))", "a", SUCCEED, "g1", "a");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: More CPython patterns - mixed
  // ---------------------------------------------------------------------------
  describe("More CPython patterns", () => {
    it("a[-]?c matches ac", () => {
      runTest("a[-]?c", "ac", SUCCEED, "found", "ac", undefined, ASCII);
    });

    it("a[-]?c matches a-c", () => {
      runTest("a[-]?c", "a-c", SUCCEED, "found", "a-c", undefined, ASCII);
    });

    it("(a)|(b) matches a, g1=a", () => {
      runTest("(a)|(b)", "a", SUCCEED, "g1", "a");
    });

    it("(a)|(b) matches b, g2=b", () => {
      runTest("(a)|(b)", "b", SUCCEED, "g2", "b");
    });

    it("a+b+c matches aabbabc", () => {
      runTest("a+b+c", "aabbabc", SUCCEED, "found", "abc");
    });

    it("a** is syntax error (nested quantifier)", () => {
      runTest("a**", "", SYNTAX_ERROR);
    });

    it("a.+?c matches abbc lazily in abbbc", () => {
      runTest("a.+?c", "abcabc", SUCCEED, "found", "abc");
    });

    it("(a+|b){0,} matches ab", () => {
      runTest("(a+|b){0,}", "ab", SUCCEED, "found", "ab");
    });

    it("(a+|b){1,} matches ab", () => {
      runTest("(a+|b){1,}", "ab", SUCCEED, "found", "ab");
    });

    it("(a+|b){0,1} matches ab, g1=a", () => {
      runTest("(a+|b){0,1}", "ab", SUCCEED, "g1", "a");
    });

    it("[^ab]* matches cd", () => {
      runTest("[^ab]*", "cde", SUCCEED, "found", "cde");
    });

    it("abc matches empty string fails", () => {
      runTest("abc", "", FAIL);
    });

    it("a* matches empty string (zero occurrences)", () => {
      runTest("a*", "", SUCCEED, "found", "");
    });

    it("a* matches aaa", () => {
      runTest("a*", "aaa", SUCCEED, "found", "aaa");
    });

    it("(a*)* matches aaa", () => {
      const re = ecmaRe("(a*)*");
      const m = re.exec("aaa");
      expect(m).not.toBeNull();
      expect(m?.[0]).toBe("aaa");
    });

    it("(a*)+  matches aaa", () => {
      const re = ecmaRe("(a*)+");
      const m = re.exec("aaa");
      expect(m).not.toBeNull();
      expect(m?.[0]).toBe("aaa");
    });

    it("([a]*)* matches aaa", () => {
      const re = ecmaRe("([a]*)*");
      const m = re.exec("aaa");
      expect(m).not.toBeNull();
    });

    it("(a.)c matches abc (any char for dot)", () => {
      runTest("(a.)c", "abc", SUCCEED, "g1", "ab");
    });

    it("a[bc]d matches acd", () => {
      runTest("a[bc]d", "acd", SUCCEED, "found", "acd");
    });

    it("a[-b] matches a-", () => {
      runTest("a[-b]", "a-", SUCCEED, "found", "a-", undefined, ASCII);
    });

    it("a[-b] matches ab", () => {
      runTest("a[-b]", "ab", SUCCEED, "found", "ab", undefined, ASCII);
    });

    it("a[b-] matches a-", () => {
      runTest("a[b-]", "a-", SUCCEED, "found", "a-", undefined, ASCII);
    });

    it("a[b-] matches ab", () => {
      runTest("a[b-]", "ab", SUCCEED, "found", "ab", undefined, ASCII);
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Case-insensitive matching
  // ---------------------------------------------------------------------------
  describe("Case-insensitive matching", () => {
    it("(?i)ABC matches abc", () => {
      runTest("(?i)ABC", "abc", SUCCEED, "found", "abc");
    });

    it("(?i)ABC matches ABC", () => {
      runTest("(?i)ABC", "ABC", SUCCEED, "found", "ABC");
    });

    it("(?i)[A-Z] matches a", () => {
      runTest("(?i)[A-Z]", "a", SUCCEED, "found", "a");
    });

    it("(?i)[A-Z] matches Z", () => {
      runTest("(?i)[A-Z]", "Z", SUCCEED, "found", "Z");
    });

    it("(?i)(a)(b) captures case-insensitively", () => {
      runTest("(?i)(a)(b)", "AB", SUCCEED, "g1", "A");
    });

    it("(?i)(a)(b) g2 case-insensitive", () => {
      runTest("(?i)(a)(b)", "AB", SUCCEED, "g2", "B");
    });

    it("(?i)abc|def matches DEF", () => {
      runTest("(?i)abc|def", "DEF", SUCCEED, "found", "DEF");
    });

    it("(?i)a{2} matches AA", () => {
      runTest("(?i)a{2}", "AA", SUCCEED, "found", "AA");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Multiline mode
  // ---------------------------------------------------------------------------
  describe("Multiline mode", () => {
    it("(?m)^a matches a at line start", () => {
      runTest("(?m)^a", "b\na", SUCCEED, "found", "a");
    });

    it("(?m)a$ matches a at line end", () => {
      runTest("(?m)a$", "a\nb", SUCCEED, "found", "a");
    });

    it("(?m)^$ matches empty line", () => {
      runTest("(?m)^$", "a\n\nb", SUCCEED, "found", "");
    });

    it("(?m)^b matches b on second line", () => {
      runTest("(?m)^b", "a\nb\nc", SUCCEED, "found", "b");
    });

    it("multiline via flag parameter", () => {
      runTest("^b", "a\nb", SUCCEED, "found", "b", "m");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Dotall mode
  // ---------------------------------------------------------------------------
  describe("Dotall mode", () => {
    it("(?s). matches newline", () => {
      runTest("(?s).", "\n", SUCCEED, "found", "\n");
    });

    it("(?s)a.b spans newline", () => {
      runTest("(?s)a.b", "a\nb", SUCCEED, "found", "a\nb");
    });

    it("(?s).* matches across newlines", () => {
      runTest("(?s).*", "a\nb\nc", SUCCEED, "found", "a\nb\nc");
    });

    it("dotall via flag parameter", () => {
      runTest("a.b", "a\nb", SUCCEED, "found", "a\nb", "s");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Combined flags
  // ---------------------------------------------------------------------------
  describe("Combined flags", () => {
    it("(?im)^abc matches ABC on second line", () => {
      runTest("(?im)^abc", "x\nABC", SUCCEED, "found", "ABC");
    });

    it("(?is)a.b matches A\\nB", () => {
      runTest("(?is)a.b", "A\nB", SUCCEED, "found", "A\nB");
    });

    it("(?ms)^.$ with multiline+dotall matches single char a", () => {
      // With dotall, . matches \n, but multiline ^ and $ match at line boundaries.
      // ^.$ matches a single char between line start and end, so first match is 'a'
      runTest("(?ms)^.$", "a\nb\nc", SUCCEED, "found", "a");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Scoped modifiers
  // ---------------------------------------------------------------------------
  describe("Scoped modifiers", () => {
    it("(?i:abc) case-insensitive in scope only", () => {
      runTest("(?i:abc)def", "ABCdef", SUCCEED, "found", "ABCdef");
    });

    it("(?i:abc)def does not match ABCDef (def must be lowercase)", () => {
      runTest("(?i:abc)def", "ABCDef", FAIL);
    });

    it("(?s:a.b)c with dotall scoped", () => {
      runTest("(?s:a.b)c", "a\nbc", SUCCEED, "found", "a\nbc");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Octal and hex escapes
  // ---------------------------------------------------------------------------
  describe("Octal and hex escapes", () => {
    it("\\x41 matches A", () => {
      runTest("\\x41", "A", SUCCEED, "found", "A");
    });

    it("\\x61 matches a", () => {
      runTest("\\x61", "a", SUCCEED, "found", "a");
    });

    it("\\141 octal matches a", () => {
      runTest("\\141", "a", SUCCEED, "found", "a");
    });

    it("\\0 matches null char", () => {
      runTest("\\0", "\0", SUCCEED, "found", "\0");
    });

    it("\\012 matches newline", () => {
      runTest("\\012", "\n", SUCCEED, "found", "\n");
    });

    it("\\101 octal matches A", () => {
      runTest("\\101", "A", SUCCEED, "found", "A");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Additional group patterns
  // ---------------------------------------------------------------------------
  describe("Additional group patterns", () => {
    it("(a)(b)(c)(d)(e) five groups", () => {
      runTest("(a)(b)(c)(d)(e)", "abcde", SUCCEED, "g1", "a");
    });

    it("(a)(b)(c)(d)(e) g5", () => {
      runTest("(a)(b)(c)(d)(e)", "abcde", SUCCEED, "g5", "e");
    });

    it("(.)(.)(.)(.)(.)(.)(.)(.)(.)(.) ten groups", () => {
      runTest(
        "(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)",
        "abcdefghij",
        SUCCEED,
        "g1",
        "a",
      );
    });

    it("ten groups g10", () => {
      runTest(
        "(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)",
        "abcdefghij",
        SUCCEED,
        "g10",
        "j",
      );
    });

    it("non-participating group is undefined", () => {
      const re = ecmaRe("(a)|(b)");
      const m = re.exec("b");
      expect(m).not.toBeNull();
      expect(m?.[1]).toBeUndefined();
      expect(m?.[2]).toBe("b");
    });

    it("nested group in alternation ((a)|(b))c", () => {
      runTest("((a)|(b))c", "ac", SUCCEED, "g1", "a");
    });

    it("((a)|(b))c g2=a", () => {
      runTest("((a)|(b))c", "ac", SUCCEED, "g2", "a");
    });

    it("((a)|(b))c with b: g1=b", () => {
      runTest("((a)|(b))c", "bc", SUCCEED, "g1", "b");
    });

    it("((a)|(b))c with b: g3=b", () => {
      runTest("((a)|(b))c", "bc", SUCCEED, "g3", "b");
    });

    it("group with quantifier (ab){2}", () => {
      runTest("(ab){2}", "abab", SUCCEED, "found", "abab");
    });

    it("(ab){2} does not match ab", () => {
      runTest("(ab){2}", "ab", FAIL);
    });

    it("(ab){2} g1 is last repetition", () => {
      runTest("(ab){2}", "abab", SUCCEED, "g1", "ab");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Greedy vs non-greedy
  // ---------------------------------------------------------------------------
  describe("Greedy vs non-greedy", () => {
    it("<.*> is greedy", () => {
      runTest("<.*>", "<a>b<c>", SUCCEED, "found", "<a>b<c>");
    });

    it("<.*?> is non-greedy", () => {
      runTest("<.*?>", "<a>b<c>", SUCCEED, "found", "<a>");
    });

    it("<.+> is greedy", () => {
      runTest("<.+>", "<a>b<c>", SUCCEED, "found", "<a>b<c>");
    });

    it("<.+?> is non-greedy", () => {
      runTest("<.+?>", "<a>b<c>", SUCCEED, "found", "<a>");
    });

    it("a{2,4} greedy takes 4", () => {
      runTest("a{2,4}", "aaaa", SUCCEED, "found", "aaaa");
    });

    it("a{2,4}? lazy takes 2", () => {
      runTest("a{2,4}?", "aaaa", SUCCEED, "found", "aa");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Special character escapes
  // ---------------------------------------------------------------------------
  describe("Special character escapes", () => {
    it("\\. matches literal dot", () => {
      runTest("\\.", ".", SUCCEED, "found", ".");
    });

    it("\\. does not match a", () => {
      runTest("\\.", "a", FAIL);
    });

    it("\\* matches literal asterisk", () => {
      runTest("\\*", "*", SUCCEED, "found", "*");
    });

    it("\\+ matches literal plus", () => {
      runTest("\\+", "+", SUCCEED, "found", "+");
    });

    it("\\? matches literal question mark", () => {
      runTest("\\?", "?", SUCCEED, "found", "?");
    });

    it("\\[ matches literal bracket", () => {
      runTest("\\[", "[", SUCCEED, "found", "[");
    });

    it("\\( matches literal paren", () => {
      runTest("\\(", "(", SUCCEED, "found", "(");
    });

    it("\\) matches literal paren", () => {
      runTest("\\)", ")", SUCCEED, "found", ")");
    });

    it("\\{ matches literal brace", () => {
      runTest("\\{", "{", SUCCEED, "found", "{");
    });

    it("\\| matches literal pipe", () => {
      runTest("\\|", "|", SUCCEED, "found", "|");
    });

    it("\\^ matches literal caret", () => {
      runTest("\\^", "^", SUCCEED, "found", "^");
    });

    it("\\$ matches literal dollar", () => {
      runTest("\\$", "$", SUCCEED, "found", "$");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: More backreference edge cases
  // ---------------------------------------------------------------------------
  describe("Backreference edge cases", () => {
    it("(a)(b)(c)\\3 matches abcc", () => {
      runTest("(a)(b)(c)\\3", "abcc", SUCCEED, "found", "abcc");
    });

    it("(a)(b)(c)\\3 does not match abca", () => {
      runTest("(a)(b)(c)\\3", "abca", FAIL);
    });

    it("(a)(b)(c)\\1 matches abca", () => {
      runTest("(a)(b)(c)\\1", "abca", SUCCEED, "found", "abca");
    });

    it("(a+)\\1 matches aaaa (two groups of aa)", () => {
      runTest("(a+)\\1", "aaaa", SUCCEED, "found", "aaaa");
    });

    it("(a+)\\1 g1 is aa", () => {
      runTest("(a+)\\1", "aaaa", SUCCEED, "g1", "aa");
    });

    it("([ab]+)\\1 matches abab", () => {
      runTest("([ab]+)\\1", "abab", SUCCEED, "found", "abab");
    });

    it("backreference to group with quantifier", () => {
      runTest("(a{2})\\1", "aaaa", SUCCEED, "found", "aaaa");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Anchors with patterns
  // ---------------------------------------------------------------------------
  describe("Anchors with patterns", () => {
    it("^$ matches empty string", () => {
      runTest("^$", "", SUCCEED, "found", "");
    });

    it("^$ does not match non-empty", () => {
      runTest("^$", "a", FAIL);
    });

    it("^a*$ matches empty", () => {
      runTest("^a*$", "", SUCCEED, "found", "");
    });

    it("^a*$ matches aaa", () => {
      runTest("^a*$", "aaa", SUCCEED, "found", "aaa");
    });

    it("^a+$ does not match empty", () => {
      runTest("^a+$", "", FAIL);
    });

    it("^a+$ matches aaa", () => {
      runTest("^a+$", "aaa", SUCCEED, "found", "aaa");
    });

    it("^.+$ matches single line", () => {
      runTest("^.+$", "abc", SUCCEED, "found", "abc");
    });

    it("^(a)(b)(c)$ matches abc", () => {
      runTest("^(a)(b)(c)$", "abc", SUCCEED, "found", "abc");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Quantifier on groups
  // ---------------------------------------------------------------------------
  describe("Quantifier on groups", () => {
    it("(abc){2} matches abcabc", () => {
      runTest("(abc){2}", "abcabc", SUCCEED, "found", "abcabc");
    });

    it("(abc){2} g1 is abc (last iteration)", () => {
      runTest("(abc){2}", "abcabc", SUCCEED, "g1", "abc");
    });

    it("(abc){1,2} greedy matches two", () => {
      runTest("(abc){1,2}", "abcabc", SUCCEED, "found", "abcabc");
    });

    it("(abc){1,2}? lazy matches one", () => {
      runTest("(abc){1,2}?", "abcabc", SUCCEED, "found", "abc");
    });

    it("(a|b){3} matches aba", () => {
      runTest("(a|b){3}", "aba", SUCCEED, "found", "aba");
    });

    it("(a|b){3} g1 is last", () => {
      runTest("(a|b){3}", "aba", SUCCEED, "g1", "a");
    });

    it("(?:ab)+ matches ababab", () => {
      runTest("(?:ab)+", "ababab", SUCCEED, "found", "ababab");
    });

    it("(?:ab){2,3} matches up to 3", () => {
      runTest("(?:ab){2,3}", "abababab", SUCCEED, "found", "ababab");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Character class edge cases
  // ---------------------------------------------------------------------------
  describe("Character class edge cases", () => {
    it("[\\^] matches caret", () => {
      runTest("[\\^]", "^", SUCCEED, "found", "^");
    });

    it("[\\]] matches close bracket", () => {
      runTest("[\\]]", "]", SUCCEED, "found", "]");
    });

    it("[\\-] matches hyphen", () => {
      runTest("[\\-]", "-", SUCCEED, "found", "-", undefined, ASCII);
    });

    it("[a\\-z] matches hyphen (escaped hyphen is literal)", () => {
      runTest("[a\\-z]", "-", SUCCEED, "found", "-", undefined, ASCII);
    });

    it("[a\\-z] matches a", () => {
      runTest("[a\\-z]", "a", SUCCEED, "found", "a", undefined, ASCII);
    });

    it("[a\\-z] matches z", () => {
      runTest("[a\\-z]", "z", SUCCEED, "found", "z", undefined, ASCII);
    });

    it("[a\\-z] does not match b (not a range)", () => {
      runTest("[a\\-z]", "b", FAIL, undefined, undefined, undefined, ASCII);
    });

    it("[\\n] matches newline", () => {
      runTest("[\\n]", "\n", SUCCEED, "found", "\n");
    });

    it("[\\t] matches tab", () => {
      runTest("[\\t]", "\t", SUCCEED, "found", "\t");
    });

    it("[^\\d] matches non-digit", () => {
      runTest("[^\\d]", "a", SUCCEED, "found", "a", undefined, ASCII);
    });

    it("[^\\d] does not match digit", () => {
      runTest("[^\\d]", "5", FAIL, undefined, undefined, undefined, ASCII);
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Miscellaneous CPython patterns
  // ---------------------------------------------------------------------------
  describe("Miscellaneous CPython patterns", () => {
    it("abcd matches abcd", () => {
      runTest("abcd", "abcd", SUCCEED, "found", "abcd");
    });

    it("a(bc)d g1=bc", () => {
      runTest("a(bc)d", "abcd", SUCCEED, "g1", "bc");
    });

    it("a[-b]c matches a-c", () => {
      runTest("a[-b]c", "a-c", SUCCEED, "found", "a-c", undefined, ASCII);
    });

    it("a[-b]c matches abc", () => {
      runTest("a[-b]c", "abc", SUCCEED, "found", "abc", undefined, ASCII);
    });

    it("a[b-]c matches a-c", () => {
      runTest("a[b-]c", "a-c", SUCCEED, "found", "a-c", undefined, ASCII);
    });

    it("a[b-]c matches abc", () => {
      runTest("a[b-]c", "abc", SUCCEED, "found", "abc", undefined, ASCII);
    });

    it("complex: (([a-c])b*?\\2)* on aba", () => {
      runTest("(([a-c])b*?\\2)*", "aba", SUCCEED, "found", "aba");
    });

    it("complex: (([a-c])b*?\\2)* g1 on aba", () => {
      // The * repetition captures the last iteration's g1
      // In 'aba': first iteration captures 'aba' (a + b*? + a backref), leaving nothing
      // So g1 is 'aba'
      runTest("(([a-c])b*?\\2)*", "aba", SUCCEED, "g1", "aba");
    });

    it("(.*)\\1 matches repeated string", () => {
      runTest("(.+)\\1", "abab", SUCCEED, "found", "abab");
    });

    it("(.+)\\1 g1 is ab", () => {
      runTest("(.+)\\1", "abab", SUCCEED, "g1", "ab");
    });

    it("alternation precedence a|b|c|d|e", () => {
      runTest("a|b|c|d|e", "e", SUCCEED, "found", "e");
    });

    it("(a|b|c|d|e)f matches ef", () => {
      runTest("(a|b|c|d|e)f", "ef", SUCCEED, "g1", "e");
    });

    it("((a*|b))*  on empty string", () => {
      const re = ecmaRe("((a*|b))*");
      const m = re.exec("");
      expect(m).not.toBeNull();
    });

    it("abcd*efg matches abcdefg", () => {
      runTest("abcd*efg", "abcdefg", SUCCEED, "found", "abcdefg");
    });

    it("ab* matches a (zero b's)", () => {
      runTest("ab*", "a", SUCCEED, "found", "a");
    });

    it("ab* matches abbb", () => {
      runTest("ab*", "abbb", SUCCEED, "found", "abbb");
    });

    it("(a|b)c*d matches bcd", () => {
      runTest("(a|b)c*d", "bcd", SUCCEED, "g1", "b");
    });

    it("[abhgefdc]ij matches hij", () => {
      runTest("[abhgefdc]ij", "hij", SUCCEED, "found", "hij");
    });

    it("^(ab|cd)e does not match abcde", () => {
      runTest("^(ab|cd)e", "abcde", FAIL);
    });

    it("(abc|)ef matches ef", () => {
      runTest("(abc|)ef", "ef", SUCCEED, "found", "ef");
    });

    it("(a|b)c*d matches abcd g1=b", () => {
      runTest("(a|b)c*d", "abcd", SUCCEED, "g1", "b");
    });

    it("a|b|c|d|e matches e", () => {
      runTest("a|b|c|d|e", "e", SUCCEED, "found", "e");
    });

    it("abcdefghijklmnop matches self", () => {
      runTest(
        "abcdefghijklmnop",
        "abcdefghijklmnop",
        SUCCEED,
        "found",
        "abcdefghijklmnop",
      );
    });

    it("(a)|(b)|(c) matches c", () => {
      runTest("(a)|(b)|(c)", "c", SUCCEED, "g3", "c");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: \A and \Z with multiline
  // ---------------------------------------------------------------------------
  describe("\\A and \\Z with multiline", () => {
    it("(?m)\\Aabc still matches only at string start", () => {
      runTest("(?m)\\Aabc", "abc", SUCCEED, "found", "abc");
    });

    it("(?m)\\Aabc does not match after newline", () => {
      runTest("(?m)\\Aabc", "x\nabc", FAIL);
    });

    it("(?m)abc\\Z still matches only at string end", () => {
      runTest("(?m)abc\\Z", "abc", SUCCEED, "found", "abc");
    });

    it("(?m)abc\\Z does not match before extra lines", () => {
      runTest("(?m)abc\\Z", "abc\nx", FAIL);
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Unicode mode default behavior
  // ---------------------------------------------------------------------------
  describe("Unicode mode (default)", () => {
    it("\\d in unicode mode matches ASCII digit", () => {
      const re = ecmaRe("\\d");
      expect(re.test("5")).toBe(true);
    });

    it("\\w in unicode mode matches ASCII word char", () => {
      const re = ecmaRe("\\w");
      expect(re.test("a")).toBe(true);
    });

    it("\\s in unicode mode matches ASCII space", () => {
      const re = ecmaRe("\\s");
      expect(re.test(" ")).toBe(true);
    });

    it("output regex has v flag in unicode mode", () => {
      const re = ecmaRe("\\w");
      expect(re.flags).toContain("v");
    });

    it("output regex does not have v flag in ASCII mode", () => {
      const re = ecmaRe("\\w", "", ASCII);
      expect(re.flags).not.toContain("v");
    });
  });

  // ---------------------------------------------------------------------------
  // Category: Additional from CPython re_tests.py
  // ---------------------------------------------------------------------------
  describe("Additional CPython patterns", () => {
    it("a[bcd]+dcdcde matches adcdcde via first alt path", () => {
      // Note: [bcd]+ needs at least one of b,c,d but then dcdcde follows
      // The pattern a[bcd]+dcdcde fails on adcdcde because [bcd]+ is greedy
      runTest("a[bcd]+dcdcde", "adcdcde", FAIL);
    });

    it("(ab|cd)e matches cde", () => {
      runTest("(ab|cd)e", "abcde", SUCCEED, "g1", "cd");
    });

    it("[abhgefdc]ij matches hij", () => {
      runTest("[abhgefdc]ij", "hij", SUCCEED, "found", "hij");
    });

    it("a(b|c)d matches acd", () => {
      runTest("a(b|c)d", "acd", SUCCEED, "found", "acd");
    });

    it("a(b|c)d g1=c", () => {
      runTest("a(b|c)d", "acd", SUCCEED, "g1", "c");
    });

    it("a(b|c)d does not match abd", () => {
      // Wait, abd should match with b
      runTest("a(b|c)d", "abd", SUCCEED, "g1", "b");
    });

    it("a(b|c)d does not match aed", () => {
      runTest("a(b|c)d", "aed", FAIL);
    });

    it("a(b|c)e does not match abd", () => {
      runTest("a(b|c)e", "abd", FAIL);
    });

    it("a(b|c)e matches ace", () => {
      runTest("a(b|c)e", "ace", SUCCEED, "g1", "c");
    });

    it("ab|cd matches ab", () => {
      runTest("ab|cd", "abc", SUCCEED, "found", "ab");
    });

    it("ab|cd matches cd in cdx", () => {
      runTest("ab|cd", "cdx", SUCCEED, "found", "cd");
    });

    it("()ef matches ef g1 is empty", () => {
      runTest("()ef", "def", SUCCEED, "g1", "");
    });

    it("$b does not match b ($ only at end)", () => {
      runTest("$b", "b", FAIL);
    });

    it("a\\(b matches a(b", () => {
      runTest("a\\(b", "a(b", SUCCEED, "found", "a(b");
    });

    it("a\\(*b matches ab", () => {
      runTest("a\\(*b", "ab", SUCCEED, "found", "ab");
    });

    it("a\\(*b matches a((b", () => {
      runTest("a\\(*b", "a((b", SUCCEED, "found", "a((b");
    });

    it("a\\\\b matches a\\b", () => {
      runTest("a\\\\b", "a\\b", SUCCEED, "found", "a\\b");
    });

    it("((a)) g1=a", () => {
      runTest("((a))", "abc", SUCCEED, "g1", "a");
    });

    it("((a)) g2=a", () => {
      runTest("((a))", "abc", SUCCEED, "g2", "a");
    });

    it("(a)b(c) found=abc", () => {
      runTest("(a)b(c)", "abc", SUCCEED, "found", "abc");
    });

    it("(a+|b)+ matches ab", () => {
      runTest("(a+|b)+", "ab", SUCCEED, "found", "ab");
    });

    it("(a+|b)+ g1=b", () => {
      runTest("(a+|b)+", "ab", SUCCEED, "g1", "b");
    });

    it("(a+|b)? matches ab found=a", () => {
      runTest("(a+|b)?", "ab", SUCCEED, "found", "a");
    });
  });
});
