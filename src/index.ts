export { EcmaReError } from "./errors";
export type { EcmaReOptions, Node } from "./types";

import { emit } from "./emitter";
import { EcmaReError } from "./errors";
import { hasLeadingGlobalVerboseFlag, parse } from "./parser";
import { transform } from "./transformer";
import type { EcmaReOptions } from "./types";

function toRegExpLiteral(source: string, flags: string): string {
  const literalSource = source === "" ? "(?:)" : escapeLiteralSource(source);
  return `/${literalSource}/${flags}`;
}

function escapeLiteralSource(source: string): string {
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    switch (char) {
      case "\u2028":
      case "\u2029":
        return escapeLiteralSourceFrom(source, index, escaped);
      case "/":
        if (!escaped) return escapeLiteralSourceFrom(source, index, escaped);
        escaped = false;
        break;
      default:
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        }
    }
  }

  return source;
}

function escapeLiteralSourceFrom(
  source: string,
  start: number,
  initiallyEscaped: boolean,
): string {
  let output = source.slice(0, start);
  let escaped = initiallyEscaped;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index]!;
    switch (char) {
      case "\u2028":
        output += "\\u2028";
        escaped = false;
        continue;
      case "\u2029":
        output += "\\u2029";
        escaped = false;
        continue;
      case "/":
        output += escaped ? "/" : "\\/";
        escaped = false;
        continue;
      default:
        output += char;
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        }
    }
  }

  return output;
}

function validateExternalFlags(flags: string): void {
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags.charAt(index);
    if (
      flag !== "a" &&
      flag !== "i" &&
      flag !== "L" &&
      flag !== "m" &&
      flag !== "s" &&
      flag !== "u" &&
      flag !== "x"
    ) {
      throw new EcmaReError(`Invalid flag '${flag}'`, index);
    }
  }
}

/**
 * Transpile a Python regex pattern into an ECMAScript RegExp literal string.
 *
 * @param pattern - Python regex pattern string
 * @param flags - Python-style flag characters: "i", "m", "s", "x", "a", "u", "L"
 * @param options - Transpilation options
 * @returns An ECMAScript RegExp literal string like "/source/flags"
 */
export function ecmaRe(
  pattern: string,
  flags?: string,
  options?: EcmaReOptions,
): string {
  const externalFlags = flags ?? "";
  validateExternalFlags(externalFlags);

  // Determine if verbose mode is active
  const verboseMode =
    externalFlags.includes("x") || hasLeadingGlobalVerboseFlag(pattern);

  // Parse the pattern into an AST
  const parseResult = parse(pattern, verboseMode, {
    allowVariableLengthLookbehind:
      options?.allowVariableLengthLookbehind ?? false,
  });

  // Transform AST from Python semantics to ES semantics
  const transformResult = transform(
    parseResult.ast,
    parseResult.globalFlags,
    externalFlags,
    {
      allowAtomicGroupApproximation:
        options?.allowAtomicGroupApproximation ?? false,
      allowPossessiveQuantifierApproximation:
        options?.allowPossessiveQuantifierApproximation ?? false,
      onWarn: options?.onWarn,
    },
  );

  // Emit the transformed AST to an ES regex source string
  return toRegExpLiteral(
    emit(transformResult.ast, transformResult.needsVFlag),
    transformResult.flags,
  );
}
