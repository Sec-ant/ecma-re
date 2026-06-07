import { createRequire } from "node:module";
import dts from "vite-plugin-dts";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

const unicodeNameAliasKinds = [
  "Abbreviation",
  "Alternate",
  "Control",
  "Correction",
  "Figment",
] as const;

type UnicodeNameMap = Map<number, string>;
type UnicodeNameAliases = Record<string, readonly string[]>;
type CodePointMap = Map<number, number>;
type CodePointSequenceMap = Map<number, readonly number[]>;

function buildNamedCodePointData(): string {
  const canonicalNames =
    require("@unicode/unicode-16.0.0/Names") as UnicodeNameMap;
  const nameCounts = new Map<string, number>();
  for (const name of canonicalNames.values()) {
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  const nameToCodePoint = new Map<string, number>();
  for (const [codePoint, name] of canonicalNames) {
    if (name === "<control>" || nameCounts.get(name) !== 1) continue;
    nameToCodePoint.set(name.toUpperCase(), codePoint);
  }

  for (const kind of unicodeNameAliasKinds) {
    const aliasesByCodePoint = require(
      `@unicode/unicode-16.0.0/Names/${kind}`,
    ) as UnicodeNameAliases;
    for (const [rawCodePoint, aliases] of Object.entries(aliasesByCodePoint)) {
      const codePoint = Number(rawCodePoint);
      for (const alias of aliases) {
        nameToCodePoint.set(alias.toUpperCase(), codePoint);
      }
    }
  }

  const entries = [...nameToCodePoint]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, codePoint]) => `${name}\t${codePoint.toString(36)}`)
    .join("\n");

  return `\n${entries}`;
}

function buildSimpleLowerOverrideData(): string {
  const simpleLower =
    require("@unicode/unicode-16.0.0/Simple_Case_Mapping/Lowercase/code-points") as CodePointMap;
  const entries: string[] = [];

  for (const [codePoint, lower] of simpleLower) {
    const jsLower = singleCodePoint(
      String.fromCodePoint(codePoint).toLowerCase(),
    );
    if ((jsLower ?? codePoint) !== lower) {
      entries.push(`${codePoint.toString(36)}\t${lower.toString(36)}`);
    }
  }

  return entries.join("\n");
}

function buildExtraCasesData(): string {
  const simpleLower =
    require("@unicode/unicode-16.0.0/Simple_Case_Mapping/Lowercase/code-points") as CodePointMap;
  const simpleUpper =
    require("@unicode/unicode-16.0.0/Simple_Case_Mapping/Uppercase/code-points") as CodePointMap;
  const fullLower =
    require("@unicode/unicode-16.0.0/Special_Casing/Lowercase/code-points") as CodePointSequenceMap;
  const fullUpper =
    require("@unicode/unicode-16.0.0/Special_Casing/Uppercase/code-points") as CodePointSequenceMap;

  const charsByUpper = new Map<string, number[]>();
  for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
    const upper = caseMappingString(codePoint, simpleUpper, fullUpper);
    const chars = charsByUpper.get(upper) ?? [];
    chars.push(codePoint);
    charsByUpper.set(upper, chars);
  }

  const mapping = new Map<number, readonly number[]>();
  for (const chars of charsByUpper.values()) {
    if (chars.length <= 1) continue;
    const lowerCodes = sortedNumbers(
      new Set(
        chars.map((codePoint) =>
          lowerCaseMappingCodePoint(codePoint, simpleLower, fullLower),
        ),
      ),
    );
    if (lowerCodes.length <= 1) continue;
    for (const codePoint of lowerCodes) {
      if (codePoint > 0xffff) {
        throw new Error(
          `Cannot generate re casefix data for non-BMP lower code point U+${codePoint.toString(16).toUpperCase()}`,
        );
      }
      mapping.set(
        codePoint,
        lowerCodes.filter((other) => other !== codePoint),
      );
    }
  }

  return [...mapping]
    .sort(([left], [right]) => left - right)
    .map(
      ([codePoint, extras]) =>
        `${codePoint.toString(36)}\t${extras.map((extra) => extra.toString(36)).join(",")}`,
    )
    .join("\n");
}

function singleCodePoint(text: string): number | undefined {
  const codePoints = [...text];
  return codePoints.length === 1 ? codePoints[0]!.codePointAt(0) : undefined;
}

function sortedNumbers(values: Iterable<number>): number[] {
  return [...values].sort((a, b) => a - b);
}

function caseMappingString(
  codePoint: number,
  simpleMapping: CodePointMap,
  fullMapping: CodePointSequenceMap,
): string {
  return String.fromCodePoint(
    ...(fullMapping.get(codePoint) ?? [
      simpleMapping.get(codePoint) ?? codePoint,
    ]),
  );
}

function lowerCaseMappingCodePoint(
  codePoint: number,
  simpleLower: CodePointMap,
  fullLower: CodePointSequenceMap,
): number {
  const lower = fullLower.get(codePoint) ?? [
    simpleLower.get(codePoint) ?? codePoint,
  ];
  if (lower.length !== 1) {
    throw new Error(
      `Cannot generate re casefix data for multi-code-point lowercase U+${codePoint.toString(16).toUpperCase()}`,
    );
  }
  return lower[0]!;
}

export default defineConfig({
  define: {
    __ECMA_RE_NAMED_CODE_POINT_DATA__: JSON.stringify(
      buildNamedCodePointData(),
    ),
    __ECMA_RE_EXTRA_CASES_DATA__: JSON.stringify(buildExtraCasesData()),
    __ECMA_RE_SIMPLE_LOWER_OVERRIDES_DATA__: JSON.stringify(
      buildSimpleLowerOverrideData(),
    ),
  },
  build: {
    minify: false,
    lib: {
      entry: "src/index.ts",
      name: "ecmaRe",
      fileName: "ecma-re",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [],
    },
  },
  plugins: [dts()],
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});
