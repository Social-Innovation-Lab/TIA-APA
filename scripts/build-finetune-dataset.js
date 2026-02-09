/*
  Build a chat fine-tuning dataset from adaptation clinic CSVs.
  Reads the two clinic CSVs and produces JSONL lines with messages:
  [{role: 'system'|'user'|'assistant', content: string}]
*/

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const INPUT_FILES = [
  path.join(process.cwd(), 'data', 'Sector Specialist Service Form Kalapara Nilganj - Sector Specialist Service Form.xlsx - Kalapara Nilganj.csv.csv'),
  path.join(process.cwd(), 'data', 'Sector Specialist Service Form Rampal - Sector Specialist Service Form.xlsx - Rampal.csv.csv')
];

const OUTPUT_DIR = path.join(process.cwd(), 'data');
const OUTPUT_JSONL = path.join(OUTPUT_DIR, 'clinic_finetune_chat.jsonl');
const PREVIEW_CSV = path.join(OUTPUT_DIR, 'clinic_finetune_preview.csv');

function readCsvRawRows(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const { data } = Papa.parse(text, { header: false, skipEmptyLines: false });
  return data; // array of arrays
}

function normalizeWhitespace(text) {
  return (text || '')
    .replace(/\r\n?|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeader(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ''); // keep letters only for robust match
}

function detectHeaderIndexAndColumns(rawRows) {
  // Find the row that contains our expected headers
  let headerIndex = -1;
  let problemIdx = -1;
  let solutionIdx = -1;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    // Build normalized cell list
    const norms = row.map(normalizeHeader);
    // Find candidate indexes
    const pIdx = norms.findIndex((c) => c.includes('problemsfound') || c === 'problem' || c.includes('problem'));
    const sIdx = norms.findIndex((c) => c.includes('advicesolutiongiven') || (c.includes('advice') && c.includes('solution')) || c.includes('solutiongiven') || c === 'solution');
    if (pIdx !== -1 && sIdx !== -1) {
      headerIndex = i;
      problemIdx = pIdx;
      solutionIdx = sIdx;
      break;
    }
  }

  return { headerIndex, problemIdx, solutionIdx };
}

function extractPairsFromRaw(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];

  const { headerIndex, problemIdx, solutionIdx } = detectHeaderIndexAndColumns(rawRows);
  if (headerIndex === -1) {
    console.warn('Warning: Could not detect header row with expected columns.');
    return [];
  }
  if (problemIdx === -1 || solutionIdx === -1) {
    console.warn('Warning: Could not detect problem/solution columns in detected header row.');
    return [];
  }

  const dataRows = rawRows.slice(headerIndex + 1);
  const pairs = [];
  for (const row of dataRows) {
    if (!Array.isArray(row)) continue;
    const problem = normalizeWhitespace(row[problemIdx]);
    const solution = normalizeWhitespace(row[solutionIdx]);
    if (!problem || !solution) continue;
    if (/^n\/?a$/i.test(problem) || /^n\/?a$/i.test(solution)) continue;
    pairs.push({ problem, solution });
  }
  return pairs;
}

function dedupePairs(pairs) {
  const seen = new Set();
  const unique = [];
  for (const p of pairs) {
    const key = `${p.problem}\u0000${p.solution}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }
  return unique;
}

function toChatJsonlLine(problem, solution) {
  const messages = [
    {
      role: 'system',
      content: 'You are an expert agriculture advisor for Bangladeshi farmers. Provide practical, concise, and locally appropriate advice.'
    },
    { role: 'user', content: problem },
    { role: 'assistant', content: solution }
  ];
  return JSON.stringify({ messages });
}

function writeJsonl(pairs, outPath) {
  const fd = fs.openSync(outPath, 'w');
  try {
    for (const { problem, solution } of pairs) {
      const line = toChatJsonlLine(problem, solution);
      fs.writeSync(fd, line + '\n');
    }
  } finally {
    fs.closeSync(fd);
  }
}

function writePreviewCsv(pairs, outPath) {
  const header = 'problem,solution\n';
  const lines = pairs.slice(0, 200).map(({ problem, solution }) => {
    const esc = (s) => '"' + (s || '').replace(/"/g, '""') + '"';
    return `${esc(problem)},${esc(solution)}`;
  });
  fs.writeFileSync(outPath, header + lines.join('\n'), 'utf8');
}

function main() {
  const allPairs = [];
  for (const file of INPUT_FILES) {
    if (!fs.existsSync(file)) {
      console.error('Missing input CSV:', file);
      process.exitCode = 1;
      continue;
    }
    const rawRows = readCsvRawRows(file);
    const pairs = extractPairsFromRaw(rawRows);
    allPairs.push(...pairs);
  }
  const uniquePairs = dedupePairs(allPairs);
  if (uniquePairs.length === 0) {
    console.error('No training pairs extracted. Check CSV headers and content.');
    process.exit(1);
  }
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  writeJsonl(uniquePairs, OUTPUT_JSONL);
  writePreviewCsv(uniquePairs, PREVIEW_CSV);
  console.log(`Wrote ${uniquePairs.length} training examples to ${OUTPUT_JSONL}`);
  console.log(`Preview (first 200 rows): ${PREVIEW_CSV}`);
}

main();


