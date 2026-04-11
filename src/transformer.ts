import { EcmaReError } from "./errors";
import type {
  AlternationNode,
  AssertionNode,
  CharClassLiteral,
  CharClassMember,
  CharClassNode,
  CharClassShorthand,
  CharClassUnicodeProperty,
  ConditionalNode,
  GroupNode,
  LiteralNode,
  Node,
  QuantifierNode,
  SequenceNode,
  ShorthandNode,
  UnicodePropertyNode,
} from "./types";

export interface TransformResult {
  ast: Node;
  flags: string;
  needsVFlag: boolean;
}

interface TransformContext {
  ascii: boolean;
  loose: boolean;
  multiline: boolean;
  onWarn?: (msg: string) => void;
  needsVFlag: boolean;
}

export function transform(
  ast: Node,
  globalFlags: string,
  externalFlags: string,
  options: {
    ascii: boolean;
    loose: boolean;
    onWarn?: (msg: string) => void;
  },
): TransformResult {
  // Resolve flags
  const allFlags = globalFlags + externalFlags;

  let ascii = options.ascii;
  const esFlags = new Set<string>();

  for (const f of allFlags) {
    switch (f) {
      case "i":
        esFlags.add("i");
        break;
      case "m":
        esFlags.add("m");
        break;
      case "s":
        esFlags.add("s");
        break;
      case "x":
        /* already handled by parser */ break;
      case "a":
        ascii = true;
        break;
      case "u":
        /* noop, Python 3 default */ break;
      case "L":
        throw new EcmaReError("Locale flag (?L) is not supported");
    }
  }

  const ctx: TransformContext = {
    ascii,
    loose: options.loose,
    multiline: esFlags.has("m"),
    onWarn: options.onWarn,
    needsVFlag: false,
  };

  if (!ascii) {
    ctx.needsVFlag = true;
  }

  const transformed = transformNode(ast, ctx);

  if (ctx.needsVFlag) {
    esFlags.add("v");
  }

  return {
    ast: transformed,
    flags: Array.from(esFlags).join(""),
    needsVFlag: ctx.needsVFlag,
  };
}

function transformNode(node: Node, ctx: TransformContext): Node {
  switch (node.type) {
    case "literal":
      return node;

    case "dot":
      return node;

    case "charClass":
      return transformCharClass(node, ctx);

    case "group":
      return transformGroup(node, ctx);

    case "quantifier":
      return transformQuantifier(node, ctx);

    case "alternation":
      return transformAlternation(node, ctx);

    case "assertion":
      return transformAssertion(node, ctx);

    case "backreference":
      return node;

    case "shorthand":
      return transformShorthand(node, ctx);

    case "unicodeProperty":
      return node;

    case "sequence":
      return transformSequence(node, ctx);

    case "conditional":
      return transformConditional(node, ctx);

    case "comment":
      // Remove comments - return empty sequence
      return { type: "sequence", elements: [] } satisfies SequenceNode;

    default:
      return node;
  }
}

function transformCharClass(
  node: CharClassNode,
  ctx: TransformContext,
): CharClassNode {
  const elements: CharClassMember[] = [];
  for (const elem of node.elements) {
    if (elem.type === "shorthand" && !ctx.ascii) {
      elements.push(transformCharClassShorthand(elem, ctx));
    } else {
      elements.push(elem);
    }
  }
  return { ...node, elements };
}

function transformCharClassShorthand(
  elem: CharClassShorthand,
  ctx: TransformContext,
): CharClassMember {
  if (ctx.ascii) return elem;

  switch (elem.kind) {
    case "d":
      return {
        type: "unicodeProperty",
        name: "Nd",
        negated: false,
      } satisfies CharClassUnicodeProperty;
    case "D":
      return {
        type: "unicodeProperty",
        name: "Nd",
        negated: true,
      } satisfies CharClassUnicodeProperty;
    case "s":
      return {
        type: "unicodeProperty",
        name: "White_Space",
        negated: false,
      } satisfies CharClassUnicodeProperty;
    case "S":
      return {
        type: "unicodeProperty",
        name: "White_Space",
        negated: true,
      } satisfies CharClassUnicodeProperty;
    case "w":
      // \w in charclass -> \p{L}\p{N}_ components
      // We can't directly expand this inside a char class easily.
      // We'll emit as unicode property references.
      // Actually for char class elements, we need to handle differently.
      // Let's use a special marker or just keep shorthand and handle in emitter.
      return elem; // handled in emitter
    case "W":
      return elem; // handled in emitter
    default:
      return elem;
  }
}

function transformGroup(node: GroupNode, ctx: TransformContext): Node {
  switch (node.kind) {
    case "atomic": {
      if (!ctx.loose) {
        throw new EcmaReError("Atomic groups (?>...) are not supported");
      }
      ctx.onWarn?.(
        "Atomic group (?>...) degraded to non-capturing group (?:...)",
      );
      return {
        type: "group",
        kind: "nonCapturing",
        body: transformNode(node.body, ctx),
      } satisfies GroupNode;
    }

    case "modifier": {
      // Handle modifier groups like (?i-m:...)
      const body = transformNode(node.body, ctx);
      // Check for locale flag
      if (node.flags?.includes("L")) {
        throw new EcmaReError("Locale flag (?L) is not supported");
      }
      // Map Python flags to ES flags
      let flags = "";
      let negFlags = "";
      for (const f of node.flags || "") {
        switch (f) {
          case "i":
            flags += "i";
            break;
          case "m":
            flags += "m";
            break;
          case "s":
            flags += "s";
            break;
          // x, a, u are handled differently
        }
      }
      for (const f of node.negFlags || "") {
        switch (f) {
          case "i":
            negFlags += "i";
            break;
          case "m":
            negFlags += "m";
            break;
          case "s":
            negFlags += "s";
            break;
        }
      }
      return {
        type: "group",
        kind: "modifier",
        flags,
        negFlags,
        body,
      } satisfies GroupNode;
    }

    default: {
      const body = transformNode(node.body, ctx);
      return { ...node, body };
    }
  }
}

function transformQuantifier(
  node: QuantifierNode,
  ctx: TransformContext,
): Node {
  if (node.possessive) {
    if (!ctx.loose) {
      throw new EcmaReError("Possessive quantifiers are not supported");
    }
    ctx.onWarn?.("Possessive quantifier degraded to greedy quantifier");
    return {
      ...node,
      possessive: false,
      body: transformNode(node.body, ctx),
    } satisfies QuantifierNode;
  }
  return {
    ...node,
    body: transformNode(node.body, ctx),
  } satisfies QuantifierNode;
}

function transformAlternation(
  node: AlternationNode,
  ctx: TransformContext,
): Node {
  const alternatives: Node[] = [];
  for (const alternative of node.alternatives) {
    alternatives.push(transformNode(alternative, ctx));
  }
  return {
    type: "alternation",
    alternatives,
  } satisfies AlternationNode;
}

function transformAssertion(node: AssertionNode, ctx: TransformContext): Node {
  switch (node.kind) {
    case "startOfString":
      // \A → (?<![\s\S])
      return {
        type: "group",
        kind: "negativeLookbehind",
        body: {
          type: "charClass",
          negated: false,
          elements: [
            { type: "shorthand", kind: "s" } satisfies CharClassShorthand,
            { type: "shorthand", kind: "S" } satisfies CharClassShorthand,
          ],
        } satisfies CharClassNode,
      } satisfies GroupNode;

    case "endOfString":
      // \Z, \z → (?![\s\S])
      return {
        type: "group",
        kind: "negativeLookahead",
        body: {
          type: "charClass",
          negated: false,
          elements: [
            { type: "shorthand", kind: "s" } satisfies CharClassShorthand,
            { type: "shorthand", kind: "S" } satisfies CharClassShorthand,
          ],
        } satisfies CharClassNode,
      } satisfies GroupNode;

    case "end":
      // $ (non-multiline) → (?=\n?$)
      if (!ctx.multiline) {
        return {
          type: "group",
          kind: "lookahead",
          body: {
            type: "sequence",
            elements: [
              {
                type: "quantifier",
                min: 0,
                max: 1,
                greedy: true,
                possessive: false,
                body: { type: "literal", value: 0x0a } satisfies LiteralNode,
              } satisfies QuantifierNode,
              { type: "assertion", kind: "end" } satisfies AssertionNode,
            ],
          } satisfies SequenceNode,
        } satisfies GroupNode;
      }
      return node;

    case "wordBoundary":
      if (!ctx.ascii) {
        return makeUnicodeWordBoundary(false);
      }
      return node;

    case "nonWordBoundary":
      if (!ctx.ascii) {
        return makeUnicodeWordBoundary(true);
      }
      return node;

    default:
      return node;
  }
}

function makeUnicodeWordBoundary(negated: boolean): Node {
  // \b → (?:(?<=[\p{L}\p{N}_])(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])(?=[\p{L}\p{N}_]))
  // \B → (?:(?<=[\p{L}\p{N}_])(?=[\p{L}\p{N}_])|(?<![\p{L}\p{N}_])(?![\p{L}\p{N}_]))
  const wordCharClass: CharClassNode = {
    type: "charClass",
    negated: false,
    elements: [
      {
        type: "unicodeProperty",
        name: "L",
        negated: false,
      } satisfies CharClassUnicodeProperty,
      {
        type: "unicodeProperty",
        name: "N",
        negated: false,
      } satisfies CharClassUnicodeProperty,
      { type: "literal", value: "_".charCodeAt(0) } satisfies CharClassLiteral,
    ],
  };

  if (negated) {
    // \B: word-word OR nonword-nonword
    return {
      type: "group",
      kind: "nonCapturing",
      body: {
        type: "alternation",
        alternatives: [
          {
            type: "sequence",
            elements: [
              {
                type: "group",
                kind: "lookbehind",
                body: wordCharClass,
              } satisfies GroupNode,
              {
                type: "group",
                kind: "lookahead",
                body: wordCharClass,
              } satisfies GroupNode,
            ],
          } satisfies SequenceNode,
          {
            type: "sequence",
            elements: [
              {
                type: "group",
                kind: "negativeLookbehind",
                body: wordCharClass,
              } satisfies GroupNode,
              {
                type: "group",
                kind: "negativeLookahead",
                body: wordCharClass,
              } satisfies GroupNode,
            ],
          } satisfies SequenceNode,
        ],
      } satisfies AlternationNode,
    } satisfies GroupNode;
  }
  // \b: word-nonword OR nonword-word
  return {
    type: "group",
    kind: "nonCapturing",
    body: {
      type: "alternation",
      alternatives: [
        {
          type: "sequence",
          elements: [
            {
              type: "group",
              kind: "lookbehind",
              body: wordCharClass,
            } satisfies GroupNode,
            {
              type: "group",
              kind: "negativeLookahead",
              body: wordCharClass,
            } satisfies GroupNode,
          ],
        } satisfies SequenceNode,
        {
          type: "sequence",
          elements: [
            {
              type: "group",
              kind: "negativeLookbehind",
              body: wordCharClass,
            } satisfies GroupNode,
            {
              type: "group",
              kind: "lookahead",
              body: wordCharClass,
            } satisfies GroupNode,
          ],
        } satisfies SequenceNode,
      ],
    } satisfies AlternationNode,
  } satisfies GroupNode;
}

function transformShorthand(node: ShorthandNode, ctx: TransformContext): Node {
  if (ctx.ascii) return node;

  switch (node.kind) {
    case "w":
      return {
        type: "charClass",
        negated: false,
        elements: [
          {
            type: "unicodeProperty",
            name: "L",
            negated: false,
          } satisfies CharClassUnicodeProperty,
          {
            type: "unicodeProperty",
            name: "N",
            negated: false,
          } satisfies CharClassUnicodeProperty,
          {
            type: "literal",
            value: "_".charCodeAt(0),
          } satisfies CharClassLiteral,
        ],
      } satisfies CharClassNode;

    case "W":
      return {
        type: "charClass",
        negated: true,
        elements: [
          {
            type: "unicodeProperty",
            name: "L",
            negated: false,
          } satisfies CharClassUnicodeProperty,
          {
            type: "unicodeProperty",
            name: "N",
            negated: false,
          } satisfies CharClassUnicodeProperty,
          {
            type: "literal",
            value: "_".charCodeAt(0),
          } satisfies CharClassLiteral,
        ],
      } satisfies CharClassNode;

    case "d":
      return {
        type: "unicodeProperty",
        name: "Nd",
        negated: false,
      } satisfies UnicodePropertyNode;
    case "D":
      return {
        type: "unicodeProperty",
        name: "Nd",
        negated: true,
      } satisfies UnicodePropertyNode;
    case "s":
      return {
        type: "unicodeProperty",
        name: "White_Space",
        negated: false,
      } satisfies UnicodePropertyNode;
    case "S":
      return {
        type: "unicodeProperty",
        name: "White_Space",
        negated: true,
      } satisfies UnicodePropertyNode;
    default:
      return node;
  }
}

function transformSequence(node: SequenceNode, ctx: TransformContext): Node {
  const elements: Node[] = [];
  for (const element of node.elements) {
    const transformed = transformNode(element, ctx);
    if (transformed.type === "sequence" && transformed.elements.length === 0) {
      continue;
    }
    elements.push(transformed);
  }
  if (elements.length === 0)
    return { type: "sequence", elements: [] } satisfies SequenceNode;
  if (elements.length === 1) return elements[0]!;
  return { type: "sequence", elements } satisfies SequenceNode;
}

function transformConditional(
  _node: ConditionalNode,
  _ctx: TransformContext,
): never {
  throw new EcmaReError("Conditional groups (?(id)yes|no) are not supported");
}
