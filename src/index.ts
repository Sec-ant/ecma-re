export { EsreError } from "./errors";
export type { EsreOptions, Node, TranspileResult } from "./types";

import { emit } from "./emitter";
import { EsreError } from "./errors";
import { hasLeadingGlobalVerboseFlag, parse } from "./parser";
import { transform } from "./transformer";
import type { EsreOptions } from "./types";

/**
 * Transpile a Python regex pattern into an ECMAScript RegExp object.
 *
 * @param pattern - Python regex pattern string
 * @param flags - Python-style flag characters: "i", "m", "s", "x", "a"
 * @param options - Transpilation options
 * @returns An ECMAScript RegExp object
 */
export function esre(
  pattern: string,
  flags?: string,
  options?: EsreOptions,
): RegExp {
  const externalFlags = flags ?? "";

  // Determine if verbose mode is active
  const verboseMode =
    externalFlags.includes("x") || hasLeadingGlobalVerboseFlag(pattern);

  // Parse the pattern into an AST
  const parseResult = parse(pattern, verboseMode);

  // If verbose mode was found in global flags but not in external flags,
  // we need to re-parse with verbose preprocessing
  let finalParseResult = parseResult;
  if (parseResult.globalFlags.includes("x") && !verboseMode) {
    finalParseResult = parse(pattern, true);
  }

  // Transform AST from Python semantics to ES semantics
  const transformResult = transform(
    finalParseResult.ast,
    finalParseResult.globalFlags,
    externalFlags,
    {
      ascii: options?.ascii ?? false,
      loose: options?.loose ?? false,
      onWarn: options?.onWarn,
    },
  );

  // Emit the transformed AST to an ES regex source string
  const source = emit(transformResult.ast, transformResult.needsVFlag);
  const esFlags = transformResult.flags;

  try {
    return new RegExp(source, esFlags);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new EsreError(`Failed to create RegExp: ${msg}`);
  }
}
