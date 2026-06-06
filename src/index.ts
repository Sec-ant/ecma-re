export { EcmaReError } from "./errors";
export type { EcmaReOptions, Node, TranspileResult } from "./types";

import { emit } from "./emitter";
import { EcmaReError } from "./errors";
import { hasLeadingGlobalVerboseFlag, parse } from "./parser";
import { transform } from "./transformer";
import type { EcmaReOptions } from "./types";

/**
 * Transpile a Python regex pattern into an ECMAScript RegExp object.
 *
 * @param pattern - Python regex pattern string
 * @param flags - Python-style flag characters: "i", "m", "s", "x", "a"
 * @param options - Transpilation options
 * @returns An ECMAScript RegExp object
 */
export function ecmaRe(
  pattern: string,
  flags?: string,
  options?: EcmaReOptions,
): RegExp {
  const externalFlags = flags ?? "";

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
  const source = emit(transformResult.ast, transformResult.needsVFlag);
  const esFlags = transformResult.flags;

  try {
    return new RegExp(source, esFlags);
  } catch (e: unknown) {
    throw new EcmaReError(`Failed to create RegExp: ${String(e)}`);
  }
}
