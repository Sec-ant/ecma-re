// CPython re Unicode IGNORECASE compatibility. The injected data is derived
// from UCD 16.0 using CPython's Tools/build/generate_re_casefix.py algorithm.
declare const __ECMA_RE_EXTRA_CASES_DATA__: string;
declare const __ECMA_RE_SIMPLE_LOWER_OVERRIDES_DATA__: string;

const EXTRA_CASES = parseExtraCasesData(__ECMA_RE_EXTRA_CASES_DATA__);
const SIMPLE_LOWER_OVERRIDES = parseCodePointMapData(
  __ECMA_RE_SIMPLE_LOWER_OVERRIDES_DATA__,
);

function parseExtraCasesData(data: string): Map<number, readonly number[]> {
  const map = new Map<number, readonly number[]>();
  for (const line of data.split("\n")) {
    if (line.length === 0) continue;
    const separator = line.indexOf("\t");
    map.set(
      Number.parseInt(line.slice(0, separator), 36),
      line
        .slice(separator + 1)
        .split(",")
        .map((codePoint) => Number.parseInt(codePoint, 36)),
    );
  }
  return map;
}

function parseCodePointMapData(data: string): Map<number, number> {
  const map = new Map<number, number>();
  for (const line of data.split("\n")) {
    if (line.length === 0) continue;
    const separator = line.indexOf("\t");
    map.set(
      Number.parseInt(line.slice(0, separator), 36),
      Number.parseInt(line.slice(separator + 1), 36),
    );
  }
  return map;
}

function singleCodePoint(text: string): number | undefined {
  const codePoints = [...text];
  return codePoints.length === 1 ? codePoints[0]!.codePointAt(0) : undefined;
}

function pythonSimpleLower(codePoint: number): number {
  const override = SIMPLE_LOWER_OVERRIDES.get(codePoint);
  if (override !== undefined) return override;

  return (
    singleCodePoint(String.fromCodePoint(codePoint).toLowerCase()) ?? codePoint
  );
}

function simpleUpper(codePoint: number): number | undefined {
  return singleCodePoint(String.fromCodePoint(codePoint).toUpperCase());
}

class UnionFind {
  private parents = new Map<number, number>();

  find(value: number): number {
    const parent = this.parents.get(value);
    if (parent === undefined) {
      this.parents.set(value, value);
      return value;
    }
    if (parent === value) return value;
    const root = this.find(parent);
    this.parents.set(value, root);
    return root;
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parents.set(rootB, rootA);
  }
}

function sortedNumbers(values: Iterable<number>): number[] {
  return [...values].sort((a, b) => a - b);
}

function buildEquivalenceClasses(): Map<number, readonly number[]> {
  const unionFind = new UnionFind();

  for (const [lower, extras] of EXTRA_CASES) {
    unionFind.find(lower);
    for (const extra of extras) unionFind.union(lower, extra);
  }
  for (const [source, lower] of SIMPLE_LOWER_OVERRIDES) {
    unionFind.union(source, lower);
  }

  const classesByRoot = new Map<number, Set<number>>();
  for (const [lower, extras] of EXTRA_CASES) {
    for (const value of [lower, ...extras]) {
      const root = unionFind.find(value);
      const values = classesByRoot.get(root) ?? new Set<number>();
      values.add(value);
      classesByRoot.set(root, values);
    }
  }
  for (const [source, lower] of SIMPLE_LOWER_OVERRIDES) {
    const root = unionFind.find(source);
    const values = classesByRoot.get(root) ?? new Set<number>();
    values.add(source);
    values.add(lower);
    classesByRoot.set(root, values);
  }

  const classesByMember = new Map<number, readonly number[]>();
  for (const values of classesByRoot.values()) {
    const members = sortedNumbers(values);
    for (const member of members) classesByMember.set(member, members);
  }
  return classesByMember;
}

function buildRangeTriggers(
  classesByMember: Map<number, readonly number[]>,
): readonly {
  readonly members: readonly number[];
  readonly triggers: readonly number[];
}[] {
  const seen = new Set<readonly number[]>();
  const classes: { members: readonly number[]; triggers: readonly number[] }[] =
    [];

  for (const members of classesByMember.values()) {
    if (seen.has(members)) continue;
    seen.add(members);

    const triggers = new Set<number>(members);
    for (const member of members) {
      triggers.add(pythonSimpleLower(member));
      const upper = simpleUpper(member);
      if (upper !== undefined) triggers.add(upper);
    }
    classes.push({ members, triggers: sortedNumbers(triggers) });
  }

  return classes;
}

const CLASSES_BY_MEMBER = buildEquivalenceClasses();
const RANGE_TRIGGERS = buildRangeTriggers(CLASSES_BY_MEMBER);

export function pythonIgnoreCaseCodePoints(
  codePoint: number,
): readonly number[] | undefined {
  const lower = pythonSimpleLower(codePoint);
  return CLASSES_BY_MEMBER.get(codePoint) ?? CLASSES_BY_MEMBER.get(lower);
}

function rangeContainsAny(
  from: number,
  to: number,
  values: readonly number[],
): boolean {
  return values.some((value) => from <= value && value <= to);
}

export function pythonIgnoreCaseRangeExtraCodePoints(
  from: number,
  to: number,
): readonly number[] {
  const extras = new Set<number>();
  for (const { members, triggers } of RANGE_TRIGGERS) {
    if (!rangeContainsAny(from, to, triggers)) continue;
    for (const member of members) {
      if (member < from || member > to) extras.add(member);
    }
  }
  return sortedNumbers(extras);
}
