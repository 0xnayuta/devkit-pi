/**
 * Agent discovery and definition tests.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";
import { discoverAgents, type AgentConfig } from "../../src/modules/subagents/agents.ts";

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
		assert.ok(researcher.tools?.includes("web_search"));

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
