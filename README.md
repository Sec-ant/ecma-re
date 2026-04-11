# esre

Transpile Python `re` module regex patterns into ECMAScript `RegExp` objects.

## Features

- Full Python regex syntax parsing with a recursive-descent parser
- Python-to-ES semantic transforms: named groups, verbose mode, anchors, octal escapes, and more
- Unicode-correct `\w`, `\d`, `\s`, `\b` semantics aligned with Python defaults (via the `v` flag and Unicode properties)
- Optional ASCII mode for simpler/faster output
- Strict mode by default; optional loose mode that degrades gracefully on untranspilable features
- Targets ES2025 regex features (modifier groups, `v` flag)
- Zero runtime dependencies
- ESM and CJS dual output with full TypeScript declarations
- 615 tests passing (458 ported from CPython `re_tests.py` + 157 end-to-end)

## Installation

```bash
npm install esre
```

## Quick Start

```ts
import { esre } from "esre";

// Basic usage — returns a native RegExp
const re = esre("(?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})");
const match = re.exec("2025-07-11");
console.log(match?.groups); // { year: "2025", month: "07", day: "11" }

// Python flags: case-insensitive + verbose
const re2 = esre(
  `
  \\b
  (?P<word>[a-z]+)   # capture a word
  \\b
`,
  "ix",
);
console.log(re2.test("Hello")); // true

// ASCII mode — keep ES native \w, \d, \s (no Unicode expansion)
const re3 = esre("\\w+", "", { ascii: true });

// Loose mode — degrade instead of throwing on unsupported features
const re4 = esre("a++", "", {
  loose: true,
  onWarn: (msg) => console.warn(msg),
});
// Possessive quantifier degrades to greedy: /a+/
```

## API Reference

### `esre(pattern, flags?, options?)`

```ts
function esre(pattern: string, flags?: string, options?: EsreOptions): RegExp;
```

**Parameters:**

| Parameter | Type          | Description                                                     |
| --------- | ------------- | --------------------------------------------------------------- |
| `pattern` | `string`      | Python regex pattern                                            |
| `flags`   | `string`      | Python-style flag characters: `"i"`, `"m"`, `"s"`, `"x"`, `"a"` |
| `options` | `EsreOptions` | Transpilation options (see below)                               |

**Returns:** A native `RegExp` object.

**Throws:** `EsreError` on syntax errors or untranspilable features (in strict mode).

### `EsreOptions`

```ts
interface EsreOptions {
  ascii?: boolean;
  loose?: boolean;
  onWarn?: (msg: string) => void;
}
```

| Option   | Type                    | Default             | Description                                                                                                                                                                         |
| -------- | ----------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ascii`  | `boolean`               | `undefined` (falsy) | When falsy, Unicode mode is active: `\w`, `\d`, `\s`, `\b` expand to Unicode property classes, and the `v` flag is set. When `true`, these shorthands use ES native ASCII behavior. |
| `loose`  | `boolean`               | `undefined` (falsy) | When falsy, strict mode is active: untranspilable features throw `EsreError`. When `true`, they degrade gracefully and emit warnings via `onWarn`.                                  |
| `onWarn` | `(msg: string) => void` | `undefined`         | Warning callback invoked in loose mode when a feature is degraded.                                                                                                                  |

### `EsreError`

```ts
class EsreError extends Error {
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
| `a`  | ASCII mode                                 | Equivalent to `{ ascii: true }` option |

Inline flags `(?imsx)` at the start of a pattern are also supported. Scoped modifier groups like `(?i-m:...)` are passed through to ES2025 natively.

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

When `ascii` is falsy (the default), the output uses the `v` flag and Unicode property escapes:

| Python      | ES output                                         |
| ----------- | ------------------------------------------------- |
| `\w` / `\W` | `[\p{L}\p{N}_]` / `[^\p{L}\p{N}_]`                |
| `\d` / `\D` | `\p{Nd}` / `\P{Nd}`                               |
| `\s` / `\S` | `\p{White_Space}` / `\P{White_Space}`             |
| `\b` / `\B` | Lookaround-based Unicode word boundary assertions |

### Unsupported features

| Feature                                 | Strict (default)   | Loose (`{ loose: true }`)                |
| --------------------------------------- | ------------------ | ---------------------------------------- |
| `*+`, `++`, `?+` possessive quantifiers | Throws `EsreError` | Degrades to greedy                       |
| `{m,n}+` possessive                     | Throws `EsreError` | Degrades to greedy `{m,n}`               |
| `(?>...)` atomic group                  | Throws `EsreError` | Degrades to `(?:...)`                    |
| `(?(id)yes\|no)` conditional            | Throws `EsreError` | Throws `EsreError` (no safe degradation) |
| `(?L)` locale flag                      | Throws `EsreError` | Throws `EsreError`                       |

## How It Works

esre uses a three-stage compiler pipeline:

1. **Parser** -- Recursive-descent, single-pass parser (no separate lexer) that produces a typed AST from the Python regex string. Verbose mode (`x` flag) preprocessing strips whitespace and comments before parsing.
2. **Transformer** -- Rewrites AST nodes from Python semantics to ES semantics: resolves flags, rewrites named groups, expands Unicode shorthands, transforms anchors, and handles unsupported features based on strict/loose mode.
3. **Emitter** -- Serializes the transformed AST into an ES regex source string with the appropriate flags, then constructs a native `RegExp`.

## License

[MIT](./LICENSE)
