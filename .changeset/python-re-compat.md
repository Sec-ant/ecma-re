---
"ecma-re": minor
---

Expand Python `re` compatibility for Unicode and pattern semantics.

This adds `\N{name}` support from Unicode 16.0 names and aliases, Python
Unicode escape handling, CPython-compatible Unicode `IGNORECASE` casefix data,
Python newline-only multiline anchors, scoped flag handling, Unicode/ASCII
shorthand fixes, and additional parser validation for inline flags and brace
quantifiers.
