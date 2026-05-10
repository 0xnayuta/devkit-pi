#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const allowedDocStatus = new Set(["current", "historical", "proposed"]);
const allowedAdrStatus = new Set(["proposed", "accepted", "rejected", "deprecated", "superseded"]);
const allowedAudience = new Set(["user", "maintainer", "all"]);
const errors = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(rel));
    else result.push(rel.replaceAll(path.sep, "/"));
  }
  return result;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    data[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return data;
}

function allowedStatusFor(file) {
  return /^docs\/adr\/\d{4}-/.test(file) ? allowedAdrStatus : allowedDocStatus;
}

function checkDocFrontmatter() {
  for (const file of walk("docs").filter((f) => f.endsWith(".md"))) {
    const fm = parseFrontmatter(read(file));
    if (!fm) {
      errors.push(`${file}: missing frontmatter`);
      continue;
    }
    if (!allowedStatusFor(file).has(fm.status)) {
      errors.push(`${file}: invalid status '${fm.status}'`);
    }
    if (!allowedAudience.has(fm.audience)) {
      errors.push(`${file}: invalid audience '${fm.audience}'`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.last_verified ?? "")) {
      errors.push(`${file}: invalid last_verified '${fm.last_verified}'`);
    }
  }
}

function checkLinks() {
  for (const file of walk("docs").filter((f) => f.endsWith(".md"))) {
    const content = read(file);
    for (const match of content.matchAll(/\[[^\]]*\]\((?!https?:|mailto:|#)([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target) continue;
      const resolved = path.normalize(path.join(root, path.dirname(file), target));
      if (!fs.existsSync(resolved)) {
        errors.push(`${file}: broken link '${match[1]}'`);
      }
    }
  }
}

function parseAgent(file) {
  const content = read(file);
  const fm = parseFrontmatter(content);
  if (!fm) throw new Error(`${file}: missing frontmatter`);
  return {
    name: fm.name,
    tools: (fm.tools ?? "")
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean),
    readonly: fm.readonly,
  };
}

function checkAgentsInDocs() {
  const agents = walk("agents")
    .filter((f) => f.endsWith(".md"))
    .map(parseAgent)
    .sort((a, b) => a.name.localeCompare(b.name));
  const expectedNames = ["explorer", "implementer", "researcher", "reviewer", "tester"];
  const actualNames = agents.map((agent) => agent.name).sort();
  if (actualNames.join(",") !== expectedNames.sort().join(",")) {
    errors.push(`agents/*.md: expected builtin agents ${expectedNames.join(", ")}, got ${actualNames.join(", ")}`);
  }
  for (const agent of agents) {
    if (agent.readonly !== "true") errors.push(`agents/${agent.name}.md: builtin agent must be readonly: true`);
    const escapedTools = agent.tools.join(", ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedName = agent.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rowPattern = new RegExp("\\\\| `" + escapedName + "` \\\\|[^\\n]*\\\\| " + escapedTools + " \\\\|");
    const readme = read("README.md");
    if (!rowPattern.test(readme)) {
      errors.push(`README.md: missing or stale tools row for agent '${agent.name}'`);
    }
    const reference = read("docs/reference/agent-definition.md");
    const referencePattern = new RegExp("\\\\| `" + escapedName + "` \\\\|[^\\n]*\\\\| `" + escapedTools + "` \\\\|");
    if (!referencePattern.test(reference)) {
      errors.push(`docs/reference/agent-definition.md: missing or stale tools row for agent '${agent.name}'`);
    }
  }
}

function checkErrorCodes() {
  const types = read("src/shared/types.ts");
  const block = types.match(/export const SUBAGENT_ERROR_CODES = \{([\s\S]*?)\} as const;/)?.[1] ?? "";
  const codes = [...block.matchAll(/:\s*"([A-Z_]+)"/g)].map((m) => m[1]);
  if (codes.length === 0) {
    errors.push("src/shared/types.ts: no SUBAGENT_ERROR_CODES found");
    return;
  }
  const resultSchema = read("docs/reference/result-schema.md");
  const readme = read("README.md");
  for (const code of codes) {
    if (!resultSchema.includes(`\`${code}\``)) {
      errors.push(`docs/reference/result-schema.md: missing error code ${code}`);
    }
    if (!readme.includes(`\`${code}\``)) {
      errors.push(`README.md: missing error code ${code}`);
    }
  }
}

checkDocFrontmatter();
checkLinks();
checkAgentsInDocs();
checkErrorCodes();

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("docs:check passed");
