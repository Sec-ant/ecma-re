---
"ecma-re": patch
---

Reject unknown ASCII-letter escapes such as `\q`, matching Python `re` behavior. Unknown non-letter escapes remain escaped literals.

Document runtime requirements and production guidance for native JavaScript `RegExp` output.
