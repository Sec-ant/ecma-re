import { EcmaReError } from "./errors";
import type {
  AlternationNode,
  AssertionNode,
  BackreferenceNode,
  CharClassBackspace,
  CharClassLiteral,
  CharClassMember,
  CharClassNode,
  CharClassRange,
  CharClassShorthand,
  CommentNode,
  ConditionalNode,
  DotNode,
  GroupNode,
  LiteralNode,
  Node,
  QuantifierNode,
  SequenceNode,
  ShorthandNode,
} from "./types";
import { lookupNamedCodePoint } from "./unicode-names";

export interface ParseResult {
  ast: Node;
  groupCount: number;
  namedGroups: Map<string, number>;
  globalFlags: string;
}

function isWhitespace(ch: string): boolean {
  switch (ch) {
    case " ":
    case "\t":
    case "\n":
    case "\r":
    case "\f":
    case "\v":
      return true;
    default:
      return false;
  }
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isAsciiLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isHexDigit(ch: string): boolean {
  return (
    (ch >= "0" && ch <= "9") ||
    (ch >= "a" && ch <= "f") ||
    (ch >= "A" && ch <= "F")
  );
}

function isGlobalFlag(ch: string): boolean {
  switch (ch) {
    case "a":
    case "i":
    case "L":
    case "m":
    case "s":
    case "u":
    case "x":
      return true;
    default:
      return false;
  }
}

function isInlineFlagChar(ch: string): boolean {
  return ch === "-" || isGlobalFlag(ch);
}

function isValidGroupName(name: string): boolean {
  return /^(?:_|\p{XID_Start})(?:_|\p{XID_Continue})*$/u.test(name);
}

function uniqueFlags(flags: string): string {
  let unique = "";
  for (const flag of flags) {
    if (!unique.includes(flag)) unique += flag;
  }
  return unique;
}

function validateInlineFlags(
  flags: string,
  negFlags: string,
  pos: number,
): { flags: string; negFlags: string } {
  const uniquePositive = uniqueFlags(flags);
  const uniqueNegative = uniqueFlags(negFlags);
  let modeFlagCount = 0;

  for (const flag of "aLu") {
    if (uniquePositive.includes(flag)) modeFlagCount++;
    if (uniqueNegative.includes(flag)) {
      throw new EcmaReError("Cannot turn off flags 'a', 'u' and 'L'", pos);
    }
  }
  if (modeFlagCount > 1) {
    throw new EcmaReError("Flags 'a', 'u' and 'L' are incompatible", pos);
  }

  for (const flag of uniquePositive) {
    if (uniqueNegative.includes(flag)) {
      throw new EcmaReError("Flag turned on and off", pos);
    }
  }

  return { flags: uniquePositive, negFlags: uniqueNegative };
}

interface Width {
  min: number;
  max: number;
}

export function hasLeadingGlobalVerboseFlag(pattern: string): boolean {
  if (pattern.charAt(0) !== "(" || pattern.charAt(1) !== "?") {
    return false;
  }

  let i = 2;
  let hasFlags = false;
  let hasVerboseFlag = false;

  while (i < pattern.length && isGlobalFlag(pattern.charAt(i))) {
    hasFlags = true;
    if (pattern.charAt(i) === "x") {
      hasVerboseFlag = true;
    }
    i++;
  }

  return hasFlags && pattern.charAt(i) === ")" && hasVerboseFlag;
}

export function parse(
  pattern: string,
  verboseMode = false,
  options?: { allowVariableLengthLookbehind?: boolean },
): ParseResult {
  const input = preprocessVerbose(pattern, verboseMode);
  const parser = new Parser(
    input,
    options?.allowVariableLengthLookbehind ?? false,
  );
  const ast = parser.parsePattern();
  return {
    ast,
    groupCount: parser.groupCount,
    namedGroups: parser.namedGroups,
    globalFlags: parser.globalFlags,
  };
}

/**
 * Preprocess verbose mode pattern: strip unescaped whitespace and # comments
 * outside character classes, respecting scoped (?x:...) / (?-x:...) groups.
 */
export function preprocessVerbose(
  pattern: string,
  initialVerbose = true,
): string {
  const parts: string[] = [];
  let i = 0;
  let verbose = initialVerbose;
  const verboseStack: boolean[] = [];

  while (i < pattern.length) {
    const ch = pattern.charAt(i);

    // Escaped character: keep as-is
    if (ch === "\\" && i + 1 < pattern.length) {
      const namedUnicodeEscape = readNamedUnicodeEscapeText(pattern, i);
      if (namedUnicodeEscape) {
        parts.push(namedUnicodeEscape.text);
        i = namedUnicodeEscape.next;
        continue;
      }
      parts.push(pattern.slice(i, i + 2));
      i += 2;
      continue;
    }

    // Character class: copy verbatim (including nested escapes)
    if (ch === "[") {
      let j = i + 1;
      // Handle ] at start of character class
      if (j < pattern.length && pattern.charAt(j) === "^") {
        j++;
      }
      if (j < pattern.length && pattern.charAt(j) === "]") {
        j++;
      }
      while (j < pattern.length) {
        if (pattern.charAt(j) === "\\" && j + 1 < pattern.length) {
          j += 2;
          continue;
        }
        if (pattern.charAt(j) === "]") {
          j++;
          break;
        }
        j++;
      }
      parts.push(pattern.slice(i, j));
      i = j;
      continue;
    }

    if (ch === "(" && pattern.charAt(i + 1) === "?") {
      const group = readSpecialGroupPrefix(pattern, i, verbose);
      if (group) {
        parts.push(group.text);
        i = group.next;
        if (group.kind === "scoped") {
          verboseStack.push(verbose);
          verbose = group.verbose;
        } else if (group.kind === "global") {
          verbose = group.verbose;
        }
        continue;
      }
    }

    if (ch === "(") {
      verboseStack.push(verbose);
      parts.push(ch);
      i++;
      continue;
    }

    if (ch === ")") {
      parts.push(ch);
      if (verboseStack.length > 0) {
        verbose = verboseStack.pop()!;
      }
      i++;
      continue;
    }

    if (!verbose) {
      parts.push(ch);
      i++;
      continue;
    }

    if (ch === "{") {
      const brace = readVerboseBraceLiteral(pattern, i);
      if (brace) {
        parts.push(brace.text);
        i = brace.next;
        continue;
      }
    }

    // Unescaped # starts a comment until end of line
    if (ch === "#") {
      while (i < pattern.length && pattern.charAt(i) !== "\n") {
        i++;
      }
      // Skip the \n too
      if (i < pattern.length) i++;
      continue;
    }

    // Unescaped whitespace: skip
    if (isWhitespace(ch)) {
      if (isQuantifierSuffixGap(parts, pattern, i)) {
        throw new EcmaReError("Multiple repeat", i);
      }
      i++;
      continue;
    }

    parts.push(ch);
    i++;
  }

  return parts.join("");
}

function lastOutputChar(parts: string[]): string {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]!;
    if (part.length > 0) return part.charAt(part.length - 1);
  }
  return "";
}

function nextNonWhitespace(pattern: string, start: number): string {
  let i = start;
  while (i < pattern.length && isWhitespace(pattern.charAt(i))) {
    i++;
  }
  return pattern.charAt(i);
}

function isQuantifierSuffixGap(
  parts: string[],
  pattern: string,
  whitespaceStart: number,
): boolean {
  const previous = lastOutputChar(parts);
  if (
    previous !== "*" &&
    previous !== "+" &&
    previous !== "?" &&
    previous !== "}"
  ) {
    return false;
  }
  const next = nextNonWhitespace(pattern, whitespaceStart);
  return next === "?" || next === "+";
}

function readVerboseBraceLiteral(
  pattern: string,
  start: number,
): { text: string; next: number } | null {
  const end = readUntil(pattern, start + 1, "}");
  if (end >= pattern.length) return null;

  const rawBody = pattern.slice(start + 1, end);
  if (!/[ \t\n\r\f\v]/.test(rawBody)) return null;

  const strippedBody = rawBody.replace(/[ \t\n\r\f\v]+/g, "");
  if (!/^(?:\d+|\d*,\d*)$/.test(strippedBody)) return null;

  return {
    text: `\\{${strippedBody}\\}`,
    next: end + 1,
  };
}

function readNamedUnicodeEscapeText(
  pattern: string,
  start: number,
): { text: string; next: number } | null {
  if (
    pattern.charAt(start) !== "\\" ||
    pattern.charAt(start + 1) !== "N" ||
    pattern.charAt(start + 2) !== "{"
  ) {
    return null;
  }

  let end = start + 3;
  while (end < pattern.length && pattern.charAt(end) !== "}") {
    end++;
  }
  return {
    text: pattern.slice(start, end < pattern.length ? end + 1 : end),
    next: end < pattern.length ? end + 1 : end,
  };
}

type SpecialGroupPrefix =
  | { kind: "scoped"; text: string; next: number; verbose: boolean }
  | { kind: "global"; text: string; next: number; verbose: boolean }
  | { kind: "plain"; text: string; next: number };

function readUntil(pattern: string, start: number, end: string): number {
  let i = start;
  while (i < pattern.length && pattern.charAt(i) !== end) {
    if (pattern.charAt(i) === "\\" && i + 1 < pattern.length) {
      i += 2;
    } else {
      i++;
    }
  }
  return i;
}

function readInvalidSpecialGroup(
  pattern: string,
  start: number,
): SpecialGroupPrefix {
  const end = readUntil(pattern, start, ")");
  return {
    kind: "plain",
    text: pattern.slice(start, end < pattern.length ? end + 1 : end),
    next: end < pattern.length ? end + 1 : end,
  };
}

function applyVerboseFlags(
  current: boolean,
  flags: string,
  negFlags = "",
): boolean {
  if (flags.includes("x")) return true;
  if (negFlags.includes("x")) return false;
  return current;
}

function readSpecialGroupPrefix(
  pattern: string,
  start: number,
  currentVerbose: boolean,
): SpecialGroupPrefix | null {
  const specifier = pattern.charAt(start + 2);

  switch (specifier) {
    case ":":
    case "=":
    case "!":
    case ">":
      return {
        kind: "scoped",
        text: pattern.slice(start, start + 3),
        next: start + 3,
        verbose: currentVerbose,
      };
    case "<": {
      const lookbehindKind = pattern.charAt(start + 3);
      if (lookbehindKind === "=" || lookbehindKind === "!") {
        return {
          kind: "scoped",
          text: pattern.slice(start, start + 4),
          next: start + 4,
          verbose: currentVerbose,
        };
      }
      return readInvalidSpecialGroup(pattern, start);
    }
    case "#": {
      const end = readUntil(pattern, start + 3, ")");
      return {
        kind: "plain",
        text: pattern.slice(start, end < pattern.length ? end + 1 : end),
        next: end < pattern.length ? end + 1 : end,
      };
    }
    case "(": {
      const conditionEnd = readUntil(pattern, start + 3, ")");
      if (conditionEnd >= pattern.length) {
        return readInvalidSpecialGroup(pattern, start);
      }
      return {
        kind: "scoped",
        text: pattern.slice(start, conditionEnd + 1),
        next: conditionEnd + 1,
        verbose: currentVerbose,
      };
    }
    case "P": {
      const nameKind = pattern.charAt(start + 3);
      if (nameKind === "<") {
        const nameEnd = readUntil(pattern, start + 4, ">");
        if (nameEnd >= pattern.length) {
          return readInvalidSpecialGroup(pattern, start);
        }
        return {
          kind: "scoped",
          text: pattern.slice(start, nameEnd + 1),
          next: nameEnd + 1,
          verbose: currentVerbose,
        };
      }
      if (nameKind === "=") {
        const refEnd = readUntil(pattern, start + 4, ")");
        return {
          kind: "plain",
          text: pattern.slice(
            start,
            refEnd < pattern.length ? refEnd + 1 : refEnd,
          ),
          next: refEnd < pattern.length ? refEnd + 1 : refEnd,
        };
      }
      return readInvalidSpecialGroup(pattern, start);
    }
    default: {
      if (!isInlineFlagChar(specifier)) {
        return readInvalidSpecialGroup(pattern, start);
      }

      let cursor = start + 2;
      let flags = "";
      let negFlags = "";
      let inNeg = false;
      while (
        cursor < pattern.length &&
        isInlineFlagChar(pattern.charAt(cursor))
      ) {
        const flag = pattern.charAt(cursor);
        if (flag === "-") {
          inNeg = true;
        } else if (inNeg) {
          negFlags += flag;
        } else {
          flags += flag;
        }
        cursor++;
      }

      const end = pattern.charAt(cursor);
      if (end === ":") {
        return {
          kind: "scoped",
          text: pattern.slice(start, cursor + 1),
          next: cursor + 1,
          verbose: applyVerboseFlags(currentVerbose, flags, negFlags),
        };
      }
      if (end === ")") {
        return {
          kind: "global",
          text: pattern.slice(start, cursor + 1),
          next: cursor + 1,
          verbose: applyVerboseFlags(currentVerbose, flags),
        };
      }
      return readInvalidSpecialGroup(pattern, start);
    }
  }
}

class Parser {
  pos = 0;
  groupCount = 0;
  namedGroups: Map<string, number> = new Map();
  globalFlags = "";
  private openGroups = new Set<number>();
  private openNamedGroups = new Set<string>();
  private groupWidths = new Map<number, Width>();
  private namedGroupWidths = new Map<string, Width>();

  constructor(
    private input: string,
    private allowVariableLengthLookbehind: boolean,
  ) {}

  private get ch(): string {
    return this.input.charAt(this.pos);
  }

  private currentChar(): string {
    return this.input.charAt(this.pos);
  }

  private peek(offset = 0): string {
    return this.input.charAt(this.pos + offset);
  }

  private advance(): string {
    const c = this.input.charAt(this.pos);
    this.pos++;
    return c;
  }

  private expect(ch: string): void {
    if (this.input.charAt(this.pos) !== ch) {
      throw new EcmaReError(
        `Expected '${ch}', got '${this.input.charAt(this.pos) || "EOF"}'`,
        this.pos,
      );
    }
    this.pos++;
  }

  private atEnd(): boolean {
    return this.pos >= this.input.length;
  }

  parsePattern(): Node {
    // Check for global flags at the start (?aiLmsux)
    this.tryParseGlobalFlags();
    const node = this.parseAlternation();
    if (!this.atEnd()) {
      throw new EcmaReError(`Unexpected character '${this.ch}'`, this.pos);
    }
    return node;
  }

  private tryParseGlobalFlags(): void {
    // Global flags like (?aimsux) at very start of pattern (no body)
    const saved = this.pos;
    if (this.ch === "(" && this.peek(1) === "?") {
      let j = 2;
      let flags = "";
      while (this.pos + j < this.input.length) {
        const flag = this.input.charAt(this.pos + j);
        if (!isGlobalFlag(flag)) {
          break;
        }
        flags += flag;
        j++;
      }
      if (flags.length > 0 && this.input.charAt(this.pos + j) === ")") {
        // This is a global flag group (?flags)
        this.globalFlags = validateInlineFlags(flags, "", saved).flags;
        this.pos += j + 1;
        return;
      }
    }
    this.pos = saved;
  }

  private parseAlternation(): Node {
    const alternatives: Node[] = [this.parseSequence()];
    while (this.ch === "|") {
      this.advance(); // skip |
      alternatives.push(this.parseSequence());
    }
    if (alternatives.length === 1) return alternatives[0]!;
    return { type: "alternation", alternatives } satisfies AlternationNode;
  }

  private parseSequence(): Node {
    const elements: Node[] = [];
    while (!this.atEnd() && this.ch !== ")" && this.ch !== "|") {
      const node = this.parseQuantified();
      elements.push(node);
    }
    if (elements.length === 0)
      return { type: "sequence", elements: [] } satisfies SequenceNode;
    if (elements.length === 1) return elements[0]!;
    return { type: "sequence", elements } satisfies SequenceNode;
  }

  private parseQuantified(): Node {
    const body = this.parseAtom();

    // Check for quantifier
    if (this.atEnd()) return body;

    let min: number;
    let max: number;
    const quantifierStart = this.pos;

    switch (this.ch) {
      case "*":
        this.advance();
        min = 0;
        max = Number.POSITIVE_INFINITY;
        break;
      case "+":
        this.advance();
        min = 1;
        max = Number.POSITIVE_INFINITY;
        break;
      case "?":
        this.advance();
        min = 0;
        max = 1;
        break;
      case "{": {
        const result = this.tryParseBraceQuantifier();
        if (!result) return body;
        min = result.min;
        max = result.max;
        break;
      }
      default:
        return body;
    }

    if (body.type === "assertion") {
      throw new EcmaReError("Nothing to repeat", quantifierStart);
    }

    let greedy = true;
    let possessive = false;
    if (!this.atEnd()) {
      if (this.ch === "?") {
        greedy = false;
        this.advance();
      } else if (this.ch === "+") {
        possessive = true;
        this.advance();
      }
    }

    return {
      type: "quantifier",
      min,
      max,
      greedy,
      possessive,
      body,
    } satisfies QuantifierNode;
  }

  private tryParseBraceQuantifier(): { min: number; max: number } | null {
    const saved = this.pos;
    this.advance(); // skip {

    // Parse min
    let minStr = "";
    while (!this.atEnd() && isDigit(this.ch)) {
      minStr += this.advance();
    }
    if (minStr.length === 0 && this.ch !== ",") {
      // Not a valid quantifier, treat { as literal
      this.pos = saved;
      return null;
    }

    const min = minStr.length > 0 ? Number.parseInt(minStr, 10) : 0;
    let max = min;

    if (this.ch === ",") {
      this.advance();
      let maxStr = "";
      while (!this.atEnd() && isDigit(this.ch)) {
        maxStr += this.advance();
      }
      max =
        maxStr.length > 0
          ? Number.parseInt(maxStr, 10)
          : Number.POSITIVE_INFINITY;
    }

    if (this.ch !== "}") {
      // Not a valid quantifier
      this.pos = saved;
      return null;
    }
    this.advance(); // skip }

    if (max !== Number.POSITIVE_INFINITY && min > max) {
      throw new EcmaReError("Min repeat greater than max repeat", saved);
    }

    return { min, max };
  }

  private parseAtom(): Node {
    const ch = this.ch;

    switch (ch) {
      case ".":
        this.advance();
        return { type: "dot" } satisfies DotNode;

      case "^":
        this.advance();
        return { type: "assertion", kind: "start" } satisfies AssertionNode;

      case "$":
        this.advance();
        return { type: "assertion", kind: "end" } satisfies AssertionNode;

      case "[":
        return this.parseCharClass();

      case "(":
        return this.parseGroup();

      case "\\":
        return this.parseEscape();

      // Metacharacters that are errors outside context
      case "*":
      case "+":
      case "?":
      case "{":
        // These are literal if not preceded by atom; but the quantifier
        // handler already processed them. If we reach here they're errors
        // or we can treat { as literal.
        if (ch === "{") {
          this.advance();
          return {
            type: "literal",
            value: ch.charCodeAt(0),
          } satisfies LiteralNode;
        }
        throw new EcmaReError("Nothing to repeat", this.pos);

      case "}":
        // Literal } outside of quantifier context
        this.advance();
        return {
          type: "literal",
          value: ch.charCodeAt(0),
        } satisfies LiteralNode;

      default:
        this.advance();
        return {
          type: "literal",
          value: ch.codePointAt(0) as number,
        } satisfies LiteralNode;
    }
  }

  private parseCharClass(): CharClassNode {
    this.advance(); // skip [
    let negated = false;
    if (this.ch === "^") {
      negated = true;
      this.advance();
    }

    const elements: CharClassMember[] = [];

    // ] at start of char class is literal
    if (this.ch === "]") {
      elements.push({
        type: "literal",
        value: "]".charCodeAt(0),
      } satisfies CharClassLiteral);
      this.advance();
    }

    while (!this.atEnd() && this.ch !== "]") {
      const elem = this.parseCharClassElement();

      // Check for range a-b
      if (this.ch === "-" && this.peek(1) !== "]" && this.peek(1) !== "") {
        if (elem.type !== "literal") {
          throw new EcmaReError("Bad character range", this.pos);
        }
        this.advance(); // skip -
        const next = this.parseCharClassElement();
        if (next.type !== "literal") {
          throw new EcmaReError("Bad character range", this.pos);
        }
        if (elem.value > next.value) {
          throw new EcmaReError("Bad character range", this.pos);
        }
        elements.push({
          type: "range",
          from: elem.value,
          to: next.value,
        } satisfies CharClassRange);
        continue;
      }

      elements.push(elem);
    }

    if (this.atEnd()) {
      throw new EcmaReError("Unterminated character class", this.pos);
    }
    this.advance(); // skip ]

    return { type: "charClass", negated, elements };
  }

  private parseCharClassElement(): CharClassMember {
    if (this.ch === "\\") {
      return this.parseCharClassEscape();
    }

    const ch = this.advance();
    return {
      type: "literal",
      value: ch.codePointAt(0) as number,
    } satisfies CharClassLiteral;
  }

  private parseCharClassEscape(): CharClassMember {
    const escStart = this.pos;
    this.advance(); // skip \
    if (this.atEnd()) throw new EcmaReError("Trailing backslash", this.pos);

    const ch = this.advance();
    switch (ch) {
      case "w":
        return { type: "shorthand", kind: "w" } satisfies CharClassShorthand;
      case "W":
        return { type: "shorthand", kind: "W" } satisfies CharClassShorthand;
      case "d":
        return { type: "shorthand", kind: "d" } satisfies CharClassShorthand;
      case "D":
        return { type: "shorthand", kind: "D" } satisfies CharClassShorthand;
      case "s":
        return { type: "shorthand", kind: "s" } satisfies CharClassShorthand;
      case "S":
        return { type: "shorthand", kind: "S" } satisfies CharClassShorthand;
      case "b":
        return { type: "backspace" } satisfies CharClassBackspace;
      case "n":
        return { type: "literal", value: 0x0a } satisfies CharClassLiteral;
      case "r":
        return { type: "literal", value: 0x0d } satisfies CharClassLiteral;
      case "t":
        return { type: "literal", value: 0x09 } satisfies CharClassLiteral;
      case "f":
        return { type: "literal", value: 0x0c } satisfies CharClassLiteral;
      case "v":
        return { type: "literal", value: 0x0b } satisfies CharClassLiteral;
      case "a":
        return { type: "literal", value: 0x07 } satisfies CharClassLiteral;
      case "\\":
        return { type: "literal", value: 0x5c } satisfies CharClassLiteral;
      case "-":
        return { type: "literal", value: 0x2d } satisfies CharClassLiteral;
      case "]":
        return { type: "literal", value: 0x5d } satisfies CharClassLiteral;
      case "[":
        return { type: "literal", value: 0x5b } satisfies CharClassLiteral;
      case "^":
        return { type: "literal", value: 0x5e } satisfies CharClassLiteral;
      case ".":
        return { type: "literal", value: 0x2e } satisfies CharClassLiteral;
      case "*":
        return { type: "literal", value: 0x2a } satisfies CharClassLiteral;
      case "+":
        return { type: "literal", value: 0x2b } satisfies CharClassLiteral;
      case "?":
        return { type: "literal", value: 0x3f } satisfies CharClassLiteral;
      case "(":
        return { type: "literal", value: 0x28 } satisfies CharClassLiteral;
      case ")":
        return { type: "literal", value: 0x29 } satisfies CharClassLiteral;
      case "{":
        return { type: "literal", value: 0x7b } satisfies CharClassLiteral;
      case "}":
        return { type: "literal", value: 0x7d } satisfies CharClassLiteral;
      case "|":
        return { type: "literal", value: 0x7c } satisfies CharClassLiteral;
      case "/":
        return { type: "literal", value: 0x2f } satisfies CharClassLiteral;
      case "$":
        return { type: "literal", value: 0x24 } satisfies CharClassLiteral;
      case "x": {
        const hex = this.parseHexEscape(2);
        return { type: "literal", value: hex } satisfies CharClassLiteral;
      }
      case "u": {
        const hex = this.parseHexEscape(4);
        return { type: "literal", value: hex } satisfies CharClassLiteral;
      }
      case "U": {
        const hex = this.parseCodePointEscape(8, escStart);
        return { type: "literal", value: hex } satisfies CharClassLiteral;
      }
      case "N": {
        const value = this.parseNamedUnicodeEscape(escStart);
        return { type: "literal", value } satisfies CharClassLiteral;
      }
      case "0": {
        // Octal or null
        const val = this.parseOctalAfterZero();
        return { type: "literal", value: val } satisfies CharClassLiteral;
      }
      default: {
        // Inside character class, numeric escapes are always octal
        if (ch >= "1" && ch <= "7") {
          const val = this.parseOctalSequence(ch);
          return { type: "literal", value: val } satisfies CharClassLiteral;
        }
        if (isAsciiLetter(ch)) {
          throw new EcmaReError(`bad escape \\${ch}`, escStart);
        }
        // Unknown non-letter escape inside char class - treat as literal.
        return {
          type: "literal",
          value: ch.codePointAt(0) as number,
        } satisfies CharClassLiteral;
      }
    }
  }

  private parseEscape(): Node {
    const escStart = this.pos;
    this.advance(); // skip \
    if (this.atEnd()) throw new EcmaReError("Trailing backslash", this.pos);

    const ch = this.advance();
    switch (ch) {
      case "w":
        return { type: "shorthand", kind: "w" } satisfies ShorthandNode;
      case "W":
        return { type: "shorthand", kind: "W" } satisfies ShorthandNode;
      case "d":
        return { type: "shorthand", kind: "d" } satisfies ShorthandNode;
      case "D":
        return { type: "shorthand", kind: "D" } satisfies ShorthandNode;
      case "s":
        return { type: "shorthand", kind: "s" } satisfies ShorthandNode;
      case "S":
        return { type: "shorthand", kind: "S" } satisfies ShorthandNode;

      case "b":
        return {
          type: "assertion",
          kind: "wordBoundary",
        } satisfies AssertionNode;
      case "B":
        return {
          type: "assertion",
          kind: "nonWordBoundary",
        } satisfies AssertionNode;
      case "A":
        return {
          type: "assertion",
          kind: "startOfString",
        } satisfies AssertionNode;
      case "Z":
        return {
          type: "assertion",
          kind: "endOfString",
        } satisfies AssertionNode;
      case "z":
        return {
          type: "assertion",
          kind: "endOfString",
        } satisfies AssertionNode;

      case "n":
        return { type: "literal", value: 0x0a } satisfies LiteralNode;
      case "r":
        return { type: "literal", value: 0x0d } satisfies LiteralNode;
      case "t":
        return { type: "literal", value: 0x09 } satisfies LiteralNode;
      case "f":
        return { type: "literal", value: 0x0c } satisfies LiteralNode;
      case "v":
        return { type: "literal", value: 0x0b } satisfies LiteralNode;
      case "a":
        return { type: "literal", value: 0x07 } satisfies LiteralNode;

      case "\\":
        return { type: "literal", value: 0x5c } satisfies LiteralNode;
      case ".":
        return { type: "literal", value: 0x2e } satisfies LiteralNode;
      case "*":
        return { type: "literal", value: 0x2a } satisfies LiteralNode;
      case "+":
        return { type: "literal", value: 0x2b } satisfies LiteralNode;
      case "?":
        return { type: "literal", value: 0x3f } satisfies LiteralNode;
      case "(":
        return { type: "literal", value: 0x28 } satisfies LiteralNode;
      case ")":
        return { type: "literal", value: 0x29 } satisfies LiteralNode;
      case "[":
        return { type: "literal", value: 0x5b } satisfies LiteralNode;
      case "]":
        return { type: "literal", value: 0x5d } satisfies LiteralNode;
      case "{":
        return { type: "literal", value: 0x7b } satisfies LiteralNode;
      case "}":
        return { type: "literal", value: 0x7d } satisfies LiteralNode;
      case "|":
        return { type: "literal", value: 0x7c } satisfies LiteralNode;
      case "^":
        return { type: "literal", value: 0x5e } satisfies LiteralNode;
      case "$":
        return { type: "literal", value: 0x24 } satisfies LiteralNode;
      case "/":
        return { type: "literal", value: 0x2f } satisfies LiteralNode;
      case "-":
        return { type: "literal", value: 0x2d } satisfies LiteralNode;

      case "x": {
        const hex = this.parseHexEscape(2);
        return { type: "literal", value: hex } satisfies LiteralNode;
      }
      case "u": {
        const hex = this.parseHexEscape(4);
        return { type: "literal", value: hex } satisfies LiteralNode;
      }
      case "U": {
        const hex = this.parseCodePointEscape(8, escStart);
        return { type: "literal", value: hex } satisfies LiteralNode;
      }
      case "N": {
        const value = this.parseNamedUnicodeEscape(escStart);
        return { type: "literal", value } satisfies LiteralNode;
      }

      case "0": {
        const val = this.parseOctalAfterZero();
        return { type: "literal", value: val } satisfies LiteralNode;
      }

      default: {
        // Numeric: backreference or octal
        if (ch >= "1" && ch <= "9") {
          return this.parseNumericEscape(ch, escStart);
        }
        if (isAsciiLetter(ch)) {
          throw new EcmaReError(`bad escape \\${ch}`, escStart);
        }
        // Unknown non-letter escape - treat as a literal, matching Python.
        return {
          type: "literal",
          value: ch.codePointAt(0) as number,
        } satisfies LiteralNode;
      }
    }
  }

  private parseHexEscape(digits: number): number {
    let hex = "";
    for (let i = 0; i < digits; i++) {
      if (this.atEnd() || !isHexDigit(this.ch)) {
        throw new EcmaReError(
          `Invalid hex escape (expected ${digits} hex digits)`,
          this.pos,
        );
      }
      hex += this.advance();
    }
    return Number.parseInt(hex, 16);
  }

  private parseCodePointEscape(digits: number, escStart: number): number {
    const value = this.parseHexEscape(digits);
    if (value > 0x10ffff) {
      throw new EcmaReError("Unicode escape outside valid range", escStart);
    }
    return value;
  }

  private parseNamedUnicodeEscape(escStart: number): number {
    if (this.currentChar() !== "{") {
      throw new EcmaReError("Missing { for named Unicode escape", escStart);
    }
    this.advance();

    const nameStart = this.pos;
    while (!this.atEnd() && this.currentChar() !== "}") {
      this.advance();
    }
    if (this.atEnd()) {
      throw new EcmaReError("Missing } for named Unicode escape", escStart);
    }

    const name = this.input.slice(nameStart, this.pos);
    this.advance();
    const value = lookupNamedCodePoint(name);
    if (value === undefined) {
      throw new EcmaReError(`Undefined character name '${name}'`, escStart);
    }
    return value;
  }

  private parseOctalAfterZero(): number {
    // \0 optionally followed by up to 2 more octal digits
    let octal = "0";
    let count = 0;
    while (count < 2 && !this.atEnd() && this.ch >= "0" && this.ch <= "7") {
      octal += this.advance();
      count++;
    }
    return Number.parseInt(octal, 8);
  }

  private parseOctalSequence(first: string): number {
    let octal = first;
    const maxMore = first <= "3" ? 2 : 1;
    let count = 0;
    while (
      count < maxMore &&
      !this.atEnd() &&
      this.ch >= "0" &&
      this.ch <= "7"
    ) {
      octal += this.advance();
      count++;
    }
    return Number.parseInt(octal, 8);
  }

  private parseNumericEscape(first: string, escStart: number): Node {
    const second = this.peek();
    const third = this.peek(1);

    if (
      first >= "1" &&
      first <= "7" &&
      second >= "0" &&
      second <= "7" &&
      third >= "0" &&
      third <= "7"
    ) {
      this.advance();
      this.advance();
      const value = Number.parseInt(`${first}${second}${third}`, 8);
      if (value > 0xff) {
        throw new EcmaReError(
          "Octal escape outside of range 0-0o377",
          escStart,
        );
      }
      return { type: "literal", value } satisfies LiteralNode;
    }

    if (isDigit(second)) {
      this.advance();
      const index = Number.parseInt(`${first}${second}`, 10);
      this.validateNumericBackreference(index, escStart);
      return { type: "backreference", index } satisfies BackreferenceNode;
    }

    const index = Number.parseInt(first, 10);
    this.validateNumericBackreference(index, escStart);
    return { type: "backreference", index } satisfies BackreferenceNode;
  }

  private validateNumericBackreference(index: number, pos: number): void {
    if (index > this.groupCount) {
      throw new EcmaReError(`Invalid group reference ${index}`, pos);
    }
    if (this.openGroups.has(index)) {
      throw new EcmaReError(`Cannot refer to an open group ${index}`, pos);
    }
  }

  private parseGroup(): Node {
    const groupStart = this.pos;
    this.advance(); // skip (

    if (this.atEnd()) throw new EcmaReError("Unterminated group", groupStart);

    // Check for (?...) special groups
    if (this.currentChar() === "?") {
      this.advance(); // skip ?
      if (this.atEnd()) throw new EcmaReError("Unterminated group", groupStart);

      const specifier: string = this.currentChar();

      switch (specifier) {
        case ":": {
          // Non-capturing group (?:...)
          this.advance();
          const body = this.parseAlternation();
          this.expect(")");
          return {
            type: "group",
            kind: "nonCapturing",
            body,
          } satisfies GroupNode;
        }

        case "P": {
          this.advance(); // skip P
          if (this.atEnd())
            throw new EcmaReError("Unterminated group", groupStart);
          if (this.currentChar() === "<") {
            // Named group (?P<name>...)
            this.advance(); // skip <
            let name = "";
            while (!this.atEnd() && this.currentChar() !== ">") {
              name += this.advance();
            }
            if (this.atEnd())
              throw new EcmaReError("Unterminated group name", groupStart);
            this.advance(); // skip >
            if (!name) throw new EcmaReError("Empty group name", groupStart);
            if (!isValidGroupName(name)) {
              throw new EcmaReError("Invalid group name", groupStart);
            }
            if (this.namedGroups.has(name)) {
              throw new EcmaReError("Duplicate group name", groupStart);
            }

            this.groupCount++;
            const groupNum = this.groupCount;
            this.namedGroups.set(name, groupNum);
            this.openGroups.add(groupNum);
            this.openNamedGroups.add(name);

            const body = this.parseAlternation();
            this.expect(")");
            const width = this.computeWidth(body);
            this.groupWidths.set(groupNum, width);
            this.namedGroupWidths.set(name, width);
            this.openGroups.delete(groupNum);
            this.openNamedGroups.delete(name);
            return {
              type: "group",
              kind: "named",
              name,
              body,
              number: groupNum,
            } satisfies GroupNode;
          }
          if (this.currentChar() === "=") {
            // Named backreference (?P=name)
            this.advance(); // skip =
            let name = "";
            while (!this.atEnd() && this.currentChar() !== ")") {
              name += this.advance();
            }
            this.expect(")");
            if (!name)
              throw new EcmaReError(
                "Empty group name in backreference",
                groupStart,
              );
            if (!isValidGroupName(name)) {
              throw new EcmaReError(
                "Invalid group name in backreference",
                groupStart,
              );
            }
            if (!this.namedGroups.has(name)) {
              throw new EcmaReError(
                "Unknown group name in backreference",
                groupStart,
              );
            }
            if (this.openNamedGroups.has(name)) {
              throw new EcmaReError(
                "Cannot refer to an open group",
                groupStart,
              );
            }
            return { type: "backreference", name } satisfies BackreferenceNode;
          }
          throw new EcmaReError(
            `Invalid group syntax (?P${this.currentChar()})`,
            groupStart,
          );
        }

        case "=": {
          // Positive lookahead (?=...)
          this.advance();
          const body = this.parseAlternation();
          this.expect(")");
          return { type: "group", kind: "lookahead", body } satisfies GroupNode;
        }

        case "!": {
          // Negative lookahead (?!...)
          this.advance();
          const body = this.parseAlternation();
          this.expect(")");
          return {
            type: "group",
            kind: "negativeLookahead",
            body,
          } satisfies GroupNode;
        }

        case "<": {
          this.advance(); // skip <
          if (this.atEnd())
            throw new EcmaReError("Unterminated group", groupStart);
          if (this.currentChar() === "=") {
            // Positive lookbehind (?<=...)
            this.advance();
            const body = this.parseAlternation();
            this.requireFixedWidthLookbehind(body, groupStart);
            this.expect(")");
            return {
              type: "group",
              kind: "lookbehind",
              body,
            } satisfies GroupNode;
          }
          if (this.currentChar() === "!") {
            // Negative lookbehind (?<!...)
            this.advance();
            const body = this.parseAlternation();
            this.requireFixedWidthLookbehind(body, groupStart);
            this.expect(")");
            return {
              type: "group",
              kind: "negativeLookbehind",
              body,
            } satisfies GroupNode;
          }
          throw new EcmaReError("Invalid lookbehind syntax", groupStart);
        }

        case "#": {
          // Comment group (?#...)
          this.advance(); // skip #
          while (!this.atEnd() && this.currentChar() !== ")") {
            this.advance();
          }
          if (this.atEnd())
            throw new EcmaReError("Unterminated comment group", groupStart);
          this.advance(); // skip )
          return { type: "comment" } satisfies CommentNode;
        }

        case ">": {
          // Atomic group (?>...)
          this.advance();
          const body = this.parseAlternation();
          this.expect(")");
          return { type: "group", kind: "atomic", body } satisfies GroupNode;
        }

        case "(": {
          // Conditional (?(id)yes|no)
          this.advance(); // skip (
          let ref: number | string = "";
          // Parse the reference (group number or name)
          while (!this.atEnd() && this.currentChar() !== ")") {
            ref += this.advance();
          }
          if (this.atEnd())
            throw new EcmaReError("Unterminated conditional group", groupStart);
          this.advance(); // skip ) closing the condition

          // Parse yes pattern
          const yes = this.parseSequence();
          let no: Node | undefined;
          if (this.currentChar() === "|") {
            this.advance(); // skip |
            no = this.parseAlternation();
          }
          this.expect(")");

          // Try to parse ref as number
          const numRef = Number.parseInt(ref as string, 10);
          const finalRef = Number.isNaN(numRef) ? ref : numRef;

          return {
            type: "conditional",
            ref: finalRef,
            yes,
            no,
          } satisfies ConditionalNode;
        }

        default: {
          // Check for flag group (?flags:...) or (?flags-negflags:...) or (?flags)
          if (isInlineFlagChar(specifier)) {
            let flags = "";
            let negFlags = "";
            let inNeg = false;
            while (!this.atEnd() && isInlineFlagChar(this.currentChar())) {
              if (this.currentChar() === "-") {
                inNeg = true;
                this.advance();
                continue;
              }
              if (inNeg) {
                negFlags += this.advance();
              } else {
                flags += this.advance();
              }
            }
            if (this.currentChar() === ":") {
              // Scoped modifier group (?flags:...)
              const normalized = validateInlineFlags(
                flags,
                negFlags,
                groupStart,
              );
              this.advance();
              const body = this.parseAlternation();
              this.expect(")");
              return {
                type: "group",
                kind: "modifier",
                flags: normalized.flags,
                negFlags: normalized.negFlags,
                body,
              } satisfies GroupNode;
            }
            if (this.currentChar() === ")") {
              throw new EcmaReError(
                "Global flags must be at pattern start",
                groupStart,
              );
            }
            throw new EcmaReError("Invalid flag group syntax", groupStart);
          }
          throw new EcmaReError(
            `Invalid group syntax (?${specifier})`,
            groupStart,
          );
        }
      }
    }

    // Regular capturing group
    this.groupCount++;
    const groupNum = this.groupCount;
    this.openGroups.add(groupNum);
    const body = this.parseAlternation();
    this.expect(")");
    this.groupWidths.set(groupNum, this.computeWidth(body));
    this.openGroups.delete(groupNum);
    return {
      type: "group",
      kind: "capturing",
      body,
      number: groupNum,
    } satisfies GroupNode;
  }

  private requireFixedWidthLookbehind(body: Node, pos: number): void {
    if (this.allowVariableLengthLookbehind) return;
    const width = this.computeWidth(body);
    if (width.min !== width.max || width.max === Number.POSITIVE_INFINITY) {
      throw new EcmaReError("Look-behind requires fixed-width pattern", pos);
    }
  }

  private computeWidth(node: Node): Width {
    switch (node.type) {
      case "literal":
      case "dot":
      case "charClass":
      case "shorthand":
      case "unicodeProperty":
        return { min: 1, max: 1 };
      case "assertion":
      case "comment":
        return { min: 0, max: 0 };
      case "backreference":
        if (node.name) {
          return (
            this.namedGroupWidths.get(node.name) ?? {
              min: 0,
              max: Number.POSITIVE_INFINITY,
            }
          );
        }
        return (
          this.groupWidths.get(node.index ?? 0) ?? {
            min: 0,
            max: Number.POSITIVE_INFINITY,
          }
        );
      case "group":
        switch (node.kind) {
          case "lookahead":
          case "negativeLookahead":
          case "lookbehind":
          case "negativeLookbehind":
            return { min: 0, max: 0 };
          default:
            return this.computeWidth(node.body);
        }
      case "quantifier": {
        const body = this.computeWidth(node.body);
        return {
          min: body.min * node.min,
          max:
            body.max === Number.POSITIVE_INFINITY ||
            node.max === Number.POSITIVE_INFINITY
              ? Number.POSITIVE_INFINITY
              : body.max * node.max,
        };
      }
      case "sequence": {
        let min = 0;
        let max = 0;
        for (const element of node.elements) {
          const width = this.computeWidth(element);
          min += width.min;
          max =
            max === Number.POSITIVE_INFINITY ||
            width.max === Number.POSITIVE_INFINITY
              ? Number.POSITIVE_INFINITY
              : max + width.max;
        }
        return { min, max };
      }
      case "alternation": {
        let min = Number.POSITIVE_INFINITY;
        let max = 0;
        for (const alternative of node.alternatives) {
          const width = this.computeWidth(alternative);
          min = Math.min(min, width.min);
          max = Math.max(max, width.max);
        }
        return { min, max };
      }
      case "conditional": {
        const yes = this.computeWidth(node.yes);
        const no = node.no ? this.computeWidth(node.no) : { min: 0, max: 0 };
        return {
          min: Math.min(yes.min, no.min),
          max: Math.max(yes.max, no.max),
        };
      }
    }
  }
}
