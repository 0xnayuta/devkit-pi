/**
 * Agent discovery for devkit-pi
 * Only supports: builtin agents in agents/ directory
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./frontmatter.ts";

export const AGENT_SCOPES = ["user", "project", "both"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];
export type AgentSource = "builtin" | "user" | "project";

export function isAgentScope(value: unknown): value is AgentScope {
	return typeof value === "string" && AGENT_SCOPES.includes(value as AgentScope);
}

export function normalizeAgentScope(value: unknown, fallback: AgentScope = "both"): AgentScope {
	return isAgentScope(value) ? value : fallback;
}

export interface AgentConfig {
	name: string;
	description: string;
	readonly: boolean;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: AgentSource;
	filePath: string;
}

export const AGENT_DISCOVERY_DIAGNOSTIC_CODES = {
	FRONTMATTER_NAME_MISSING: "FRONTMATTER_NAME_MISSING",
	FRONTMATTER_READONLY_INVALID: "FRONTMATTER_READONLY_INVALID",
	FRONTMATTER_TOOLS_INVALID: "FRONTMATTER_TOOLS_INVALID",
	AGENT_FILE_READ_FAILED: "AGENT_FILE_READ_FAILED",
} as const;

export type AgentDiscoveryDiagnosticCode =
	(typeof AGENT_DISCOVERY_DIAGNOSTIC_CODES)[keyof typeof AGENT_DISCOVERY_DIAGNOSTIC_CODES];

export interface AgentDiscoveryDiagnostic {
	code: AgentDiscoveryDiagnosticCode;
	message: string;
	filePath: string;
	source: AgentSource;
}

// Get the project root directory - use provided cwd as primary source
function getProjectRoot(cwd: string): string {
	// Try to find agents directory in cwd or its parents
	let currentDir = cwd;
	while (currentDir !== path.dirname(currentDir)) {
		const agentsDir = path.join(currentDir, "agents");
		if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
			return currentDir;
		}
		currentDir = path.dirname(currentDir);
	}

	// Fallback to import.meta.url based calculation
	try {
		const urlStr = import.meta.url;
		if (urlStr) {
			// Convert file URL to proper Windows path
			const filePath = fileURLToPath(urlStr);
			// Get directory containing this file
			const dir = path.dirname(filePath);
			// Navigate up: src/modules/subagents -> src/modules -> src -> project root
			const root = path.dirname(path.dirname(path.dirname(dir)));
			// Verify this looks like a project root (has agents directory)
			if (fs.existsSync(path.join(root, "agents"))) {
				return root;
			}
		}
	} catch {
		// Fall through to cwd
	}

	// Final fallback to cwd
	return cwd;
}

function getBuiltinAgentsDir(cwd: string): string {
	return path.join(getProjectRoot(cwd), "agents");
}

function getUserAgentsDir(): string {
	return path.join(os.homedir(), ".pi", "agent", "agents");
}

function getProjectAgentsDir(cwd: string): string | null {
	// Look for .pi/agents or .agents in parent directories
	let currentDir = cwd;
	while (currentDir !== path.dirname(currentDir)) {
		const piAgents = path.join(currentDir, ".pi", "agents");
		if (fs.existsSync(piAgents) && fs.statSync(piAgents).isDirectory()) {
			return piAgents;
		}
		const agentsDir = path.join(currentDir, ".agents");
		if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
			return agentsDir;
		}
		currentDir = path.dirname(currentDir);
	}
	return null;
}

function isMarkdownFile(filePath: string): boolean {
	return filePath.endsWith(".md") || filePath.endsWith(".markdown");
}

function loadAgentFromFile(
	filePath: string,
	source: AgentSource
): { agent: AgentConfig | null; diagnostics: AgentDiscoveryDiagnostic[] } {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter(content);
		const diagnostics: AgentDiscoveryDiagnostic[] = [];

		const name = frontmatter.name?.trim();
		if (!name) {
			diagnostics.push({
				code: AGENT_DISCOVERY_DIAGNOSTIC_CODES.FRONTMATTER_NAME_MISSING,
				message: "Agent frontmatter requires a non-empty 'name' field.",
				filePath,
				source,
			});
			return { agent: null, diagnostics };
		}

		const readonlyRaw = frontmatter.readonly;
		const readonlyValid =
			readonlyRaw === undefined ||
			readonlyRaw === "true" ||
			readonlyRaw === "false" ||
			readonlyRaw === "1" ||
			readonlyRaw === "0";
		if (!readonlyValid) {
			diagnostics.push({
				code: AGENT_DISCOVERY_DIAGNOSTIC_CODES.FRONTMATTER_READONLY_INVALID,
				message: "Agent frontmatter 'readonly' must be one of: true, false, 1, 0.",
				filePath,
				source,
			});
			return { agent: null, diagnostics };
		}

		// Parse tools from comma-separated string
		let tools: string[] | undefined;
		if (frontmatter.tools) {
			tools = frontmatter.tools
				.split(",")
				.map((t) => t.trim())
				.filter((t) => t.length > 0);
			if (tools.length === 0) {
				diagnostics.push({
					code: AGENT_DISCOVERY_DIAGNOSTIC_CODES.FRONTMATTER_TOOLS_INVALID,
					message: "Agent frontmatter 'tools' must include at least one non-empty tool name.",
					filePath,
					source,
				});
				return { agent: null, diagnostics };
			}
		}

		return {
			agent: {
				name,
				description: frontmatter.description ?? "",
				readonly: frontmatter.readonly === "true" || frontmatter.readonly === "1",
				tools,
				model: frontmatter.model,
				systemPrompt: body || frontmatter.description || "",
				source,
				filePath,
			},
			diagnostics,
		};
	} catch (error) {
		return {
			agent: null,
			diagnostics: [
				{
					code: AGENT_DISCOVERY_DIAGNOSTIC_CODES.AGENT_FILE_READ_FAILED,
					message: `Failed to read or parse agent file: ${error instanceof Error ? error.message : String(error)}`,
					filePath,
					source,
				},
			],
		};
	}
}

function discoverAgentsInDir(
	dir: string,
	source: AgentSource
): { agents: AgentConfig[]; diagnostics: AgentDiscoveryDiagnostic[] } {
	if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
		return { agents: [], diagnostics: [] };
	}

	const agents: AgentConfig[] = [];
	const diagnostics: AgentDiscoveryDiagnostic[] = [];
	const files = fs.readdirSync(dir);

	for (const file of files) {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);

		if (stat.isFile() && isMarkdownFile(file)) {
			const loaded = loadAgentFromFile(filePath, source);
			diagnostics.push(...loaded.diagnostics);
			if (loaded.agent) {
				agents.push(loaded.agent);
			}
		}
	}

	return { agents, diagnostics };
}

/**
 * Discover all agents
 */
export function discoverAgents(
	cwd: string,
	scope: AgentScope
): {
	agents: AgentConfig[];
	diagnostics: AgentDiscoveryDiagnostic[];
} {
	const agents: AgentConfig[] = [];
	const diagnostics: AgentDiscoveryDiagnostic[] = [];

	// Always load builtin agents
	const builtinDir = getBuiltinAgentsDir(cwd);
	const builtin = discoverAgentsInDir(builtinDir, "builtin");
	agents.push(...builtin.agents);
	diagnostics.push(...builtin.diagnostics);

	// Load user agents if scope allows
	if (scope === "user" || scope === "both") {
		const userDir = getUserAgentsDir();
		const user = discoverAgentsInDir(userDir, "user");
		agents.push(...user.agents);
		diagnostics.push(...user.diagnostics);
	}

	// Load project agents if scope allows
	if (scope === "project" || scope === "both") {
		const projectDir = getProjectAgentsDir(cwd);
		if (projectDir) {
			const project = discoverAgentsInDir(projectDir, "project");
			agents.push(...project.agents);
			diagnostics.push(...project.diagnostics);
		}
	}

	// Deduplicate by name (project > user > builtin)
	const byName = new Map<string, AgentConfig>();
	for (const agent of agents) {
		const existing = byName.get(agent.name);
		if (!existing || getSourcePriority(agent.source) > getSourcePriority(existing.source)) {
			byName.set(agent.name, agent);
		}
	}

	return { agents: [...byName.values()], diagnostics };
}

function getSourcePriority(source: AgentSource): number {
	switch (source) {
		case "builtin":
			return 0;
		case "user":
			return 1;
		case "project":
			return 2;
	}
}

/**
 * Get agent by name
 */
export function getAgentByName(agents: AgentConfig[], name: string): AgentConfig | undefined {
	return agents.find((a) => a.name === name);
}
