export type DevkitToolModule = "subagents" | "web" | "convert" | "lsp";

export type DevkitToolSafety = "readonly" | "network" | "external-command" | "mutating";

export interface DevkitToolMetadata {
	readonly name: "subagent" | "web_search" | "fetch_content" | "get_search_content" | "convert_content" | "lsp";
	readonly label: string;
	readonly description: string;
	readonly module: DevkitToolModule;
	readonly safety: DevkitToolSafety;
	readonly promptSnippet: string;
	readonly promptGuidelines: readonly [string, ...string[]];
}

export const DEVKIT_TOOL_MANIFEST: readonly DevkitToolMetadata[] = [
	{
		name: "subagent",
		label: "Subagent",
		description: `Delegate a focused task to a specialized readonly agent.

Available agents:
• explorer - Codebase navigation and file search (readonly)
• researcher - Web research and information synthesis (readonly)
• reviewer - Code review and quality assessment (readonly)
• implementer - Implementation planning (readonly)
• tester - Test planning and strategy (readonly)

Parameters:
• agent: Agent name to use
• task: Task description

Example:
  subagent({ agent: "explorer", task: "Find where authentication is implemented" })`,
		module: "subagents",
		safety: "readonly",
		promptSnippet: 'subagent({ agent: "explorer", task: "Find ..." })',
		promptGuidelines: [
			"Use for focused delegation when one specialist can finish a bounded task.",
			"Provide one concrete objective with explicit scope and expected output.",
			"Do not use for nested orchestration; subagents must not delegate further.",
		],
	},
	{
		name: "web_search",
		label: "Web Search",
		description: "Search the web with the configured readonly search provider.",
		module: "web",
		safety: "network",
		promptSnippet: 'web_search({ query: "..." })',
		promptGuidelines: [
			"Use for discovery when you need recent external information.",
			"Start with a narrow query and small result count before broadening.",
			"After search, use get_search_content(responseId) instead of repeating the same query.",
		],
	},
	{
		name: "fetch_content",
		label: "Fetch Content",
		description: "Fetch HTTP/HTTPS URL content and extract readable text. Readonly.",
		module: "web",
		safety: "network",
		promptSnippet: 'fetch_content({ url: "https://example.com" })',
		promptGuidelines: [
			"Use when you already have specific URLs to inspect.",
			"Prefer a single URL first; batch inputs only when necessary.",
			"For JS-heavy pages, set preferReader when default extraction is insufficient.",
		],
	},
	{
		name: "get_search_content",
		label: "Get Search Content",
		description: "Retrieve stored web_search or fetch_content results by responseId. Readonly.",
		module: "web",
		safety: "readonly",
		promptSnippet: 'get_search_content({ responseId: "..." })',
		promptGuidelines: [
			"Use after web_search/fetch_content when responseId is already available.",
			"Use queryIndex or urlIndex selectors to target large stored results.",
			"Prefer this over re-fetching the same content to reduce duplicate network calls.",
		],
	},
	{
		name: "convert_content",
		label: "Convert Content",
		description:
			"Convert local files or safely downloaded remote files to Markdown using the configured optional provider.",
		module: "convert",
		safety: "external-command",
		promptSnippet: 'convert_content({ path: "docs/spec.pdf" })',
		promptGuidelines: [
			"Use path for workspace files and url for remote HTTP(S) files.",
			"Provide either path or url, never both in the same call.",
			"Use for complex document formats before attempting manual parsing.",
		],
	},
	{
		name: "lsp",
		label: "LSP",
		description: `Query language server for definitions, references, types, symbols, diagnostics, rename, and code actions.

Actions: definition, references, hover, signature, rename (require file + line/column or query), symbols (file, optional query), diagnostics (file), workspace-diagnostics (files array), codeAction (file + position), restart (restart LSP servers; optional server="clangd"|...|"all"), servers (list server ids).
Use read/grep/find/ls to locate files before calling lsp.`,
		module: "lsp",
		safety: "mutating",
		promptSnippet: 'lsp({ action: "definition", file: "src/index.ts", line: 1, column: 1 })',
		promptGuidelines: [
			"Use read/grep/find/ls first to locate symbols and files before LSP calls.",
			"Prefer readonly actions for analysis: definition/references/hover/signature/symbols/diagnostics.",
			"Mutating actions require explicit permission and are blocked in subagent processes.",
		],
	},
] as const;

const TOOL_METADATA_BY_NAME: Record<DevkitToolMetadata["name"], DevkitToolMetadata> = {
	subagent: DEVKIT_TOOL_MANIFEST[0],
	web_search: DEVKIT_TOOL_MANIFEST[1],
	fetch_content: DEVKIT_TOOL_MANIFEST[2],
	get_search_content: DEVKIT_TOOL_MANIFEST[3],
	convert_content: DEVKIT_TOOL_MANIFEST[4],
	lsp: DEVKIT_TOOL_MANIFEST[5],
};

export function getDevkitToolMetadata(name: DevkitToolMetadata["name"]): DevkitToolMetadata {
	return TOOL_METADATA_BY_NAME[name];
}
