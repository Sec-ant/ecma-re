import { ecmaRe as ecmaReLiteral } from "../src/index";
import type { EcmaReOptions } from "../src/types";

export function regexpFromLiteral(literal: string): RegExp {
  const delimiter = literal.lastIndexOf("/");
  if (!literal.startsWith("/") || delimiter <= 0) {
    throw new Error(`Invalid RegExp literal string: ${literal}`);
  }
  return new RegExp(literal.slice(1, delimiter), literal.slice(delimiter + 1));
}

export function compileEcmaRe(
  pattern: string,
  flags?: string,
  options?: EcmaReOptions,
): RegExp {
  return regexpFromLiteral(ecmaReLiteral(pattern, flags, options));
}
