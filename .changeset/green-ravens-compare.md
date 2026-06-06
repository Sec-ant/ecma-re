---
"ecma-re": minor
---

Refresh CPython compatibility coverage and replace loose mode with explicit feature flags.

The default behavior now stays Python-compatible, including rejecting variable-length lookbehind. ECMAScript-only behavior can be enabled with `allowVariableLengthLookbehind`, while lossy approximations require `allowAtomicGroupApproximation` or `allowPossessiveQuantifierApproximation`.

The previous ASCII option was removed because it duplicated Python's `a` flag. Use `ecmaRe(pattern, "a")`, `(?a)` or `(?a:...)` to enable Python `re.ASCII` semantics.
