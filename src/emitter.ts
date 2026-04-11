import type {
  AlternationNode,
  AssertionNode,
  BackreferenceNode,
  CharClassLiteral,
  CharClassMember,
  CharClassNode,
  CharClassRange,
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

export function emit(node: Node, useVFlag: boolean): string {
  return emitNode(node, false, useVFlag);
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
      return "";
    case "conditional":
      // Should have been transformed or errored before emission
      return "";
    default:
      return "";
  }
}

function emitLiteral(
  node: LiteralNode,
  inCharClass: boolean,
  useVFlag: boolean,
): string {
  const cp = node.value;

  // Control characters - emit as hex escapes
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
        return "\\b"; // backspace
      default:
        if (cp <= 0xff) return `\\x${cp.toString(16).padStart(2, "0")}`;
        return `\\u${cp.toString(16).padStart(4, "0")}`;
    }
  }

  const ch = String.fromCodePoint(cp);

  if (inCharClass) {
    // Inside character class, need to escape these
    if (useVFlag) {
      // In v-flag mode, more chars need escaping inside char class
      if ("\\]^-".includes(ch)) return `\\${ch}`;
      // In v-flag mode, these also need escaping in char classes
      if ("(){}|/".includes(ch)) return `\\${ch}`;
      return ch;
    }
    if ("\\]^-".includes(ch)) return `\\${ch}`;
    return ch;
  }

  // Outside character class, escape regex metacharacters
  const metachars = /[\\^$.*+?()[\]{}|/]/;
  if (metachars.test(ch)) return `\\${ch}`;

  return ch;
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
      return emitCharClassLiteral(elem, useVFlag);
    case "range":
      return emitCharClassRange(elem, useVFlag);
    case "shorthand":
      return emitCharClassShorthandMember(elem, useVFlag);
    case "backspace":
      return "\\b";
    case "unicodeProperty":
      return emitCharClassUnicodeProperty(elem);
    default:
      return "";
  }
}

function emitCharClassLiteral(
  elem: CharClassLiteral,
  useVFlag: boolean,
): string {
  return emitLiteral({ type: "literal", value: elem.value }, true, useVFlag);
}

function emitCharClassRange(elem: CharClassRange, useVFlag: boolean): string {
  const from = emitLiteral(
    { type: "literal", value: elem.from },
    true,
    useVFlag,
  );
  const to = emitLiteral({ type: "literal", value: elem.to }, true, useVFlag);
  return `${from}-${to}`;
}

function emitCharClassShorthandMember(
  elem: CharClassShorthand,
  _useVFlag: boolean,
): string {
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
    default:
      return `(?:${body})`;
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
  if (node.possessive) q += "+"; // shouldn't happen after transform

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
  return node.alternatives.map((a) => emitNode(a, false, useVFlag)).join("|");
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
    default:
      return "";
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
  return node.elements.map((e) => emitNode(e, false, useVFlag)).join("");
}
