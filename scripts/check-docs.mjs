#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const allowedDocStatus = new Set(["current", "historical", "proposed"]);
const allowedAdrStatus = new Set(["proposed", "accepted", "rejected", "deprecated", "superseded"]);
const allowedAudience = new Set(["user", "maintainer", "all"]);
const errors = [];

const keyReferenceFiles = [
  "docs/reference/README.md",
  "docs/reference/configuration.md",
  "docs/reference/subagents.md",
  "docs/reference/subagent-tool.md",
  "docs/reference/agent-definition.md",
  "docs/reference/result-schema.md",
  "docs/reference/web-tools.md",
  "docs/reference/web-providers.md",
  "docs/reference/web-tools-error-codes.md",
  "docs/reference/lsp-tools.md",
  "docs/reference/toolkit-commands.md",
];

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
  return /^docs\/(zh\/)?adr\/\d{4}-/.test(file) ? allowedAdrStatus : allowedDocStatus;
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

function checkReferenceNavigation() {
  for (const file of keyReferenceFiles) {
    if (!fs.existsSync(path.join(root, file))) {
      errors.push(`missing key reference file ${file}`);
    }
  }

  const readme = read("README.md");
  const readmeZh = read("README.zh.md");
  for (const file of ["docs/README.md", "docs/reference/README.md"]) {
    if (!readme.includes(`](${file})`)) {
      errors.push(`README.md: missing navigation link to ${file}`);
    }
    if (!readmeZh.includes(`](${file})`)) {
      errors.push(`README.zh.md: missing navigation link to ${file}`);
    }
  }

  const docsReadme = read("docs/README.md");
  for (const file of keyReferenceFiles) {
    const target = file.replace("docs/", "./");
    if (!docsReadme.includes(`](${target})`)) {
      errors.push(`docs/README.md: missing key reference link to ${target}`);
    }
  }

  const referenceReadme = read("docs/reference/README.md");
  for (const file of keyReferenceFiles.filter((file) => file !== "docs/reference/README.md")) {
    const target = file.replace("docs/reference/", "./");
    if (!referenceReadme.includes(`](${target})`)) {
      errors.push(`docs/reference/README.md: missing reference link to ${target}`);
    }
  }
}

function checkGuideNavigation() {
  const security = read("docs/guides/security-model.md");
  for (const target of [
    "../reference/subagents.md",
    "../reference/web-tools.md",
    "../reference/lsp-tools.md",
    "../reference/configuration.md",
  ]) {
    if (!security.includes(`](${target})`)) {
      errors.push(`docs/guides/security-model.md: missing security reference link to ${target}`);
    }
  }

  const releaseChecklist = read("docs/guides/release-checklist.md");
  for (const text of ["pnpm test", "pnpm docs:check", "CHANGELOG.md"]) {
    if (!releaseChecklist.includes(text)) {
      errors.push(`docs/guides/release-checklist.md: missing '${text}'`);
    }
  }

  const testing = read("docs/guides/testing.md");
  if (!testing.includes("docs:check")) {
    errors.push("docs/guides/testing.md: missing docs:check mention");
  }
}

function checkAllowWriteBoundary() {
  const entryFiles = [
    "README.md",
    "README.zh.md",
    "docs/README.md",
    "docs/reference/README.md",
    "docs/reference/configuration.md",
    "docs/reference/subagents.md",
    "docs/reference/subagent-tool.md",
    "docs/reference/agent-definition.md",
    "docs/guides/security-model.md",
  ];

  for (const file of entryFiles) {
    const content = read(file);
    if (!content.includes("allowWrite")) {
      errors.push(`${file}: missing allowWrite boundary mention`);
    }
    if (!/experimental|实验性/.test(content)) {
      errors.push(`${file}: allowWrite boundary must mention experimental status`);
    }
    if (!/sandbox|沙箱/.test(content) || !/audit|审计/.test(content) || !/rollback|回滚/.test(content)) {
      errors.push(`${file}: allowWrite boundary must mention sandbox/audit/rollback limits`);
    }
  }
}

function checkVitePressSite() {
  const pkg = JSON.parse(read("package.json"));
  for (const script of ["docs:dev", "docs:build", "docs:preview"]) {
    if (!pkg.scripts?.[script]) {
      errors.push(`package.json: missing ${script} script`);
    }
  }

  for (const file of ["docs/index.md", "docs/reference/index.md", "docs/adr/index.md"]) {
    if (!fs.existsSync(path.join(root, file))) {
      errors.push(`${file}: missing VitePress directory index page`);
    }
  }

  const configFile = "docs/.vitepress/config.ts";
  if (!fs.existsSync(path.join(root, configFile))) {
    errors.push(`${configFile}: missing VitePress config`);
  } else {
    const config = read(configFile);
    if (!config.includes('base: "/"')) {
      errors.push(`${configFile}: missing custom-domain base: "/"`);
    }
    for (const nav of [
      '{ text: "Guide", link: "/" }',
      '{ text: "Reference", link: "/reference/" }',
      '{ text: "ADRs", link: "/adr/" }',
    ]) {
      if (!config.includes(nav)) {
        errors.push(`${configFile}: missing VitePress nav item ${nav}`);
      }
    }
  }

  const docsSiteUrl = "https://devkit-pi.wangyan.life/";
  for (const file of ["README.md", "README.zh.md", "docs/README.md", "docs/index.md"]) {
    const content = read(file);
    if (!content.includes("docs:dev") || !content.includes("docs:build") || !content.includes("docs:preview")) {
      errors.push(`${file}: missing local documentation site commands`);
    }
    if (!content.includes(docsSiteUrl)) {
      errors.push(`${file}: missing online documentation site URL ${docsSiteUrl}`);
    }
  }

  if (!fs.existsSync(path.join(root, ".github/workflows/docs.yml"))) {
    errors.push(".github/workflows/docs.yml: missing GitHub Pages workflow");
  }
}

function checkWebErrorCodes() {
  const source = read("src/modules/web/errors.ts");
  const block = source.match(/export const WEB_ERROR_CODES = \{([\s\S]*?)\} as const;/)?.[1] ?? "";
  const codes = [...block.matchAll(/:\s*"([A-Z_]+)"/g)].map((m) => m[1]);
  if (codes.length === 0) {
    errors.push("src/modules/web/errors.ts: no WEB_ERROR_CODES found");
    return;
  }

  const doc = read("docs/reference/web-tools-error-codes.md");
  for (const code of codes) {
    if (!doc.includes(`\`${code}\``)) {
      errors.push(`docs/reference/web-tools-error-codes.md: missing web error code ${code}`);
    }
  }

  const nonCanonicalSectionMarkers = [
    "## Not currently represented as dedicated error codes",
    "## Deprecated / not canonical names",
  ];
  let canonicalDoc = doc;
  for (const marker of nonCanonicalSectionMarkers) {
    canonicalDoc = canonicalDoc.split(marker)[0] ?? canonicalDoc;
  }
  const sourceCodeSet = new Set(codes);
  const referencedCodes = [
    ...canonicalDoc.matchAll(/`([A-Z][A-Z0-9_]*(?:_[A-Z0-9]+)*)`/g),
  ].map((m) => m[1]);
  const webLikePattern = /^(INVALID_INPUT|NOT_FOUND|WEB_|CONTENT_|PROVIDER_|NETWORK_ERROR|PARSE_ERROR|CACHE_ERROR)/;
  const ignoredIdentifiers = new Set(["WEB_ERROR_CODES"]);
  for (const code of referencedCodes) {
    if (ignoredIdentifiers.has(code)) continue;
    if (webLikePattern.test(code) && !sourceCodeSet.has(code)) {
      errors.push(`docs/reference/web-tools-error-codes.md: references unknown web error code ${code}`);
    }
  }
}

function checkPlanningDocs() {
  const planningFiles = [
    "docs/planning/README.md",
    "docs/planning/add-convert_content-tool-plan.md",
    "docs/planning/personal-toolkit-feature-roadmap.md",
  ];

  for (const file of planningFiles) {
    if (!fs.existsSync(path.join(root, file))) {
      errors.push(`missing planning file ${file}`);
    }
  }

  // Old files should no longer exist in guides/
  for (const oldFile of [
    "docs/guides/add-convert_content-tool-plan.md",
    "docs/guides/personal-toolkit-feature-roadmap.md",
  ]) {
    if (fs.existsSync(path.join(root, oldFile))) {
      errors.push(`${oldFile}: planning doc should be in docs/planning/, not docs/guides/`);
    }
  }

  // Planning docs must have proposed status
  for (const file of [
    "docs/planning/add-convert_content-tool-plan.md",
    "docs/planning/personal-toolkit-feature-roadmap.md",
  ]) {
    if (!fs.existsSync(path.join(root, file))) continue;
    const content = read(file);
    const fm = parseFrontmatter(content);
    if (!fm) {
      errors.push(`${file}: missing frontmatter`);
      continue;
    }
    if (fm.status !== "proposed") {
      errors.push(`${file}: planning doc must have status 'proposed', got '${fm.status}'`);
    }
    // Check for warning about not being current behavior
    if (!/not current behavior|不代表当前/.test(content)) {
      errors.push(`${file}: planning doc must contain warning about not being current behavior`);
    }
  }
}

function checkPlanningNotInMainSidebar() {
  const configFile = "docs/.vitepress/config.ts";
  if (!fs.existsSync(path.join(root, configFile))) return;
  const config = read(configFile);

  const planningSlugs = ["add-convert_content-tool-plan", "personal-toolkit-feature-roadmap"];

  // Check that planning doc slugs don't appear in sidebar link targets
  for (const slug of planningSlugs) {
    if (config.includes(`link: "/guides/${slug}"`)) {
      errors.push(`${configFile}: sidebar must not contain old planning doc path '/guides/${slug}'`);
    }
    if (config.includes(`link: "/planning/${slug}"`)) {
      errors.push(`${configFile}: sidebar must not contain planning doc '/planning/${slug}' (plan A)`);
    }
  }
}

function checkAdr0005Title() {
  const file = "docs/adr/0005-evolve-into-devkit-pi.md";
  if (!fs.existsSync(path.join(root, file))) return;
  const content = read(file);
  if (content.includes("# ADR 0004") && !content.includes("# ADR 0005")) {
    errors.push(`${file}: title should use ADR 0005, not ADR 0004`);
  }
}

function checkDocsReadmeSections() {
  const docsReadme = read("docs/README.md");
  if (!docsReadme.includes("docs/planning/") && !docsReadme.includes("planning/")) {
    errors.push("docs/README.md: Documentation overview should mention docs/planning/");
  }
}

checkDocFrontmatter();
checkLinks();
checkAgentsInDocs();
checkErrorCodes();
checkReferenceNavigation();
checkGuideNavigation();
checkAllowWriteBoundary();
checkVitePressSite();
checkWebErrorCodes();
checkPlanningDocs();
checkPlanningNotInMainSidebar();
checkAdr0005Title();
checkDocsReadmeSections();

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("docs:check passed");
