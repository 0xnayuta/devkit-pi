/**
 * Agent discovery and definition tests.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";
import {
	AGENT_DISCOVERY_DIAGNOSTIC_CODES,
	discoverAgents,
	type AgentConfig,
	isAgentScope,
	normalizeAgentScope,
} from "../../src/modules/subagents/agents.ts";

const PROJECT_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const BUILTIN_AGENTS = ["explorer", "researcher", "reviewer", "implementer", "tester"];
const LEGACY_AGENTS = ["planner", "worker", "delegate", "oracle", "scout", "context-builder"];
const tempDirs: string[] = [];

function getBuiltinAgents(): AgentConfig[] {
	return discoverAgents(PROJECT_ROOT, "project").agents.filter((a) => a.source === "builtin");
}

function tempAgent(name: string, body: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-mvp-${name}-`));
	tempDirs.push(dir);
	const agentsDir = path.join(dir, ".pi", "agents");
	fs.mkdirSync(agentsDir, { recursive: true });
	fs.writeFileSync(path.join(agentsDir, `${name}.md`), `---\n${body}\n---\n\nAgent body.`, "utf-8");
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("subagent builtin agents", () => {
	it("discovers exactly the current builtin agents", () => {
		const builtin = getBuiltinAgents();
		assert.deepEqual(builtin.map((a) => a.name).sort(), [...BUILTIN_AGENTS].sort());
	});

	it("each builtin agent has required public properties", () => {
		const builtin = getBuiltinAgents();
		for (const name of BUILTIN_AGENTS) {
			const agent = builtin.find((a) => a.name === name);
			assert.ok(agent, `${name} should be discovered`);
			assert.ok(agent.description, `${name} should have a description`);
			assert.equal(agent.readonly, true, `${name} should be readonly`);
			assert.equal(agent.source, "builtin", `${name} should have source='builtin'`);
		}
	});

	it("builtin agents expose only their intended safe tool sets", () => {
		const builtin = getBuiltinAgents();
		const explorer = builtin.find((a) => a.name === "explorer");
		assert.ok(explorer);
		for (const tool of ["read", "grep", "find", "ls", "lsp"]) assert.ok(explorer.tools?.includes(tool));

		const researcher = builtin.find((a) => a.name === "researcher");
		assert.ok(researcher);
		for (const tool of ["web_search", "fetch_content", "get_search_content", "convert_content"]) {
			assert.ok(researcher.tools?.includes(tool), `researcher should include ${tool}`);
		}

		const reviewer = builtin.find((a) => a.name === "reviewer");
		assert.ok(reviewer);
		assert.ok(reviewer.tools?.includes("read"));
		assert.ok(reviewer.tools?.includes("grep"));
		assert.ok(reviewer.tools?.includes("lsp"));

		for (const name of ["implementer", "tester"]) {
			const agent = builtin.find((a) => a.name === name);
			assert.ok(agent);
			assert.equal(agent.tools?.includes("edit"), false, `${name} should not have edit`);
			assert.equal(agent.tools?.includes("write"), false, `${name} should not have write`);
		}
	});

	it("legacy builtin agents are not present", () => {
		const builtin = getBuiltinAgents();
		for (const name of LEGACY_AGENTS) {
			assert.equal(builtin.find((a) => a.name === name), undefined, `${name} should not exist`);
		}
	});
});

describe("subagent agent scope model", () => {
	it("validates and normalizes scope values", () => {
		assert.equal(isAgentScope("user"), true);
		assert.equal(isAgentScope("project"), true);
		assert.equal(isAgentScope("both"), true);
		assert.equal(isAgentScope("all"), false);
		assert.equal(isAgentScope(""), false);
		assert.equal(isAgentScope(undefined), false);

		assert.equal(normalizeAgentScope("user"), "user");
		assert.equal(normalizeAgentScope("project"), "project");
		assert.equal(normalizeAgentScope("both"), "both");
		assert.equal(normalizeAgentScope("all"), "both");
		assert.equal(normalizeAgentScope(undefined, "project"), "project");
	});

	it("applies user/project/both discovery scope semantics", () => {
		const projectDir = tempAgent(
			"scope-project",
			[
				"name: scope-project",
				"description: Project scope agent",
				"readonly: true",
				"tools: read",
			].join("\n"),
		);

		const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mvp-home-scope-"));
		tempDirs.push(homeDir);
		const previousHome = process.env.HOME;
		const previousUserProfile = process.env.USERPROFILE;
		const userAgentsDir = path.join(homeDir, ".pi", "agent", "agents");
		fs.mkdirSync(userAgentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(userAgentsDir, "scope-user.md"),
			`---\nname: scope-user\ndescription: User scope agent\nreadonly: true\ntools: read\n---\n\nUser scope prompt.`,
			"utf-8",
		);

		try {
			process.env.HOME = homeDir;
			process.env.USERPROFILE = homeDir;

			const userOnly = discoverAgents(projectDir, "user").agents;
			assert.ok(userOnly.some((a) => a.name === "scope-user"));
			assert.equal(userOnly.some((a) => a.name === "scope-project"), false);

			const projectOnly = discoverAgents(projectDir, "project").agents;
			assert.ok(projectOnly.some((a) => a.name === "scope-project"));
			assert.equal(projectOnly.some((a) => a.name === "scope-user"), false);

			const both = discoverAgents(projectDir, "both").agents;
			assert.ok(both.some((a) => a.name === "scope-user"));
			assert.ok(both.some((a) => a.name === "scope-project"));
		} finally {
			if (previousHome === undefined) delete process.env.HOME;
			else process.env.HOME = previousHome;
			if (previousUserProfile === undefined) delete process.env.USERPROFILE;
			else process.env.USERPROFILE = previousUserProfile;
		}
	});
});

describe("subagent frontmatter diagnostics", () => {
	it("returns structured diagnostics for invalid frontmatter matrix", () => {
		const dirMissingName = tempAgent(
			"invalid-missing-name",
			["description: Missing name", "readonly: true", "tools: read"].join("\n"),
		);
		const dirInvalidReadonly = tempAgent(
			"invalid-readonly",
			[
				"name: invalid-readonly",
				"description: bad readonly",
				"readonly: maybe",
				"tools: read",
			].join("\n"),
		);
		const dirInvalidTools = tempAgent(
			"invalid-tools",
			[
				"name: invalid-tools",
				"description: bad tools",
				"readonly: true",
				"tools: , ,",
			].join("\n"),
		);

		const r1 = discoverAgents(dirMissingName, "project");
		assert.equal(r1.agents.some((a) => a.name === "invalid-missing-name"), false);
		assert.ok(
			r1.diagnostics.some(
				(d) => d.code === AGENT_DISCOVERY_DIAGNOSTIC_CODES.FRONTMATTER_NAME_MISSING,
			),
		);

		const r2 = discoverAgents(dirInvalidReadonly, "project");
		assert.equal(r2.agents.some((a) => a.name === "invalid-readonly"), false);
		assert.ok(
			r2.diagnostics.some(
				(d) => d.code === AGENT_DISCOVERY_DIAGNOSTIC_CODES.FRONTMATTER_READONLY_INVALID,
			),
		);

		const r3 = discoverAgents(dirInvalidTools, "project");
		assert.equal(r3.agents.some((a) => a.name === "invalid-tools"), false);
		assert.ok(
			r3.diagnostics.some(
				(d) => d.code === AGENT_DISCOVERY_DIAGNOSTIC_CODES.FRONTMATTER_TOOLS_INVALID,
			),
		);
	});
});

describe("subagent project and user agent discovery", () => {
	it("parses simple frontmatter for project agents", () => {
		const dir = tempAgent(
			"custom",
			["name: custom-reviewer", "description: Project-specific reviewer", "readonly: true", "tools: read, grep, find, ls"].join("\n"),
		);

		const result = discoverAgents(dir, "project");
		const agent = result.agents.find((a) => a.name === "custom-reviewer");
		assert.ok(agent);
		assert.equal(agent.description, "Project-specific reviewer");
		assert.equal(agent.readonly, true);
		for (const tool of ["read", "grep", "find", "ls"]) assert.ok(agent.tools?.includes(tool));
		assert.ok(agent.systemPrompt?.includes("Agent body"));
		assert.equal(agent.source, "project");
	});

	it("does not restore removed frontmatter features", () => {
		const pkgDir = tempAgent("pkg-agent", "name: pkg-agent\npackage: code-analysis\ndescription: Fast recon");
		assert.equal(discoverAgents(pkgDir, "project").agents.find((a) => a.name === "code-analysis.pkg-agent"), undefined);

		const skillDir = tempAgent("skill-agent", "name: skill-agent\ndescription: Worker\ninheritSkills: true");
		assert.equal((discoverAgents(skillDir, "project").agents.find((a) => a.name === "skill-agent") as any)?.inheritSkills, undefined);

		const ctxDir = tempAgent("ctx-agent", "name: ctx-agent\ndescription: Delegate\ndefaultContext: fork");
		assert.equal((discoverAgents(ctxDir, "project").agents.find((a) => a.name === "ctx-agent") as any)?.defaultContext, undefined);
	});

	it("discovers user agents from ~/.pi/agent/agents", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mvp-user-agent-"));
		tempDirs.push(dir);
		const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mvp-home-"));
		tempDirs.push(homeDir);
		const previousHome = process.env.HOME;
		const previousUserProfile = process.env.USERPROFILE;
		const userAgentsDir = path.join(homeDir, ".pi", "agent", "agents");
		fs.mkdirSync(userAgentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(userAgentsDir, "my-agent.md"),
			`---\nname: my-agent\ndescription: My custom agent\nreadonly: true\ntools: read, grep\n---\n\nMy agent prompt.`,
			"utf-8",
		);
		try {
			process.env.HOME = homeDir;
			process.env.USERPROFILE = homeDir;
			const result = discoverAgents(dir, "user");
			const agent = result.agents.find((a) => a.name === "my-agent");
			assert.ok(agent, "my-agent should be discovered from user agents");
			assert.equal(agent.source, "user");
		} finally {
			if (previousHome === undefined) delete process.env.HOME;
			else process.env.HOME = previousHome;
			if (previousUserProfile === undefined) delete process.env.USERPROFILE;
			else process.env.USERPROFILE = previousUserProfile;
		}
	});
});
