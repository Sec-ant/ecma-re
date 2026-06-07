declare const __ECMA_RE_NAMED_CODE_POINT_DATA__: string;

const NAMED_CODE_POINT_DATA = __ECMA_RE_NAMED_CODE_POINT_DATA__;

const CJK_RANGES: readonly (readonly [number, number])[] = [
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0x20000, 0x2a6df],
  [0x2a700, 0x2b739],
  [0x2b740, 0x2b81d],
  [0x2b820, 0x2cea1],
  [0x2ceb0, 0x2ebe0],
  [0x2ebf0, 0x2ee5d],
  [0x30000, 0x3134a],
  [0x31350, 0x323af],
];

const TANGUT_RANGES: readonly (readonly [number, number])[] = [
  [0x17000, 0x187f7],
  [0x18d00, 0x18d08],
];

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;
const HANGUL_N_COUNT = 588;
const HANGUL_T_COUNT = 28;
const HANGUL_L_TABLE = [
  "G",
  "GG",
  "N",
  "D",
  "DD",
  "R",
  "M",
  "B",
  "BB",
  "S",
  "SS",
  "",
  "J",
  "JJ",
  "C",
  "K",
  "T",
  "P",
  "H",
] as const;
const HANGUL_V_TABLE = [
  "A",
  "AE",
  "YA",
  "YAE",
  "EO",
  "E",
  "YEO",
  "YE",
  "O",
  "WA",
  "WAE",
  "OE",
  "YO",
  "U",
  "WEO",
  "WE",
  "WI",
  "YU",
  "EU",
  "YI",
  "I",
] as const;
const HANGUL_T_TABLE = [
  "",
  "G",
  "GG",
  "GS",
  "N",
  "NJ",
  "NH",
  "D",
  "L",
  "LG",
  "LM",
  "LB",
  "LS",
  "LT",
  "LP",
  "LH",
  "M",
  "B",
  "BS",
  "S",
  "SS",
  "NG",
  "J",
  "C",
  "K",
  "T",
  "P",
  "H",
] as const;

const storedCodePointCache = new Map<string, number | undefined>();

export function lookupNamedCodePoint(name: string): number | undefined {
  const normalized = name.toUpperCase();
  return (
    lookupCjkCodePoint(normalized) ??
    lookupTangutCodePoint(normalized) ??
    lookupHangulCodePoint(normalized) ??
    lookupStoredCodePoint(normalized)
  );
}

function lookupStoredCodePoint(name: string): number | undefined {
  if (storedCodePointCache.has(name)) return storedCodePointCache.get(name);

  const value = scanStoredCodePointData(name);
  storedCodePointCache.set(name, value);
  return value;
}

function scanStoredCodePointData(name: string): number | undefined {
  const needle = `\n${name}\t`;
  const start = NAMED_CODE_POINT_DATA.indexOf(needle);
  if (start < 0) return undefined;

  const valueStart = start + needle.length;
  const valueEnd = NAMED_CODE_POINT_DATA.indexOf("\n", valueStart);
  return Number.parseInt(
    NAMED_CODE_POINT_DATA.slice(
      valueStart,
      valueEnd < 0 ? NAMED_CODE_POINT_DATA.length : valueEnd,
    ),
    36,
  );
}

function lookupCjkCodePoint(name: string): number | undefined {
  return lookupHexCodePointName(name, "CJK UNIFIED IDEOGRAPH-", CJK_RANGES);
}

function lookupTangutCodePoint(name: string): number | undefined {
  return lookupHexCodePointName(name, "TANGUT IDEOGRAPH-", TANGUT_RANGES);
}

function lookupHexCodePointName(
  name: string,
  prefix: string,
  ranges: readonly (readonly [number, number])[],
): number | undefined {
  if (!name.startsWith(prefix)) return undefined;
  const hex = name.slice(prefix.length);
  if (!/^[0-9A-F]{4,6}$/.test(hex)) return undefined;

  const codePoint = Number.parseInt(hex, 16);
  if (codePoint.toString(16).toUpperCase() !== hex) return undefined;
  return ranges.some(([from, to]) => from <= codePoint && codePoint <= to)
    ? codePoint
    : undefined;
}

function lookupHangulCodePoint(name: string): number | undefined {
  if (!name.startsWith("HANGUL SYLLABLE ")) return undefined;

  for (let codePoint = HANGUL_BASE; codePoint <= HANGUL_END; codePoint++) {
    if (hangulSyllableName(codePoint) === name) return codePoint;
  }
  return undefined;
}

function hangulSyllableName(codePoint: number): string {
  const syllableIndex = codePoint - HANGUL_BASE;
  const lIndex = Math.floor(syllableIndex / HANGUL_N_COUNT);
  const vIndex = Math.floor((syllableIndex % HANGUL_N_COUNT) / HANGUL_T_COUNT);
  const tIndex = syllableIndex % HANGUL_T_COUNT;
  return `HANGUL SYLLABLE ${HANGUL_L_TABLE[lIndex]}${HANGUL_V_TABLE[vIndex]}${HANGUL_T_TABLE[tIndex]}`;
}
