import { ecmaRe } from "../src/index";

// --- DOM elements ---

const patternEl = document.getElementById("pattern") as HTMLTextAreaElement;
const flagsEl = document.getElementById("flags") as HTMLInputElement;
const outputEl = document.getElementById("output") as HTMLDivElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const testStringEl = document.getElementById(
  "test-string",
) as HTMLTextAreaElement;
const matchCountEl = document.getElementById("match-count") as HTMLDivElement;
const highlightedEl = document.getElementById("highlighted") as HTMLDivElement;
const groupsDetails = document.getElementById(
  "groups-details",
) as HTMLDetailsElement;
const groupsList = document.getElementById("groups-list") as HTMLDivElement;
const examplesEl = document.getElementById("examples") as HTMLDivElement;
const optAscii = document.getElementById("opt-ascii") as HTMLInputElement;
const optLoose = document.getElementById("opt-loose") as HTMLInputElement;

// --- Examples ---

interface Example {
  label: string;
  pattern: string;
  flags: string;
  test: string;
}

const EXAMPLES: Example[] = [
  {
    label: "Named groups",
    pattern: "(?P<word>\\w+)\\s+(?P=word)",
    flags: "",
    test: "hello hello world world",
  },
  {
    label: "Unicode \\w",
    pattern: "\\w+",
    flags: "",
    test: "hello café 你好 مرحبا 42",
  },
  {
    label: "\\A \\Z anchors",
    pattern: "\\A\\w+",
    flags: "m",
    test: "hello\nworld",
  },
  {
    label: "Verbose mode",
    pattern:
      "(?P<year>\\d{4})   # year\n-                  # separator\n(?P<month>\\d{2})  # month\n-                  # separator\n(?P<day>\\d{2})    # day",
    flags: "x",
    test: "Date: 2025-07-11 and 1999-12-31",
  },
  {
    label: "Lookaround",
    pattern: "(?<=@)\\w+(?=\\.)",
    flags: "",
    test: "user@example.com admin@test.org",
  },
  {
    label: "Inline flags",
    pattern: "(?i:python)\\s+\\d+",
    flags: "",
    test: "Python 3 PYTHON 4 python 5",
  },
];

function renderExamples() {
  for (const ex of EXAMPLES) {
    const btn = document.createElement("button");
    btn.textContent = ex.label;
    btn.addEventListener("click", () => loadExample(ex));
    examplesEl.appendChild(btn);
  }
}

function loadExample(ex: Example) {
  patternEl.value = ex.pattern;
  flagsEl.value = ex.flags;
  testStringEl.value = ex.test;
  update();
}

// --- Core logic ---

let currentRegex: RegExp | null = null;

function update() {
  const pattern = patternEl.value;
  const flags = flagsEl.value;

  errorEl.classList.remove("visible");
  errorEl.textContent = "";
  outputEl.textContent = "";
  currentRegex = null;

  if (!pattern) {
    updateMatches();
    return;
  }

  try {
    currentRegex = ecmaRe(pattern, flags, {
      ascii: optAscii.checked,
      loose: optLoose.checked,
    });
    outputEl.textContent = String(currentRegex);
  } catch (e: unknown) {
    errorEl.textContent = e instanceof Error ? e.message : String(e);
    errorEl.classList.add("visible");
  }

  updateMatches();
}

// --- Match highlighting ---

const MAX_DETAILS = 20;

function updateMatches() {
  matchCountEl.textContent = "";
  highlightedEl.innerHTML = "";
  groupsList.innerHTML = "";
  groupsDetails.style.display = "none";

  const testStr = testStringEl.value;
  if (!currentRegex || !testStr) return;

  try {
    const globalFlags = currentRegex.flags.includes("g")
      ? currentRegex.flags
      : `${currentRegex.flags}g`;
    const re = new RegExp(currentRegex.source, globalFlags);
    const matches = [...testStr.matchAll(re)];

    if (matches.length === 0) {
      matchCountEl.textContent = "No matches";
      highlightedEl.textContent = testStr;
      return;
    }

    matchCountEl.textContent = `${matches.length} match${matches.length > 1 ? "es" : ""}`;

    // Build inline-highlighted text
    const frag = document.createDocumentFragment();
    let cursor = 0;

    for (const m of matches) {
      const start = m.index!;
      const end = start + m[0].length;

      // Text before match
      if (start > cursor) {
        frag.appendChild(document.createTextNode(testStr.slice(cursor, start)));
      }

      const mark = document.createElement("mark");
      if (m[0].length === 0) {
        mark.className = "empty-match";
        mark.textContent = "\u200B"; // zero-width space
      } else {
        mark.textContent = m[0];
      }
      frag.appendChild(mark);
      cursor = end;
    }

    // Trailing text
    if (cursor < testStr.length) {
      frag.appendChild(document.createTextNode(testStr.slice(cursor)));
    }

    highlightedEl.appendChild(frag);

    // Group details
    const hasGroups = matches.some(
      (m) =>
        m.slice(1).some((g) => g !== undefined) ||
        (m.groups && Object.keys(m.groups).length > 0),
    );

    if (!hasGroups) return;

    groupsDetails.style.display = "";
    const detailFrag = document.createDocumentFragment();
    const limit = Math.min(matches.length, MAX_DETAILS);

    for (let i = 0; i < limit; i++) {
      const m = matches[i]!;
      const idx = document.createElement("div");
      idx.className = "match-idx";
      idx.textContent = `Match ${i + 1}: "${m[0]}"`;
      detailFrag.appendChild(idx);

      // Named groups first
      if (m.groups) {
        for (const [name, val] of Object.entries(m.groups)) {
          const entry = document.createElement("div");
          entry.className = "group-entry";
          entry.innerHTML = `<span class="group-name">${name}</span> = <span class="group-val">"${escapeHtml(val ?? "")}"</span>`;
          detailFrag.appendChild(entry);
        }
      }

      // Positional groups (skip those already shown as named)
      const namedValues = m.groups ? new Set(Object.values(m.groups)) : null;
      for (let g = 1; g < m.length; g++) {
        const val = m[g];
        if (val === undefined) continue;
        // Skip if this value matches a named group (heuristic: same ref)
        if (namedValues?.has(val)) continue;
        const entry = document.createElement("div");
        entry.className = "group-entry";
        entry.innerHTML = `<span class="group-name">$${g}</span> = <span class="group-val">"${escapeHtml(val)}"</span>`;
        detailFrag.appendChild(entry);
      }
    }

    if (matches.length > MAX_DETAILS) {
      const more = document.createElement("div");
      more.className = "match-idx";
      more.textContent = `… and ${matches.length - MAX_DETAILS} more`;
      detailFrag.appendChild(more);
    }

    groupsList.appendChild(detailFrag);
  } catch {
    matchCountEl.textContent = "Match error";
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// --- Event listeners ---

patternEl.addEventListener("input", update);
flagsEl.addEventListener("input", update);
testStringEl.addEventListener("input", updateMatches);
optAscii.addEventListener("change", update);
optLoose.addEventListener("change", update);

// --- Init ---

renderExamples();
// Load first example by default
loadExample(EXAMPLES[0]!);
