#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const allowedAudience = new Set(["user", "maintainer", "all"]);
const allowedLanguage = new Set(["english", "chinese"]);

const DOC_META_RULES = {
  defaultStatus: new Set(["current", "deprecated", "proposed", "implemented", "template"]),
  defaultAudience: allowedAudience,
  scoped: [
    {
      pattern: /^(docs\/(zh\/)?adr|internal-docs\/adr)\/\d{4}-/,
      status: new Set(["proposed", "accepted", "rejected", "deprecated", "superseded"]),
    },
    {
      pattern: /^internal-docs\/archive\//,
      status: new Set(["archived", "current"]),
    },
    {
      pattern: /^internal-docs\/audit\//,
      status: new Set(["draft", "current", "superseded", "template", "implemented"]),
    },
    {
      pattern: /^internal-docs\/issues\//,
      status: new Set(["proposed", "in_progress", "implemented", "wontfix", "superseded", "current"]),
    },
    {
      pattern: /^internal-docs\/planning\//,
      status: new Set(["proposed", "approved", "implemented", "cancelled", "superseded", "current"]),
    },
    {
      pattern: /^internal-docs\/maintain\//,
      status: new Set(["current", "deprecated"]),
    },
    {
      pattern: /^docs\/(zh\/)?guides\//,
      status: new Set(["current", "deprecated"]),
    },
    {
      pattern: /^docs\/(zh\/)?reference\//,
      status: new Set(["current", "deprecated"]),
    },
    {
      pattern: /^docs\//,
      audience: new Set(["user", "all"]),
    },
    {
      pattern: /^internal-docs\//,
      audience: new Set(["maintainer", "all"]),
    },
  ],
};
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
  "docs/reference/convert-tools.md",
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

function matchingRulesFor(file, key) {
  return DOC_META_RULES.scoped.filter((rule) => rule.pattern.test(file) && rule[key]);
}

function ruleFor(file, key) {
  const matches = matchingRulesFor(file, key);
  if (matches.length > 0) return matches[0][key];
  return key === "status" ? DOC_META_RULES.defaultStatus : DOC_META_RULES.defaultAudience;
}

function matchedRuleFor(file, key) {
  const matches = matchingRulesFor(file, key);
  return matches[0] ?? null;
}

function scopeNameFor(file, key) {
  const matchedRule = matchedRuleFor(file, key);
  return matchedRule ? matchedRule.pattern.toString() : key === "status" ? "defaultStatus" : "defaultAudience";
}

function checkDocMetaRuleConflicts() {
  for (const file of markdownFilesUnder("docs", "internal-docs")) {
    for (const key of ["status", "audience"]) {
      const matches = matchingRulesFor(file, key);
      if (matches.length > 1) {
        errors.push(
          `${file}: conflicting ${key} rules matched (${matches
            .map((rule) => rule.pattern.toString())
            .join(" | ")})`
        );
      }
    }
  }
}

function allowedStatusFor(file) {
  return ruleFor(file, "status");
}

function allowedAudienceFor(file) {
  return ruleFor(file, "audience");
}

function markdownFilesUnder(...dirs) {
  return dirs.flatMap((dir) =>
    fs.existsSync(path.join(root, dir)) ? walk(dir).filter((f) => f.endsWith(".md")) : []
  );
}

function checkDocFrontmatter() {
  for (const file of markdownFilesUnder("docs", "internal-docs")) {
    const fm = parseFrontmatter(read(file));
    if (!fm) {
      errors.push(`${file}: missing frontmatter`);
      continue;
    }
    // Mandatory frontmatter fields
    if (!fm.status) {
      errors.push(`${file}: missing required field 'status'`);
    }
    if (!fm.audience) {
      errors.push(`${file}: missing required field 'audience'`);
    }
    if (!fm.last_verified) {
      errors.push(`${file}: missing required field 'last_verified'`);
    }
    if (!fm.language) {
      errors.push(`${file}: missing required field 'language'`);
    }
    // Value validation
    const allowedStatus = allowedStatusFor(file);
    const statusScope = scopeNameFor(file, "status");
    if (fm.status && !allowedStatus.has(fm.status)) {
      errors.push(
        `${file}: invalid status '${fm.status}' for scope '${statusScope}' (allowed: ${[...allowedStatus].join(", ")})`
      );
    }
    const audienceScope = scopeNameFor(file, "audience");
    const scopedAllowedAudience = allowedAudienceFor(file);
    if (fm.audience && !allowedAudience.has(fm.audience)) {
      errors.push(
        `${file}: invalid audience '${fm.audience}' (allowed: ${[...allowedAudience].join(", ")}; scope '${audienceScope}' allows: ${[
          ...scopedAllowedAudience,
        ].join(", ")})`
      );
    }
    if (fm.audience && !scopedAllowedAudience.has(fm.audience)) {
      errors.push(
        `${file}: audience '${fm.audience}' not allowed for scope '${audienceScope}' (allowed: ${[
          ...scopedAllowedAudience,
        ].join(", ")})`
      );
    }
    if (fm.last_verified && !/^\d{4}-\d{2}-\d{2}$/.test(fm.last_verified)) {
      if (!(fm.status === "template" && fm.last_verified === "YYYY-MM-DD")) {
        errors.push(`${file}: invalid last_verified '${fm.last_verified}'`);
      }
    }
    if (fm.language && !allowedLanguage.has(fm.language)) {
      errors.push(`${file}: invalid language '${fm.language}'`);
    }
  }
}

function checkLinks() {
  for (const file of markdownFilesUnder("docs", "internal-docs")) {
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
  }
  for (const file of ["docs/zh/README.md", "docs/zh/reference/README.md"]) {
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

  const internalReleaseChecklist = read("internal-docs/maintain/release-checklist.md");
  for (const text of ["pnpm test", "pnpm docs:check", "CHANGELOG.md"]) {
    if (!internalReleaseChecklist.includes(text)) {
      errors.push(`internal-docs/maintain/release-checklist.md: missing '${text}'`);
    }
  }

  const internalTesting = read("internal-docs/maintain/testing.md");
  if (!internalTesting.includes("docs:check")) {
    errors.push("internal-docs/maintain/testing.md: missing docs:check mention");
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

  for (const file of ["docs/index.md", "docs/reference/index.md", "docs/zh/index.md", "docs/zh/reference/index.md"]) {
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
      '{ text: "指南", link: "/zh/" }',
      '{ text: "参考", link: "/zh/reference/" }',
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
    "internal-docs/planning/README.md",
    "internal-docs/planning/add-convert_content-tool-plan.md",
    "internal-docs/planning/personal-toolkit-feature-roadmap.md",
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

  // Planning docs status is now governed by allowedStatusFor("internal-docs/planning/*")
  // in checkDocFrontmatter(), avoiding per-file hardcoded status rules.
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
  const file = "internal-docs/adr/0005-evolve-into-devkit-pi.md";
  if (!fs.existsSync(path.join(root, file))) return;
  const content = read(file);
  if (content.includes("# ADR 0004") && !content.includes("# ADR 0005")) {
    errors.push(`${file}: title should use ADR 0005, not ADR 0004`);
  }
}

function checkDocsReadmeSections() {
  const docsReadme = read("docs/README.md");
  if (!docsReadme.includes("internal-docs/")) {
    errors.push("docs/README.md: Documentation overview should mention internal-docs/");
  }
  const internalReadme = read("internal-docs/README.md");
  for (const section of ["maintain", "adr", "planning", "archive", "issues", "audit"]) {
    if (!internalReadme.includes(`./${section}/`)) {
      errors.push(`internal-docs/README.md: missing ${section} section link`);
    }
  }
}

function extractObjectBlock(source, exportName) {
  const start = source.indexOf(`export const ${exportName}`);
  if (start === -1) {
    errors.push(`src/config/load-config.ts: missing ${exportName}`);
    return "";
  }
  const open = source.indexOf("{", start);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(open, i + 1);
  }
  return "";
}

function extractDefaultValue(block, key) {
  const match = block.match(new RegExp(`\\n\\s*${key}:\\s*([^,\\n]+)`));
  return match?.[1]?.trim();
}

function checkGuideSidebarCoverage() {
  const configFile = "docs/.vitepress/config.ts";
  if (!fs.existsSync(path.join(root, configFile))) return;
  const config = read(configFile);

  const guideFiles = walk("docs/guides")
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/^docs\/guides\//, "").replace(/\.md$/, ""));
  for (const slug of guideFiles) {
    const link = `link: "/guides/${slug}"`;
    if (!config.includes(link)) {
      errors.push(`${configFile}: missing guide sidebar link ${link}`);
    }
  }

  const zhGuideFiles = walk("docs/zh/guides")
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/^docs\/zh\/guides\//, "").replace(/\.md$/, ""));
  for (const slug of zhGuideFiles) {
    const link = `link: "/zh/guides/${slug}"`;
    if (!config.includes(link)) {
      errors.push(`${configFile}: missing zh guide sidebar link ${link}`);
    }
  }
}

function checkConfigDefaultDrift() {
  const source = read("src/config/load-config.ts");
  const subagents = extractObjectBlock(source, "DEFAULT_SUBAGENTS_CONFIG");
  const web = extractObjectBlock(source, "DEFAULT_WEB_CONFIG");
  const convert = extractObjectBlock(source, "DEFAULT_CONVERT_CONTENT_CONFIG");
  const lsp = extractObjectBlock(source, "DEFAULT_CONFIG");

  const defaults = {
    subagentsTimeoutMs: extractDefaultValue(subagents, "timeoutMs"),
    subagentsIdleTimeoutMs: extractDefaultValue(subagents, "idleTimeoutMs"),
    webMaxResponseBytes: extractDefaultValue(web, "maxResponseBytes"),
    convertMaxContentChars: extractDefaultValue(convert, "maxContentChars"),
    lspHookEnabled: extractDefaultValue(lsp, "enabled"),
    lspHookMode: lsp.match(/hook:\s*\{[\s\S]*?mode:\s*"([^"]+)"/)?.[1],
  };

  for (const [name, value] of Object.entries(defaults)) {
    if (!value) errors.push(`src/config/load-config.ts: could not extract default ${name}`);
  }

  const configDocs = ["docs/reference/configuration.md", "docs/zh/reference/configuration.md"];
  for (const file of configDocs) {
    const doc = read(file);
    const requiredSnippets = [
      [`"timeoutMs": ${defaults.subagentsTimeoutMs}`, "subagents.timeoutMs default example"],
      [`"idleTimeoutMs": ${defaults.subagentsIdleTimeoutMs}`, "subagents.idleTimeoutMs default example"],
      [`| \`subagents.timeoutMs\` | number | \`${defaults.subagentsTimeoutMs}\``, "subagents.timeoutMs table default"],
      [`| \`subagents.idleTimeoutMs\` | number | \`${defaults.subagentsIdleTimeoutMs}\``, "subagents.idleTimeoutMs table default"],
      [`| \`web.maxResponseBytes\` | number | \`${defaults.webMaxResponseBytes}\``, "web.maxResponseBytes table default"],
      [`| \`convertContent.maxContentChars\` | number | \`${defaults.convertMaxContentChars}\``, "convertContent.maxContentChars table default"],
      [`| \`lsp.hook.enabled\` | boolean | \`${defaults.lspHookEnabled}\``, "lsp.hook.enabled table default"],
      [`| \`lsp.hook.mode\` | \`agent_end\` / \`edit_write\` / \`disabled\` | \`${defaults.lspHookMode}\``, "lsp.hook.mode table default"],
    ];
    for (const [snippet, label] of requiredSnippets) {
      if (!doc.includes(snippet)) errors.push(`${file}: missing or stale ${label}`);
    }
  }

  const subagentDocs = ["docs/reference/subagents.md", "docs/zh/reference/subagents.md"];
  for (const file of subagentDocs) {
    const doc = read(file);
    for (const [snippet, label] of [
      [`"timeoutMs": ${defaults.subagentsTimeoutMs}`, "subagents.timeoutMs default summary"],
      [`"idleTimeoutMs": ${defaults.subagentsIdleTimeoutMs}`, "subagents.idleTimeoutMs default summary"],
    ]) {
      if (!doc.includes(snippet)) errors.push(`${file}: missing or stale ${label}`);
    }
  }
}

function checkPublicAssets() {
  const requiredAssets = [
    "docs/public/favicon.png",
    "docs/public/logo.png",
    "docs/public/apple-touch-icon.png",
    "docs/public/social-preview.png",
  ];
  for (const file of requiredAssets) {
    if (!fs.existsSync(path.join(root, file))) {
      errors.push(`missing public asset ${file}`);
    }
  }
}

function checkVitePressHeadMeta() {
  const configFile = "docs/.vitepress/config.ts";
  if (!fs.existsSync(path.join(root, configFile))) return;
  const config = read(configFile);

  const requiredHeadEntries = [
    { pattern: 'rel: "icon"', label: "favicon link" },
    { pattern: 'rel: "apple-touch-icon"', label: "apple-touch-icon link" },
    { pattern: 'property: "og:image"', label: "og:image meta" },
    { pattern: 'name: "twitter:card"', label: "twitter:card meta" },
  ];
  for (const { pattern, label } of requiredHeadEntries) {
    if (!config.includes(pattern)) {
      errors.push(`${configFile}: missing head config for ${label}`);
    }
  }
}

checkDocMetaRuleConflicts();
checkDocFrontmatter();
checkLinks();
checkAgentsInDocs();
checkErrorCodes();
checkReferenceNavigation();
checkGuideNavigation();
checkAllowWriteBoundary();
checkVitePressSite();
checkVitePressHeadMeta();
checkPublicAssets();
checkWebErrorCodes();
checkPlanningDocs();
checkPlanningNotInMainSidebar();
checkAdr0005Title();
checkDocsReadmeSections();
checkGuideSidebarCoverage();
checkConfigDefaultDrift();

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("docs:check passed");
