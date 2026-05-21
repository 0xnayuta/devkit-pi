/**
 * /subagents list - List available agents
 */

import { discoverAgents } from "../agents.ts";

// ============================================================================
// Types
// ============================================================================

export interface AgentListItem {
	name: string;
	description: string;
	readonly: boolean;
	source: "builtin" | "user" | "project";
}

export interface AgentListReport {
	builtin: AgentListItem[];
	user: AgentListItem[];
	project: AgentListItem[];
	total: number;
}

// ============================================================================
// Main Function
// ============================================================================

export function getAgentList(cwd: string): AgentListReport {
	const { agents: allAgents } = discoverAgents(cwd, "both");
	const builtin = allAgents.filter((a) => a.source === "builtin");
	const user = allAgents.filter((a) => a.source === "user");
	const project = allAgents.filter((a) => a.source === "project");

	const toListItem = (a: {
		name: string;
		description: string;
		readonly: boolean;
		source: "builtin" | "user" | "project";
	}): AgentListItem => ({
		name: a.name,
		description: a.description || "(no description)",
		readonly: a.readonly,
		source: a.source,
	});

	return {
		builtin: builtin.map(toListItem),
		user: user.map(toListItem),
		project: project.map(toListItem),
		total: builtin.length + user.length + project.length,
	};
}

// ============================================================================
// Formatter
// ============================================================================

export function formatAgentList(report: AgentListReport): string {
	const lines: string[] = [];

	lines.push(`Available Agents (${report.total})`);
	lines.push("");

	// Builtin agents
	if (report.builtin.length > 0) {
		lines.push("[BUILTIN]");
		for (const agent of report.builtin) {
			const readonlyTag = agent.readonly ? " (readonly)" : " (read/write)";
			lines.push(`  ${agent.name.padEnd(14)} ${truncate(agent.description, 30)}${readonlyTag}`);
		}
	}

	// User agents
	if (report.user.length > 0) {
		lines.push("");
		lines.push("[USER]");
		for (const agent of report.user) {
			const readonlyTag = agent.readonly ? " (readonly)" : " (read/write)";
			lines.push(`  ${agent.name.padEnd(14)} ${truncate(agent.description, 30)}${readonlyTag}`);
		}
	}

	// Project agents
	if (report.project.length > 0) {
		lines.push("");
		lines.push("[PROJECT]");
		for (const agent of report.project) {
			const readonlyTag = agent.readonly ? " (readonly)" : " (read/write)";
			lines.push(`  ${agent.name.padEnd(14)} ${truncate(agent.description, 30)}${readonlyTag}`);
		}
	}

	lines.push("");
	lines.push('Use: subagent({ agent: "explorer", task: "..." })');

	return lines.join("\n");
}

function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return `${text.slice(0, maxLen - 3)}...`;
}

// ============================================================================
// JSON Formatter (for programmatic use)
// ============================================================================

export function formatAgentListJson(report: AgentListReport): string {
	return JSON.stringify(report, null, 2);
}
