# ecma-re

## 0.3.0

### Minor Changes

- 59e2c65: Change `ecmaRe()` to return a `RegExp.prototype.toString()`-style literal string instead of constructing and returning a native `RegExp`.

  Reject unknown ASCII-letter escapes such as `\q`, matching Python `re` behavior. Unknown non-letter escapes remain escaped literals.

  Document runtime requirements and production guidance for consuming emitted JavaScript regex literal strings.

## 0.2.0

### Minor Changes

- 33716b7: Refresh CPython compatibility coverage and replace loose mode with explicit feature flags.

  The default behavior now stays Python-compatible, including rejecting variable-length lookbehind. ECMAScript-only behavior can be enabled with `allowVariableLengthLookbehind`, while lossy approximations require `allowAtomicGroupApproximation` or `allowPossessiveQuantifierApproximation`.

  The previous ASCII option was removed because it duplicated Python's `a` flag. Use `ecmaRe(pattern, "a")`, `(?a)` or `(?a:...)` to enable Python `re.ASCII` semantics.

## 0.1.0

### Minor Changes

- 5fd8e31: Initial release
