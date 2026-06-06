import type {
  AlternationNode,
  AssertionNode,
  BackreferenceNode,
  CharClassMember,
  CharClassNode,
  CharClassShorthand,
  CharClassUnicodeProperty,
  GroupNode,
  LiteralNode,
  Node,
  QuantifierNode,
  SequenceNode,
  ShorthandNode,
  UnicodePropertyNode,
} from "./types";

const EMPTY = "";

export function emit(node: Node, useVFlag: boolean): string {
  return emitNode(node, false, useVFlag);
}

function needsCharClassEscape(cp: number, useVFlag: boolean): boolean {
  switch (cp) {
    case 0x5c:
    case 0x5d:
    case 0x5e:
    case 0x2d:
      return true;
    case 0x28:
    case 0x29:
    case 0x5b:
    case 0x7b:
    case 0x7d:
    case 0x7c:
    case 0x2f:
      return useVFlag;
    default:
      return false;
  }
}

function needsRegexEscape(cp: number): boolean {
  switch (cp) {
    case 0x5c:
    case 0x5e:
    case 0x24:
    case 0x2e:
    case 0x2a:
    case 0x2b:
    case 0x3f:
    case 0x28:
    case 0x29:
    case 0x5b:
    case 0x5d:
    case 0x7b:
    case 0x7d:
    case 0x7c:
    case 0x2f:
      return true;
    default:
      return false;
  }
}

function emitCodePoint(
  cp: number,
  inCharClass: boolean,
  useVFlag: boolean,
): string {
  if (cp < 0x20 || cp === 0x7f) {
    switch (cp) {
      case 0x09:
        return "\\t";
      case 0x0a:
        return "\\n";
      case 0x0d:
        return "\\r";
      case 0x0b:
        return "\\v";
      case 0x0c:
        return "\\f";
      case 0x07:
        return "\\x07";
      case 0x08:
        return inCharClass ? "\\b" : "\\x08";
      default:
        return `\\x${cp.toString(16).padStart(2, "0")}`;
    }
  }

  const ch = String.fromCodePoint(cp);
  if (inCharClass) {
    return needsCharClassEscape(cp, useVFlag) ? `\\${ch}` : ch;
  }

  return needsRegexEscape(cp) ? `\\${ch}` : ch;
}

function emitNode(node: Node, inCharClass: boolean, useVFlag: boolean): string {
  switch (node.type) {
    case "literal":
      return emitLiteral(node, inCharClass, useVFlag);
    case "dot":
      return ".";
    case "charClass":
      return emitCharClass(node, useVFlag);
    case "group":
      return emitGroup(node, useVFlag);
    case "quantifier":
      return emitQuantifier(node, useVFlag);
    case "alternation":
      return emitAlternation(node, useVFlag);
    case "assertion":
      return emitAssertion(node);
    case "backreference":
      return emitBackreference(node);
    case "shorthand":
      return emitShorthand(node);
    case "unicodeProperty":
      return emitUnicodeProperty(node);
    case "sequence":
      return emitSequence(node, useVFlag);
    case "comment":
      return EMPTY;
    case "conditional":
      // Should have been transformed or errored before emission
      return EMPTY;
  }
}

function emitLiteral(
  node: LiteralNode,
  inCharClass: boolean,
  useVFlag: boolean,
): string {
  return emitCodePoint(node.value, inCharClass, useVFlag);
}

function emitCharClass(node: CharClassNode, useVFlag: boolean): string {
  let result = "[";
  if (node.negated) result += "^";
  for (const elem of node.elements) {
    result += emitCharClassMember(elem, useVFlag);
  }
  result += "]";
  return result;
}

function emitCharClassMember(elem: CharClassMember, useVFlag: boolean): string {
  switch (elem.type) {
    case "literal":
      return emitCodePoint(elem.value, true, useVFlag);
    case "range":
      return `${emitCodePoint(elem.from, true, useVFlag)}-${emitCodePoint(
        elem.to,
        true,
        useVFlag,
      )}`;
    case "shorthand":
      return emitCharClassShorthandMember(elem, useVFlag);
    case "backspace":
      return "\\b";
    case "unicodeProperty":
      return emitCharClassUnicodeProperty(elem);
  }
}

function emitCharClassShorthandMember(
  elem: CharClassShorthand,
  useVFlag: boolean,
): string {
  if (useVFlag) {
    switch (elem.kind) {
      case "w":
        // Expand \w to Unicode-aware equivalents inside char class in v-mode.
        // ES \w only matches ASCII; we need \p{L}\p{N}_ to match Unicode.
        return "\\p{L}\\p{N}_";
      case "W":
        // \W as a nested negated class in v-mode: [^\p{L}\p{N}_]
        return "[^\\p{L}\\p{N}_]";
      default:
        // \d, \D, \s, \S are already converted to unicode properties
        // by the transformer, so they shouldn't reach here in v-mode.
        return `\\${elem.kind}`;
    }
  }
  return `\\${elem.kind}`;
}

function emitCharClassUnicodeProperty(elem: CharClassUnicodeProperty): string {
  return elem.negated ? `\\P{${elem.name}}` : `\\p{${elem.name}}`;
}

function emitGroup(node: GroupNode, useVFlag: boolean): string {
  const body = emitNode(node.body, false, useVFlag);

  switch (node.kind) {
    case "capturing":
      return `(${body})`;
    case "nonCapturing":
      return `(?:${body})`;
    case "named":
      return `(?<${node.name}>${body})`;
    case "lookahead":
      return `(?=${body})`;
    case "negativeLookahead":
      return `(?!${body})`;
    case "lookbehind":
      return `(?<=${body})`;
    case "negativeLookbehind":
      return `(?<!${body})`;
    case "atomic":
      // Should have been transformed, but fallback
      return `(?:${body})`;
    case "modifier": {
      let prefix = "(?";
      if (node.flags) prefix += node.flags;
      if (node.negFlags) prefix += `-${node.negFlags}`;
      prefix += ":";
      return `${prefix}${body})`;
    }
  }
}

function emitQuantifier(node: QuantifierNode, useVFlag: boolean): string {
  const body = emitNode(node.body, false, useVFlag);
  const wrappedBody = needsWrapForQuantifier(node.body) ? `(?:${body})` : body;

  let q: string;
  if (node.min === 0 && node.max === Number.POSITIVE_INFINITY) {
    q = "*";
  } else if (node.min === 1 && node.max === Number.POSITIVE_INFINITY) {
    q = "+";
  } else if (node.min === 0 && node.max === 1) {
    q = "?";
  } else if (node.min === node.max) {
    q = `{${node.min}}`;
  } else if (node.max === Number.POSITIVE_INFINITY) {
    q = `{${node.min},}`;
  } else {
    q = `{${node.min},${node.max}}`;
  }

  if (!node.greedy) q += "?";

  return wrappedBody + q;
}

function needsWrapForQuantifier(node: Node): boolean {
  // Atoms that don't need wrapping:
  switch (node.type) {
    case "literal":
    case "dot":
    case "charClass":
    case "group":
    case "shorthand":
    case "unicodeProperty":
    case "backreference":
      return false;
    default:
      return true;
  }
}

function emitAlternation(node: AlternationNode, useVFlag: boolean): string {
  let result = EMPTY;
  for (let i = 0; i < node.alternatives.length; i++) {
    if (i > 0) result += "|";
    result += emitNode(node.alternatives[i]!, false, useVFlag);
  }
  return result;
}

function emitAssertion(node: AssertionNode): string {
  switch (node.kind) {
    case "start":
      return "^";
    case "end":
      return "$";
    case "wordBoundary":
      return "\\b";
    case "nonWordBoundary":
      return "\\B";
    // startOfString and endOfString should have been transformed
    case "startOfString":
      return "(?<!.)";
    case "endOfString":
      return "(?!.)";
  }
}

function emitBackreference(node: BackreferenceNode): string {
  if (node.name) return `\\k<${node.name}>`;
  return `\\${node.index}`;
}

function emitShorthand(node: ShorthandNode): string {
  return `\\${node.kind}`;
}

function emitUnicodeProperty(node: UnicodePropertyNode): string {
  return node.negated ? `\\P{${node.name}}` : `\\p{${node.name}}`;
}

function emitSequence(node: SequenceNode, useVFlag: boolean): string {
  let result = EMPTY;
  for (let index = 0; index < node.elements.length; index++) {
    const element = node.elements[index]!;
    const previous = node.elements[index - 1];
    if (
      previous?.type === "backreference" &&
      element.type === "literal" &&
      element.value >= 0x30 &&
      element.value <= 0x39
    ) {
      result += `\\x${element.value.toString(16).padStart(2, "0")}`;
    } else {
      result += emitNode(element, false, useVFlag);
    }
  }
  return result;
}
