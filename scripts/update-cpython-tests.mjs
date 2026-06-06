#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parser } from "@lezer/python";

const DEFAULT_SOURCE_URL =
  "https://cdn.jsdelivr.net/gh/python/cpython@main/Lib/test/re_tests.py";
const DEFAULT_OUT = "tests/cpython.test.ts";

const OUTCOME_NAMES = new Map([
  [0, "SUCCEED"],
  [1, "FAIL"],
  [2, "SYNTAX_ERROR"],
]);

const CONSTANTS = new Map([
  ["SUCCEED", 0],
  ["FAIL", 1],
  ["SYNTAX_ERROR", 2],
]);

const PUNCTUATION_NODES = new Set([
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ",",
  ":",
  "AssignOp",
  "ArithOp",
  "Comment",
]);

function exitWithUsageError(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE_URL,
    out: DEFAULT_OUT,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--source") {
      if (argv[index + 1] === undefined || argv[index + 1].startsWith("--")) {
        exitWithUsageError("Missing value for --source");
      }
      args.source = argv[++index];
    } else if (arg.startsWith("--source=")) {
      args.source = arg.slice("--source=".length);
    } else if (arg === "--out") {
      if (argv[index + 1] === undefined || argv[index + 1].startsWith("--")) {
        exitWithUsageError("Missing value for --out");
      }
      args.out = argv[++index];
    } else if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

async function readOneSource(source) {
  if (/^https?:\/\//u.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source}: ${response.status}`);
    }
    return response.text();
  }

  return readFile(resolve(source), "utf8");
}

function withCacheBuster(source) {
  if (source !== DEFAULT_SOURCE_URL || !/^https?:\/\//u.test(source)) {
    return source;
  }

  const url = new URL(source);
  url.searchParams.set("t", Date.now().toString());
  return url.toString();
}

async function readSource(source) {
  return {
    source,
    text: await readOneSource(withCacheBuster(source)),
  };
}

function traverse(node, visit) {
  visit(node);
  for (let child = node.firstChild; child; child = child.nextSibling) {
    traverse(child, visit);
  }
}

function children(node) {
  const result = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (!PUNCTUATION_NODES.has(child.name)) {
      result.push(child);
    }
  }
  return result;
}

function textOf(source, node) {
  return source.slice(node.from, node.to);
}

function findAssignment(source, tree, name) {
  let found = null;
  traverse(tree.topNode, (node) => {
    if (found || node.name !== "AssignStatement") return;
    const parts = children(node);
    const target = parts.find((part) => part.name === "VariableName");
    if (target && textOf(source, target) === name) {
      found = parts[parts.length - 1];
    }
  });
  if (!found) {
    throw new Error(`Could not find assignment for ${name}`);
  }
  return found;
}

function parseNumberLiteral(raw) {
  const value = Number(raw.replaceAll("_", ""));
  if (!Number.isInteger(value)) {
    throw new Error(`Unsupported number literal: ${raw}`);
  }
  return value;
}

function decodePythonStringLiteral(raw) {
  const prefixMatch = raw.match(/^[a-zA-Z]*/u);
  const prefix = (prefixMatch?.[0] ?? "").toLowerCase();
  if (prefix.includes("b") || prefix.includes("f") || prefix.includes("u")) {
    throw new Error(`Unsupported Python string prefix in ${raw}`);
  }

  const index = prefix.length;
  const quote = raw.startsWith("'''", index)
    ? "'''"
    : raw.startsWith('"""', index)
      ? '"""'
      : raw[index];
  if (quote !== "'" && quote !== '"' && quote !== "'''" && quote !== '"""') {
    throw new Error(`Unsupported Python string literal: ${raw}`);
  }

  const body = raw.slice(index + quote.length, raw.length - quote.length);
  if (prefix.includes("r")) {
    return body;
  }

  return decodePythonEscapes(body);
}

function readHex(body, index, length, escapeName) {
  const raw = body.slice(index, index + length);
  if (!new RegExp(`^[0-9a-fA-F]{${length}}$`, "u").test(raw)) {
    throw new Error(`Invalid ${escapeName} escape`);
  }
  return [String.fromCodePoint(Number.parseInt(raw, 16)), index + length];
}

function decodePythonEscapes(body) {
  let output = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== "\\") {
      output += char;
      continue;
    }

    index += 1;
    if (index >= body.length) {
      output += "\\";
      break;
    }

    const escaped = body[index];
    if (escaped === "\n") continue;
    if (escaped === "\r") {
      if (body[index + 1] === "\n") index += 1;
      continue;
    }

    const mapped = {
      "\\": "\\",
      "'": "'",
      '"': '"',
      a: "\x07",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      v: "\v",
    }[escaped];

    if (mapped !== undefined) {
      output += mapped;
      continue;
    }

    if (/[0-7]/u.test(escaped)) {
      let octal = escaped;
      while (octal.length < 3 && /[0-7]/u.test(body[index + 1] ?? "")) {
        index += 1;
        octal += body[index];
      }
      output += String.fromCodePoint(Number.parseInt(octal, 8));
      continue;
    }

    if (escaped === "x") {
      const [value, nextIndex] = readHex(body, index + 1, 2, "\\x");
      output += value;
      index = nextIndex - 1;
      continue;
    }

    if (escaped === "u") {
      const [value, nextIndex] = readHex(body, index + 1, 4, "\\u");
      output += value;
      index = nextIndex - 1;
      continue;
    }

    if (escaped === "U") {
      const [value, nextIndex] = readHex(body, index + 1, 8, "\\U");
      output += value;
      index = nextIndex - 1;
      continue;
    }

    output += `\\${escaped}`;
  }
  return output;
}

function directChildren(node) {
  const direct = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    direct.push(child);
  }
  return direct;
}

function evaluateNode(source, node) {
  switch (node.name) {
    case "String":
      return decodePythonStringLiteral(textOf(source, node));
    case "Number":
      return parseNumberLiteral(textOf(source, node));
    case "VariableName": {
      const name = textOf(source, node);
      if (!CONSTANTS.has(name)) {
        throw new Error(`Unsupported variable reference: ${name}`);
      }
      return CONSTANTS.get(name);
    }
    case "ArrayExpression":
    case "TupleExpression":
    case "ArgList":
      return children(node).map((child) => evaluateNode(source, child));
    case "BinaryExpression": {
      const parts = children(node);
      const operator = directChildren(node).find(
        (part) => part.name === "ArithOp",
      );
      const operatorText = operator ? textOf(source, operator) : "";
      if (parts.length !== 2 || operatorText !== "+") {
        throw new Error(
          `Unsupported binary expression: ${textOf(source, node)}`,
        );
      }
      return evaluateNode(source, parts[0]) + evaluateNode(source, parts[1]);
    }
    case "CallExpression": {
      const parts = children(node);
      const callee = parts[0];
      const args = parts[1];
      if (
        !callee ||
        !args ||
        callee.name !== "VariableName" ||
        textOf(source, callee) !== "chr"
      ) {
        throw new Error(`Unsupported call expression: ${textOf(source, node)}`);
      }
      const values = evaluateNode(source, args);
      if (values.length !== 1 || !Number.isInteger(values[0])) {
        throw new Error(`Unsupported chr() arguments: ${textOf(source, node)}`);
      }
      return String.fromCodePoint(values[0]);
    }
    default:
      throw new Error(
        `Unsupported Python AST node ${node.name}: ${textOf(source, node)}`,
      );
  }
}

function extractTests(source) {
  const tree = parser.parse(source);
  const testsNode = findAssignment(source, tree, "tests");
  const rawTests = evaluateNode(source, testsNode);

  return rawTests.map((testCase, index) => {
    if (
      !Array.isArray(testCase) ||
      (testCase.length !== 3 && testCase.length !== 5)
    ) {
      throw new Error(`Unsupported test tuple at index ${index}`);
    }
    const [pattern, input, outcome, expr, expected] = testCase;
    if (
      typeof pattern !== "string" ||
      typeof input !== "string" ||
      typeof outcome !== "number"
    ) {
      throw new Error(`Invalid test tuple at index ${index}`);
    }
    if (!OUTCOME_NAMES.has(outcome)) {
      throw new Error(`Unknown outcome ${outcome} at index ${index}`);
    }
    let normalized;
    if (testCase.length === 3) {
      normalized = { pattern, input, outcome: OUTCOME_NAMES.get(outcome) };
    } else {
      if (typeof expr !== "string" || typeof expected !== "string") {
        throw new Error(`Invalid assertion tuple at index ${index}`);
      }
      normalized = {
        pattern,
        input,
        outcome: OUTCOME_NAMES.get(outcome),
        expr,
        expected,
      };
    }
    return normalized;
  });
}

function js(value) {
  return JSON.stringify(value);
}

function renderCase(testCase) {
  const fields = [
    `pattern: ${js(testCase.pattern)}`,
    `input: ${js(testCase.input)}`,
    `outcome: ${testCase.outcome}`,
  ];
  if (testCase.expr !== undefined) fields.push(`expr: ${js(testCase.expr)}`);
  if (testCase.expected !== undefined)
    fields.push(`expected: ${js(testCase.expected)}`);
  return `  { ${fields.join(", ")} }`;
}

function renderTestFile(testCases, sourceUrl) {
  return `// biome-ignore-all format: generated file
import { describe, expect, it } from "vitest";
import { compileEcmaRe } from "./helpers";

// Generated by scripts/update-cpython-tests.mjs from:
// ${sourceUrl}
// Do not edit this file by hand.

const SUCCEED = 0;
const FAIL = 1;
const SYNTAX_ERROR = 2;

type Outcome = typeof SUCCEED | typeof FAIL | typeof SYNTAX_ERROR;

type CpythonReCase = {
  pattern: string;
  input: string;
  outcome: Outcome;
  expr?: string;
  expected?: string;
};

const CPYTHON_RE_TESTS: CpythonReCase[] = [
${testCases.map(renderCase).join(",\n")}
];

function groupValue(match: RegExpExecArray, name: string): string {
  if (name === "found") return match[0] ?? "";

  const numericGroup = /^g(\\d+)$/u.exec(name);
  if (numericGroup) {
    const index = Number.parseInt(numericGroup[1], 10);
    if (index >= match.length) return "Error";
    return match[index] ?? "None";
  }

  return match.groups?.[name] ?? "None";
}

function decodeExpressionString(token: string): string {
  return JSON.parse(token.replace(/^'/u, '"').replace(/'$/u, '"')) as string;
}

function splitPythonExpression(expr: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quote: string | undefined;
  let escaped = false;

  for (let index = 0; index < expr.length; index += 1) {
    const char = expr[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\\\") {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "+") {
      parts.push(expr.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(expr.slice(start).trim());
  return parts.filter(Boolean);
}

function evaluateTestExpression(expr: string, match: RegExpExecArray): string {
  return splitPythonExpression(expr)
    .map((part) => {
      if (
        (part.startsWith('"') && part.endsWith('"')) ||
        (part.startsWith("'") && part.endsWith("'"))
      ) {
        return decodeExpressionString(part);
      }
      return groupValue(match, part);
    })
    .join("");
}

function runTest(testCase: CpythonReCase) {
  if (testCase.outcome === SYNTAX_ERROR) {
    expect(() => compileEcmaRe(testCase.pattern)).toThrow();
    return;
  }

  let re: RegExp;
  try {
    re = compileEcmaRe(testCase.pattern);
  } catch (error) {
    throw new Error(\`Pattern /\${testCase.pattern}/ should compile but threw: \${error}\`);
  }

  const match = re.exec(testCase.input);
  if (testCase.outcome === FAIL) {
    expect(match).toBeNull();
    return;
  }

  expect(match).not.toBeNull();
  if (!match || testCase.expr === undefined) return;

  expect(evaluateTestExpression(testCase.expr, match)).toBe(testCase.expected);
}

describe("CPython re_tests.py generated port", () => {
  for (const [index, testCase] of CPYTHON_RE_TESTS.entries()) {
    it(\`\${index}: /\${testCase.pattern}/ on \${JSON.stringify(testCase.input)}\`, () => {
      runTest(testCase);
    });
  }
});
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { source: sourceUrl, text: source } = await readSource(args.source);
  const tests = extractTests(source);
  const output = renderTestFile(tests, sourceUrl);

  if (args.dryRun) {
    process.stdout.write(output);
    return;
  }

  await writeFile(resolve(args.out), output);
  console.log(
    `Generated ${args.out} with ${tests.length} CPython re_tests.py cases.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
