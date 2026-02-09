import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

function normalizeWhitespace(text) {
  return (text || '')
    .replace(/\r\n?|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeader(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '');
}

function readCsvRawRows(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const { data } = Papa.parse(text, { header: false, skipEmptyLines: false });
  return data; // array of arrays
}

function detectHeaderIndexAndColumns(rawRows) {
  let headerIndex = -1;
  let problemIdx = -1;
  let solutionIdx = -1;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const norms = row.map(normalizeHeader);
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
  if (headerIndex === -1 || problemIdx === -1 || solutionIdx === -1) return [];

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

let cachedPairs = null;
let cachedMtime = null;

function getClinicFiles() {
  return [
    path.join(process.cwd(), 'data', 'Sector Specialist Service Form Kalapara Nilganj - Sector Specialist Service Form.xlsx - Kalapara Nilganj.csv.csv'),
    path.join(process.cwd(), 'data', 'Sector Specialist Service Form Rampal - Sector Specialist Service Form.xlsx - Rampal.csv.csv')
  ];
}

function loadClinicPairs() {
  const files = getClinicFiles();
  const mtimes = files.map((f) => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0));
  const newest = Math.max(...mtimes);
  if (cachedPairs && cachedMtime === newest) return cachedPairs;

  const allPairs = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const raw = readCsvRawRows(file);
    const pairs = extractPairsFromRaw(raw);
    allPairs.push(...pairs);
  }
  cachedPairs = allPairs;
  cachedMtime = newest;
  return cachedPairs;
}

function scoreSimilarity(query, text) {
  const qWords = (query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const tWords = (text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (qWords.length === 0 || tWords.length === 0) return 0;
  let matches = 0;
  for (const w of qWords) {
    if (w.length < 2) continue;
    if (tWords.some((tw) => tw.includes(w) || w.includes(tw))) matches++;
  }
  return matches / qWords.length;
}

export function searchClinicAdvice(query, topK = 5) {
  const pairs = loadClinicPairs();
  if (!pairs || pairs.length === 0) return [];
  const scored = pairs.map((p) => ({ ...p, score: Math.max(
    scoreSimilarity(query, p.problem),
    scoreSimilarity(query, p.solution)
  ) }));
  return scored
    .filter((p) => p.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ problem, solution, score }) => ({ problem, solution, score }));
}



