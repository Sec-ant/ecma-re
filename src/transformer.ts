import {
  pythonIgnoreCaseCodePoints,
  pythonIgnoreCaseRangeExtraCodePoints,
} from "./casefix";
import { EcmaReError } from "./errors";
import type {
  AlternationNode,
  AssertionNode,
  CharClassLiteral,
  CharClassMember,
  CharClassNode,
  CharClassRange,
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
  ignoreCase: boolean;
  jsIgnoreCase: boolean;
  allowAtomicGroupApproximation: boolean;
  allowPossessiveQuantifierApproximation: boolean;
  multiline: boolean;
  dotAll: boolean;
  onWarn?: (msg: string) => void;
  needsVFlag: boolean;
}

const ES_FLAG_I = 1;
const ES_FLAG_M = 2;
const ES_FLAG_S = 4;
const ES_FLAG_V = 8;
const ES_FLAGS_BY_MASK = [
  "",
  "i",
  "m",
  "im",
  "s",
  "is",
  "ms",
  "ims",
  "v",
  "iv",
  "mv",
  "imv",
  "sv",
  "isv",
  "msv",
  "imsv",
] as const;

type PythonModeFlag = "a" | "L" | "u";

function resolvePythonModeFlag(
  current: PythonModeFlag | undefined,
  next: PythonModeFlag,
): PythonModeFlag {
  if (current && current !== next) {
    throw new EcmaReError("Flags 'a', 'u' and 'L' are incompatible");
  }
  return next;
}

export function transform(
  ast: Node,
  globalFlags: string,
  externalFlags: string,
  options: {
    allowAtomicGroupApproximation: boolean;
    allowPossessiveQuantifierApproximation: boolean;
    onWarn?: (msg: string) => void;
  },
): TransformResult {
  // Resolve flags
  const allFlags = globalFlags + externalFlags;

  let ascii = false;
  let esFlagMask = 0;
  let modeFlag: PythonModeFlag | undefined;
  let ignoreCase = false;

  for (const f of allFlags) {
    switch (f) {
      case "i":
        ignoreCase = true;
        break;
      case "m":
        esFlagMask |= ES_FLAG_M;
        break;
      case "s":
        esFlagMask |= ES_FLAG_S;
        break;
      case "x":
        /* already handled by parser */ break;
      case "a":
        modeFlag = resolvePythonModeFlag(modeFlag, "a");
        ascii = true;
        break;
      case "u":
        modeFlag = resolvePythonModeFlag(modeFlag, "u");
        ascii = false;
        break;
      case "L":
        modeFlag = resolvePythonModeFlag(modeFlag, "L");
        throw new EcmaReError("Locale flag (?L) is not supported");
    }
  }

  if (ignoreCase && !ascii) {
    esFlagMask |= ES_FLAG_I;
  }

  const ctx: TransformContext = {
    ascii,
    ignoreCase,
    jsIgnoreCase: (esFlagMask & ES_FLAG_I) !== 0,
    allowAtomicGroupApproximation: options.allowAtomicGroupApproximation,
    allowPossessiveQuantifierApproximation:
      options.allowPossessiveQuantifierApproximation,
    multiline: (esFlagMask & ES_FLAG_M) !== 0,
    dotAll: (esFlagMask & ES_FLAG_S) !== 0,
    onWarn: options.onWarn,
    needsVFlag: false,
  };

  if (!ascii) {
    ctx.needsVFlag = true;
  }

  const transformed = transformNode(ast, ctx);

  if (ctx.needsVFlag) {
    esFlagMask |= ES_FLAG_V;
  }

  return {
    ast: transformed,
    flags: ES_FLAGS_BY_MASK[esFlagMask]!,
    needsVFlag: ctx.needsVFlag,
  };
}

function transformNode(node: Node, ctx: TransformContext): Node {
  switch (node.type) {
    case "literal":
      return transformLiteral(node, ctx);

    case "dot":
      return transformDot(ctx);

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
  }
}

function transformCharClass(node: CharClassNode, ctx: TransformContext): Node {
  const elements: CharClassMember[] = [];
  const needsAsciiIgnoreCaseExpansion = ctx.ascii && ctx.ignoreCase;

  for (const elem of node.elements) {
    if (
      (elem.type === "literal" && elem.value > 0xffff) ||
      (elem.type === "range" && elem.to > 0xffff)
    ) {
      ctx.needsVFlag = true;
    }

    if (elem.type === "shorthand" && ctx.ascii) {
      elements.push(...transformAsciiCharClassShorthand(elem, ctx));
    } else if (elem.type === "shorthand" && !ctx.ascii) {
      elements.push(...transformUnicodeCharClassShorthand(elem));
    } else if (!ctx.ascii && ctx.ignoreCase && elem.type === "literal") {
      elements.push(...expandPythonIgnoreCaseLiteral(elem.value));
    } else if (!ctx.ascii && ctx.ignoreCase && elem.type === "range") {
      elements.push(elem);
      for (const value of pythonIgnoreCaseRangeExtraCodePoints(
        elem.from,
        elem.to,
      )) {
        elements.push({ type: "literal", value });
      }
    } else {
      elements.push(elem);
    }
  }

  const transformed = {
    ...node,
    elements: needsAsciiIgnoreCaseExpansion
      ? expandAsciiIgnoreCaseCharClassElements(elements)
      : elements,
  } satisfies CharClassNode;

  return transformed;
}

function literalElements(values: readonly number[]): CharClassLiteral[] {
  return values.map((value) => ({ type: "literal", value }));
}

function expandPythonIgnoreCaseLiteral(value: number): CharClassLiteral[] {
  const codePoints = pythonIgnoreCaseCodePoints(value);
  return codePoints
    ? literalElements(codePoints)
    : [{ type: "literal", value }];
}

function transformLiteral(node: LiteralNode, ctx: TransformContext): Node {
  if (node.value > 0xffff) ctx.needsVFlag = true;
  if (ctx.ascii && ctx.ignoreCase) {
    return isAsciiLetter(node.value)
      ? asciiIgnoreCaseLiteral(node.value)
      : node;
  }
  const codePoints =
    !ctx.ascii && ctx.ignoreCase
      ? pythonIgnoreCaseCodePoints(node.value)
      : undefined;
  if (codePoints) {
    return {
      type: "charClass",
      negated: false,
      elements: literalElements(codePoints),
    };
  }
  return node;
}

function isAsciiUppercase(cp: number): boolean {
  return cp >= 0x41 && cp <= 0x5a;
}

function isAsciiLowercase(cp: number): boolean {
  return cp >= 0x61 && cp <= 0x7a;
}

function isAsciiLetter(cp: number): boolean {
  return isAsciiUppercase(cp) || isAsciiLowercase(cp);
}

function asciiCaseCounterpart(cp: number): number {
  return isAsciiUppercase(cp) ? cp + 0x20 : cp - 0x20;
}

function asciiIgnoreCaseLiteral(value: number): CharClassNode {
  return {
    type: "charClass",
    negated: false,
    elements: literalElements([value, asciiCaseCounterpart(value)]),
  };
}

function expandAsciiIgnoreCaseCharClassElements(
  elements: readonly CharClassMember[],
): CharClassMember[] {
  const expanded: CharClassMember[] = [];

  for (const elem of elements) {
    expanded.push(elem);
    switch (elem.type) {
      case "literal":
        if (isAsciiLetter(elem.value)) {
          expanded.push({
            type: "literal",
            value: asciiCaseCounterpart(elem.value),
          });
        }
        break;
      case "range":
        expanded.push(...asciiIgnoreCaseRangeExtras(elem.from, elem.to));
        break;
    }
  }

  return expanded;
}

function asciiIgnoreCaseRangeExtras(
  from: number,
  to: number,
): CharClassLiteral[] {
  const extras = new Set<number>();

  for (let cp = 0x41; cp <= 0x5a; cp++) {
    const lower = cp + 0x20;
    if (cp >= from && cp <= to && (lower < from || lower > to)) {
      extras.add(lower);
    }
    if (lower >= from && lower <= to && (cp < from || cp > to)) {
      extras.add(cp);
    }
  }

  return literalElements([...extras].sort((a, b) => a - b));
}

function asciiWhitespaceElements(): CharClassLiteral[] {
  return [
    { type: "literal", value: 0x20 },
    { type: "literal", value: 0x09 },
    { type: "literal", value: 0x0a },
    { type: "literal", value: 0x0d },
    { type: "literal", value: 0x0c },
    { type: "literal", value: 0x0b },
  ];
}

function asciiWhitespaceClass(negated: boolean): CharClassNode {
  return {
    type: "charClass",
    negated,
    elements: asciiWhitespaceElements(),
  };
}

function pythonUnicodeWhitespaceElements(): (
  | CharClassUnicodeProperty
  | CharClassRange
)[] {
  return [
    {
      type: "unicodeProperty",
      name: "White_Space",
      negated: false,
    },
    {
      type: "range",
      from: 0x1c,
      to: 0x1f,
    },
  ];
}

function pythonUnicodeWhitespaceClass(negated: boolean): CharClassNode {
  return {
    type: "charClass",
    negated,
    elements: pythonUnicodeWhitespaceElements(),
  };
}

function transformAsciiCharClassShorthand(
  elem: CharClassShorthand,
  ctx: TransformContext,
): CharClassMember[] {
  switch (elem.kind) {
    case "s":
      return asciiWhitespaceElements();
    case "S":
      ctx.needsVFlag = true;
      return [
        {
          type: "nestedClass",
          node: asciiWhitespaceClass(true),
        },
      ];
    default:
      return [elem];
  }
}

function transformUnicodeCharClassShorthand(
  elem: CharClassShorthand,
): CharClassMember[] {
  switch (elem.kind) {
    case "s":
      return pythonUnicodeWhitespaceElements();
    case "S":
      return [
        {
          type: "nestedClass",
          node: pythonUnicodeWhitespaceClass(true),
        },
      ];
    case "d":
      return [
        {
          type: "unicodeProperty",
          name: "Nd",
          negated: false,
        },
      ];
    case "D":
      return [
        {
          type: "unicodeProperty",
          name: "Nd",
          negated: true,
        },
      ];
    case "w":
    case "W":
      return [elem];
  }
}

function transformDot(ctx: TransformContext): Node {
  if (ctx.dotAll) return { type: "dot" };
  return {
    type: "charClass",
    negated: true,
    elements: [{ type: "literal", value: 0x0a } satisfies CharClassLiteral],
  } satisfies CharClassNode;
}

function addFlag(flags: string, flag: "i" | "m" | "s"): string {
  return flags.includes(flag) ? flags : flags + flag;
}

function transformGroup(node: GroupNode, ctx: TransformContext): Node {
  switch (node.kind) {
    case "atomic": {
      if (!ctx.allowAtomicGroupApproximation) {
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
      // Check for locale flag
      if (node.flags?.includes("L")) {
        throw new EcmaReError("Locale flag (?L) is not supported");
      }
      const scopedCtx = { ...ctx };
      if (node.flags?.includes("a")) scopedCtx.ascii = true;
      if (node.flags?.includes("u")) scopedCtx.ascii = false;
      if (node.flags?.includes("i")) scopedCtx.ignoreCase = true;
      if (node.negFlags?.includes("i")) scopedCtx.ignoreCase = false;
      if (node.flags?.includes("m")) scopedCtx.multiline = true;
      if (node.negFlags?.includes("m")) scopedCtx.multiline = false;
      if (node.flags?.includes("s")) scopedCtx.dotAll = true;
      if (node.negFlags?.includes("s")) scopedCtx.dotAll = false;
      if (!scopedCtx.ascii) scopedCtx.needsVFlag = true;

      // Map Python flags to ES flags
      let flags = "";
      let negFlags = "";
      for (const f of node.flags || "") {
        switch (f) {
          case "m":
            flags = addFlag(flags, "m");
            break;
          case "s":
            flags = addFlag(flags, "s");
            break;
          // i, x, a, u are handled differently
        }
      }
      for (const f of node.negFlags || "") {
        switch (f) {
          case "m":
            negFlags = addFlag(negFlags, "m");
            break;
          case "s":
            negFlags = addFlag(negFlags, "s");
            break;
        }
      }

      if (scopedCtx.ignoreCase) {
        if (scopedCtx.ascii) {
          if (ctx.jsIgnoreCase) negFlags = addFlag(negFlags, "i");
          scopedCtx.jsIgnoreCase = false;
        } else {
          if (!ctx.jsIgnoreCase) flags = addFlag(flags, "i");
          scopedCtx.jsIgnoreCase = true;
        }
      } else {
        if (ctx.jsIgnoreCase) negFlags = addFlag(negFlags, "i");
        scopedCtx.jsIgnoreCase = false;
      }

      // Handle modifier groups like (?i-m:...)
      const body = transformNode(node.body, scopedCtx);
      ctx.needsVFlag ||= scopedCtx.needsVFlag;

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
    if (!ctx.allowPossessiveQuantifierApproximation) {
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
      if (ctx.multiline) {
        return {
          type: "group",
          kind: "lookahead",
          body: {
            type: "alternation",
            alternatives: [
              { type: "literal", value: 0x0a } satisfies LiteralNode,
              {
                type: "group",
                kind: "negativeLookahead",
                body: {
                  type: "charClass",
                  negated: false,
                  elements: [
                    {
                      type: "shorthand",
                      kind: "s",
                    } satisfies CharClassShorthand,
                    {
                      type: "shorthand",
                      kind: "S",
                    } satisfies CharClassShorthand,
                  ],
                } satisfies CharClassNode,
              } satisfies GroupNode,
            ],
          } satisfies AlternationNode,
        } satisfies GroupNode;
      }
      // $ (non-multiline) → (?=\n?$)
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
    case "start":
      if (ctx.multiline) {
        return {
          type: "group",
          kind: "nonCapturing",
          body: {
            type: "alternation",
            alternatives: [
              {
                type: "group",
                kind: "negativeLookbehind",
                body: {
                  type: "charClass",
                  negated: false,
                  elements: [
                    {
                      type: "shorthand",
                      kind: "s",
                    } satisfies CharClassShorthand,
                    {
                      type: "shorthand",
                      kind: "S",
                    } satisfies CharClassShorthand,
                  ],
                } satisfies CharClassNode,
              } satisfies GroupNode,
              {
                type: "group",
                kind: "lookbehind",
                body: { type: "literal", value: 0x0a } satisfies LiteralNode,
              } satisfies GroupNode,
            ],
          } satisfies AlternationNode,
        } satisfies GroupNode;
      }
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
  if (ctx.ascii) {
    switch (node.kind) {
      case "s":
        return asciiWhitespaceClass(false);
      case "S":
        return asciiWhitespaceClass(true);
      default:
        return node;
    }
  }

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
      return pythonUnicodeWhitespaceClass(false);
    case "S":
      return pythonUnicodeWhitespaceClass(true);
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
