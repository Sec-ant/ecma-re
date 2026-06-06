// ── AST Node Types ──────────────────────────────────────────────────

export interface LiteralNode {
  type: "literal";
  value: number; // code point
}

export interface DotNode {
  type: "dot";
}

export interface CharClassElement {
  type: "literal" | "range" | "shorthand" | "backspace" | "unicodeProperty";
}

export interface CharClassLiteral {
  type: "literal";
  value: number;
}

export interface CharClassRange {
  type: "range";
  from: number;
  to: number;
}

export interface CharClassShorthand {
  type: "shorthand";
  kind: "w" | "W" | "d" | "D" | "s" | "S";
}

export interface CharClassBackspace {
  type: "backspace";
}

export interface CharClassUnicodeProperty {
  type: "unicodeProperty";
  name: string;
  negated: boolean;
}

export type CharClassMember =
  | CharClassLiteral
  | CharClassRange
  | CharClassShorthand
  | CharClassBackspace
  | CharClassUnicodeProperty;

export interface CharClassNode {
  type: "charClass";
  negated: boolean;
  elements: CharClassMember[];
}

export type GroupKind =
  | "capturing"
  | "nonCapturing"
  | "named"
  | "lookahead"
  | "negativeLookahead"
  | "lookbehind"
  | "negativeLookbehind"
  | "atomic"
  | "modifier";

export interface GroupNode {
  type: "group";
  kind: GroupKind;
  name?: string; // for named groups
  body: Node;
  flags?: string; // for modifier groups (?flags:...)
  negFlags?: string; // for modifier groups (?flags-negflags:...)
  number?: number; // capturing group number
}

export interface QuantifierNode {
  type: "quantifier";
  min: number;
  max: number; // Infinity for unbounded
  greedy: boolean;
  possessive: boolean;
  body: Node;
}

export interface AlternationNode {
  type: "alternation";
  alternatives: Node[];
}

export type AssertionKind =
  | "start" // ^
  | "end" // $
  | "wordBoundary" // \b
  | "nonWordBoundary" // \B
  | "startOfString" // \A
  | "endOfString"; // \Z or \z

export interface AssertionNode {
  type: "assertion";
  kind: AssertionKind;
}

export interface BackreferenceNode {
  type: "backreference";
  index?: number; // numeric backreference \1..\99
  name?: string; // named backreference (?P=name) -> \k<name>
}

export interface ShorthandNode {
  type: "shorthand";
  kind: "w" | "W" | "d" | "D" | "s" | "S";
}

export interface UnicodePropertyNode {
  type: "unicodeProperty";
  name: string;
  negated: boolean;
}

export interface SequenceNode {
  type: "sequence";
  elements: Node[];
}

export interface ConditionalNode {
  type: "conditional";
  ref: number | string; // group number or name
  yes: Node;
  no?: Node;
}

export interface CommentNode {
  type: "comment";
}

export type Node =
  | LiteralNode
  | DotNode
  | CharClassNode
  | GroupNode
  | QuantifierNode
  | AlternationNode
  | AssertionNode
  | BackreferenceNode
  | ShorthandNode
  | UnicodePropertyNode
  | SequenceNode
  | ConditionalNode
  | CommentNode;

// ── Options & Result ────────────────────────────────────────────────

export interface EcmaReOptions {
  /** Use ASCII semantics for \w, \d, \s, \b instead of Python Unicode semantics. */
  ascii?: boolean;
  /** Allow ECMAScript variable-length lookbehind, which Python's re rejects. */
  allowVariableLengthLookbehind?: boolean;
  /** Approximate Python atomic groups (?>...) as non-capturing groups (?:...). */
  allowAtomicGroupApproximation?: boolean;
  /** Approximate Python possessive quantifiers by dropping possessiveness. */
  allowPossessiveQuantifierApproximation?: boolean;
  /** Warning callback invoked when a feature is approximated. */
  onWarn?: (msg: string) => void;
}

export interface TranspileResult {
  source: string;
  flags: string;
}
