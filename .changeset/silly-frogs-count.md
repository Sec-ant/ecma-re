---
"ecma-re": minor
---

Change `ecmaRe()` to return a `RegExp.prototype.toString()`-style literal string instead of constructing and returning a native `RegExp`.

Reject unknown ASCII-letter escapes such as `\q`, matching Python `re` behavior. Unknown non-letter escapes remain escaped literals.

Document runtime requirements and production guidance for consuming emitted JavaScript regex literal strings.
