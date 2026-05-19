import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const coverageRoot = path.join(repoRoot, ".coverage");
const v8Dir = path.join(coverageRoot, "v8");
const srcDir = path.join(repoRoot, "src");

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function round2(value) {
  return Number(value.toFixed(2));
}

async function listTsFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listTsFiles(full)));
      continue;
    }
    if (entry.isFile() && full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  const sorted = intervals
    .map(([s, e]) => [Math.max(0, s), Math.max(0, e)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return [];
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const prev = merged[merged.length - 1];
    if (curr[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], curr[1]);
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

function buildLineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function lineCoverageFromIntervals(source, mergedIntervals) {
  const lineStarts = buildLineStarts(source);
  let coverable = 0;
  let covered = 0;

  let intervalIdx = 0;
  for (let line = 0; line < lineStarts.length; line++) {
    const start = lineStarts[line];
    const end = line + 1 < lineStarts.length ? lineStarts[line + 1] : source.length;
    const text = source.slice(start, end);
    if (text.trim().length === 0) {
      continue;
    }
    coverable++;

    while (intervalIdx < mergedIntervals.length && mergedIntervals[intervalIdx][1] <= start) {
      intervalIdx++;
    }

    let isCovered = false;
    if (intervalIdx < mergedIntervals.length) {
      const [is, ie] = mergedIntervals[intervalIdx];
      if (ie > start && is < end) {
        isCovered = true;
      }
    }

    if (isCovered) covered++;
  }

  return { coverable, covered };
}

function classifyModule(relPath) {
  const p = toPosix(relPath);
  if (p.startsWith("src/modules/web/")) return "web";
  if (p.startsWith("src/modules/convert/")) return "convert";
  if (p.startsWith("src/modules/subagents/")) return "subagents";
  if (p.startsWith("src/modules/lsp/")) return "lsp";
  if (p.startsWith("src/shared/")) return "shared";
  return "other";
}

async function loadV8Entries() {
  const dirStat = await stat(v8Dir).catch(() => null);
  if (!dirStat || !dirStat.isDirectory()) {
    throw new Error(`V8 coverage directory not found: ${v8Dir}`);
  }

  const files = (await readdir(v8Dir)).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(`No V8 coverage json files found in: ${v8Dir}`);
  }

  const scriptIntervals = new Map();

  for (const f of files) {
    const full = path.join(v8Dir, f);
    const raw = JSON.parse(await readFile(full, "utf8"));
    const results = Array.isArray(raw.result) ? raw.result : [];

    for (const script of results) {
      if (!script || typeof script.url !== "string" || !Array.isArray(script.functions)) {
        continue;
      }
      const ranges = [];
      for (const fn of script.functions) {
        if (!fn || !Array.isArray(fn.ranges)) continue;
        for (const r of fn.ranges) {
          if (!r || typeof r.count !== "number") continue;
          if (r.count > 0) {
            ranges.push([r.startOffset, r.endOffset]);
          }
        }
      }
      if (ranges.length === 0) continue;
      const prev = scriptIntervals.get(script.url) ?? [];
      prev.push(...ranges);
      scriptIntervals.set(script.url, prev);
    }
  }

  return scriptIntervals;
}

async function main() {
  const srcFiles = await listTsFiles(srcDir);
  if (srcFiles.length === 0) {
    throw new Error(`No TypeScript source files found under: ${srcDir}`);
  }

  const intervalsByUrl = await loadV8Entries();
  const fileRows = [];
  let unknownFiles = 0;

  for (const absPath of srcFiles) {
    const relPath = toPosix(path.relative(repoRoot, absPath));
    const fileUrl = pathToFileURL(absPath).href;
    const source = await readFile(absPath, "utf8");

    const intervals = intervalsByUrl.get(fileUrl) ?? [];
    const merged = mergeIntervals(intervals);

    const { coverable, covered } = lineCoverageFromIntervals(source, merged);
    const functionTotal = source.includes("function") || source.includes("=>") ? 1 : 0;
    const functionCovered = functionTotal > 0 && merged.length > 0 ? 1 : 0;

    if (!intervalsByUrl.has(fileUrl)) {
      unknownFiles++;
    }

    const linePct = coverable > 0 ? (covered / coverable) * 100 : 100;
    const functionPct = functionTotal > 0 ? (functionCovered / functionTotal) * 100 : 100;

    fileRows.push({
      path: relPath,
      module: classifyModule(relPath),
      linePct,
      functionPct,
      coverableLines: coverable,
      coveredLines: covered,
    });
  }

  const totals = fileRows.reduce(
    (acc, row) => {
      acc.files++;
      acc.coverableLines += row.coverableLines;
      acc.coveredLines += row.coveredLines;
      if (row.coveredLines > 0) acc.coveredFiles++;
      return acc;
    },
    { files: 0, coveredFiles: 0, coverableLines: 0, coveredLines: 0 },
  );

  const modules = ["web", "convert", "subagents", "lsp", "shared", "other"];
  const byModule = {};
  for (const m of modules) {
    const rows = fileRows.filter((r) => r.module === m);
    const moduleCoverable = rows.reduce((n, r) => n + r.coverableLines, 0);
    const moduleCovered = rows.reduce((n, r) => n + r.coveredLines, 0);
    byModule[m] = {
      files: rows.length,
      linePct: moduleCoverable > 0 ? round2((moduleCovered / moduleCoverable) * 100) : 100,
    };
  }

  const lowestFiles = [...fileRows]
    .sort((a, b) => a.linePct - b.linePct || a.path.localeCompare(b.path))
    .slice(0, 10)
    .map((r) => ({ path: r.path, linePct: round2(r.linePct), functionPct: round2(r.functionPct) }));

  const summary = {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    command: "pnpm test:coverage",
    totals: {
      files: totals.files,
      coveredFiles: totals.coveredFiles,
      uncoveredFiles: totals.files - totals.coveredFiles,
      linePct:
        totals.coverableLines > 0 ? round2((totals.coveredLines / totals.coverableLines) * 100) : 100,
      functionPct: round2(
        fileRows.length > 0
          ? fileRows.reduce((n, r) => n + r.functionPct, 0) / fileRows.length
          : 100,
      ),
    },
    byModule,
    unknownFiles,
    lowestFiles,
  };

  await writeFile(path.join(coverageRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const moduleLines = modules
    .map((m) => `- ${m}: ${byModule[m].linePct}% (${byModule[m].files} files)`)
    .join("\n");

  const lowLines = lowestFiles
    .map((r, i) => `${i + 1}. \`${r.path}\` - line ${r.linePct}% / function ${r.functionPct}%`)
    .join("\n");

  const hotspots = `# V8 Coverage Hotspots\n\n- GeneratedAt: ${summary.generatedAt}\n- Node: ${summary.nodeVersion}\n- Command: ${summary.command}\n- Files: ${summary.totals.files} (covered ${summary.totals.coveredFiles}, uncovered ${summary.totals.uncoveredFiles})\n- Total Line Coverage: ${summary.totals.linePct}%\n- Total Function Coverage (approx): ${summary.totals.functionPct}%\n- Unknown files (not present in raw): ${summary.unknownFiles}\n\n## Module Ranking\n\n${moduleLines}\n\n## Lowest Coverage Top 10\n\n${lowLines || "(none)"}\n\n## Notes\n\n- Metrics are derived from Node native V8 ranges and are intended for trend/hotspot observation.\n- This report is approximate and not equivalent to statement/branch coverage from Istanbul-based tooling.\n`;

  await writeFile(path.join(coverageRoot, "hotspots.md"), hotspots, "utf8");

  console.log(`[coverage] summary written: ${path.join(coverageRoot, "summary.json")}`);
  console.log(`[coverage] hotspots written: ${path.join(coverageRoot, "hotspots.md")}`);
}

main().catch((error) => {
  console.error("[coverage] report failed:", error);
  process.exit(1);
});
