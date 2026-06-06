# ecma-re

Transpile Python `re` module regex patterns into ECMAScript `RegExp` objects.

## Features

- Full Python regex syntax parsing with a recursive-descent parser
- Python-to-ES semantic transforms: named groups, verbose mode, anchors, octal escapes, and more
- Unicode-correct `\w`, `\d`, `\s`, `\b` semantics aligned with Python defaults (via the `v` flag and Unicode properties)
- Python `a` flag support for ASCII regex semantics
- Python-compatible by default, with explicit opt-ins for JS extensions and approximations
- Targets ES2025 regex features (modifier groups, `v` flag)
- Zero runtime dependencies
- ESM and CJS dual output with full TypeScript declarations
- Generated CPython compatibility tests plus focused API/stress tests
- Coverage reporting via `pnpm test:coverage`

## Installation

```bash
npm install ecma-re
```

## Quick Start

```ts
import { ecmaRe } from "ecma-re";

// Basic usage — returns a native RegExp
const re = ecmaRe("(?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})");
const match = re.exec("2025-07-11");
console.log(match?.groups); // { year: "2025", month: "07", day: "11" }

// Python flags: case-insensitive + verbose
const re2 = ecmaRe(
  `
  \\b
  (?P<word>[a-z]+)   # capture a word
  \\b
`,
  "ix",
);
console.log(re2.test("Hello")); // true

// ASCII mode — use Python's a flag for re.ASCII semantics
const re3 = ecmaRe("\\w+", "a");

// Explicit approximation — degrade instead of throwing for this feature
const re4 = ecmaRe("a++", "", {
  allowPossessiveQuantifierApproximation: true,
  onWarn: (msg) => console.warn(msg),
});
// Possessive quantifier degrades to greedy: /a+/

// Explicit JS extension — allow variable-length lookbehind that Python rejects
const re5 = ecmaRe("(?<=ab|cde)f", "", {
  allowVariableLengthLookbehind: true,
});
```

## API Reference

### `ecmaRe(pattern, flags?, options?)`

```ts
function ecmaRe(pattern: string, flags?: string, options?: EcmaReOptions): RegExp;
```

**Parameters:**

| Parameter | Type          | Description                                                     |
| --------- | ------------- | --------------------------------------------------------------- |
| `pattern` | `string`      | Python regex pattern                                            |
| `flags`   | `string`      | Python-style flag characters: `"i"`, `"m"`, `"s"`, `"x"`, `"a"` |
| `options` | `EcmaReOptions` | Transpilation options (see below)                               |

**Returns:** A native `RegExp` object.

**Throws:** `EcmaReError` on syntax errors or untranspilable features (in strict mode).

### `EcmaReOptions`

```ts
interface EcmaReOptions {
  allowVariableLengthLookbehind?: boolean;
  allowAtomicGroupApproximation?: boolean;
  allowPossessiveQuantifierApproximation?: boolean;
  onWarn?: (msg: string) => void;
}
```

| Option                                      | Type                    | Default             | Description                                                                                                                                                                         |
| ------------------------------------------- | ----------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allowVariableLengthLookbehind`             | `boolean`               | `undefined` (falsy) | Allows ECMAScript variable-length lookbehind even though Python `re` rejects it.                                                                                                    |
| `allowAtomicGroupApproximation`             | `boolean`               | `undefined` (falsy) | Approximates `(?>...)` as `(?:...)`. This can change matching semantics and emits `onWarn` when used.                                                                               |
| `allowPossessiveQuantifierApproximation`    | `boolean`               | `undefined` (falsy) | Approximates possessive quantifiers by dropping possessiveness. This can change matching semantics and emits `onWarn` when used.                                                    |
| `onWarn`                                    | `(msg: string) => void` | `undefined`         | Warning callback invoked when an approximation option changes pattern semantics.                                                                                                    |

### `EcmaReError`

```ts
class EcmaReError extends Error {
  position?: number;
}
```

Thrown on parse errors and untranspilable features. The `position` field indicates the offset in the input pattern where the error originated, when applicable.

## Python Flag Support

| Flag | Meaning                                    | Handling                               |
| ---- | ------------------------------------------ | -------------------------------------- |
| `i`  | Case-insensitive                           | Mapped to ES `i` flag                  |
| `m`  | Multiline (`^`/`$` match line boundaries)  | Mapped to ES `m` flag                  |
| `s`  | Dot matches newline                        | Mapped to ES `s` flag                  |
| `x`  | Verbose mode (whitespace/comments ignored) | Preprocessed before parsing            |
| `a`  | ASCII mode                                 | Enables Python `re.ASCII` semantics for `\w`, `\d`, `\s`, `\b` |

Inline flags `(?aimsux)` at the start of a pattern are also supported. Scoped modifier groups like `(?i-m:...)`, `(?a:...)`, and `(?u:...)` are supported.

## Feature Support

### Direct passthrough (no transform needed)

`.`, `^`, `$`, `*`, `+`, `?`, `{m,n}`, lazy quantifiers (`*?`, `+?`, etc.), character classes `[...]` / `[^...]`, alternation `|`, capturing/non-capturing groups, numeric backreferences `\1`..`\99`, all four lookaround assertions, and standard escapes (`\t`, `\n`, `\r`, `\f`, `\v`, `\xhh`).

### Syntactic transforms

| Python              | ES output                 | Notes                                            |
| ------------------- | ------------------------- | ------------------------------------------------ |
| `(?P<name>...)`     | `(?<name>...)`            | Named group syntax                               |
| `(?P=name)`         | `\k<name>`                | Named backreference syntax                       |
| `(?#...)`           | _(removed)_               | Comment group                                    |
| `(?x)` verbose      | Strip whitespace/comments | Preprocessed before parsing                      |
| `(?ims)` global     | Extracted to ES flags     | Only at pattern start                            |
| `(?i-m:...)` scoped | `(?i-m:...)`              | ES2025 modifier group passthrough                |
| `\A`                | `(?<![\s\S])`             | Start-of-string anchor                           |
| `\Z`, `\z`          | `(?![\s\S])`              | End-of-string anchor                             |
| `$` (non-multiline) | `(?=\n?$)`                | Python `$` matches before optional trailing `\n` |
| `\a`                | `\x07`                    | Bell character                                   |
| `\0`, `\141` octal  | `\x00`, `\x61`            | Normalized to hex escapes                        |

### Unicode mode (default)

When Python ASCII mode is not active, the output uses the `v` flag and Unicode property escapes:

| Python      | ES output                                         |
| ----------- | ------------------------------------------------- |
| `\w` / `\W` | `[\p{L}\p{N}_]` / `[^\p{L}\p{N}_]`                |
| `\d` / `\D` | `\p{Nd}` / `\P{Nd}`                               |
| `\s` / `\S` | `\p{White_Space}` / `\P{White_Space}`             |
| `\b` / `\B` | Lookaround-based Unicode word boundary assertions |

### Python compatibility escapes

| Feature                                 | Default behavior     | Explicit opt-in                                           |
| --------------------------------------- | -------------------- | --------------------------------------------------------- |
| Variable-length lookbehind             | Throws `EcmaReError` | Allowed with `allowVariableLengthLookbehind`              |
| `*+`, `++`, `?+` possessive quantifiers | Throws `EcmaReError` | Approximates with `allowPossessiveQuantifierApproximation` |
| `{m,n}+` possessive                     | Throws `EcmaReError` | Approximates with `allowPossessiveQuantifierApproximation` |
| `(?>...)` atomic group                  | Throws `EcmaReError` | Approximates with `allowAtomicGroupApproximation`         |
| `(?(id)yes\|no)` conditional            | Throws `EcmaReError` | No opt-in: no safe ECMAScript representation              |
| `(?L)` locale flag                      | Throws `EcmaReError` | No opt-in: locale regex semantics are not supported       |

## How It Works

ecma-re uses a three-stage compiler pipeline:

1. **Parser** -- Recursive-descent, single-pass parser (no separate lexer) that produces a typed AST from the Python regex string. Verbose mode (`x` flag) preprocessing strips whitespace and comments before parsing.
2. **Transformer** -- Rewrites AST nodes from Python semantics to ES semantics: resolves flags, rewrites named groups, expands Unicode shorthands, transforms anchors, and applies explicit approximation options.
3. **Emitter** -- Serializes the transformed AST into an ES regex source string with the appropriate flags, then constructs a native `RegExp`.

## License

[MIT](./LICENSE)
