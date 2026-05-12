import assert from "node:assert/strict";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mergeConfig } from "../../src/config/load-config.ts";
import type { AgentConfig } from "../../src/modules/subagents/agents.ts";
import { collectOutput, extractFinalOutput, extractProviderError, extractUsage, parseJsonLines } from "../../src/modules/subagents/collect-output.ts";
import { filterToolsForReadonly } from "../../src/modules/subagents/executor.ts";
import { getPiSpawnCommand, resolveWindowsPiCliScript, type PiSpawnDeps } from "../../src/modules/subagents/pi-spawn.ts";
import registerSubagentPromptRuntime, {
	CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS,
	buildChildPrompt,
	rewriteSubagentPrompt,
	stripInheritedSkills,
	stripParentOnlySubagentMessages,
	stripProjectContext,
} from "../../src/modules/subagents/prompt-runtime.ts";

function line(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}

const envSnapshot = {
	PI_SUBAGENT_INHERIT_PROJECT_CONTEXT: process.env.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT,
	PI_SUBAGENT_INHERIT_SKILLS: process.env.PI_SUBAGENT_INHERIT_SKILLS,
};

const SKILLS_SECTION = "\n\nThe following skills provide specialized instructions for specific tasks.\nUse the read tool to load a skill's file when the task matches its description.\nWhen a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.\n\n<available_skills>\n  <skill>\n    <name>safe-bash</name>\n    <description>desc</description>\n    <location>/tmp/SKILL.md</location>\n  </skill>\n  <skill>\n    <name>devkit-pi</name>\n    <description>delegate to subagents</description>\n    <location>/tmp/devkit-pi/SKILL.md</location>\n  </skill>\n</available_skills>";

const BASE_PROMPT = [
	"You are a subagent.",
	"\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n## /repo/AGENTS.md\n\nProject rules\n\n",
	SKILLS_SECTION,
	"\nCurrent date: 2026-04-16",
	"\nCurrent working directory: /repo",
].join("");

const PROMPT_WITH_EXPLICIT_SKILL = [
	"You are a subagent.\n\n<skill name=\"explicit\">\nKeep this section\n</skill>",
	"\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n## /repo/AGENTS.md\n\nProject rules\n\n",
	SKILLS_SECTION,
	"\nCurrent date: 2026-04-16",
].join("");

function makeDeps(input: {
	platform?: NodeJS.Platform;
	execPath?: string;
	argv1?: string;
	existing?: string[];
	packageJsonPath?: string;
	packageJsonContent?: string;
}): PiSpawnDeps {
	const existing = new Set(input.existing ?? []);
	const packageJsonPath = input.packageJsonPath;
	const packageJsonContent = input.packageJsonContent;
	return {
		platform: input.platform,
		execPath: input.execPath,
		argv1: input.argv1,
		existsSync: (filePath) => existing.has(filePath),
		readFileSync: (_filePath, _encoding) => {
			if (!packageJsonPath || !packageJsonContent) {
				throw new Error("package json not configured");
			}
			return packageJsonContent;
		},
		resolvePackageJson: () => {
			if (!packageJsonPath) throw new Error("package json path missing");
			return packageJsonPath;
		},
	};
}

afterEach(() => {
	if (envSnapshot.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT === undefined) delete process.env.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT;
	else process.env.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT = envSnapshot.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT;
	if (envSnapshot.PI_SUBAGENT_INHERIT_SKILLS === undefined) delete process.env.PI_SUBAGENT_INHERIT_SKILLS;
	else process.env.PI_SUBAGENT_INHERIT_SKILLS = envSnapshot.PI_SUBAGENT_INHERIT_SKILLS;
});

describe("subagent runtime output collection", () => {
	it("extracts final assistant text and usage from turn_end JSONL events", () => {
		const raw = [
			line({ type: "session", id: "abc" }),
			line({ type: "tool_execution_end", toolName: "grep" }),
			line({
				type: "turn_end",
				message: {
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "hidden" },
						{ type: "text", text: "## Findings\n- src/modules/subagents/sanitize.ts" },
					],
					usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, cost: { total: 0.123 } },
				},
			}),
		].join("");

		const result = collectOutput(raw);
		assert.equal(result.output, "## Findings\n- src/modules/subagents/sanitize.ts");
		assert.deepEqual(result.usage, { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, cost: 0.123, turns: 1 });
	});

	it("falls back to result.output for legacy/mock messages", () => {
		const messages = parseJsonLines(line({ type: "result", output: "legacy result" }));
		assert.equal(extractFinalOutput(messages), "legacy result");
	});

	it("returns a diagnostic instead of raw JSONL when no final text exists", () => {
		const raw = [
			line({ type: "session", id: "abc" }),
			line({ type: "turn_end", message: { role: "assistant", content: [{ type: "toolCall", name: "grep" }], stopReason: "toolUse" } }),
		].join("");

		const result = collectOutput(raw);
		assert.match(result.output, /no final assistant text/i);
		assert.match(result.output, /toolUse/);
		assert.ok(!result.output.includes('"type":"session"'));
	});

	it("extracts provider errors and preserves partial assistant output", () => {
		const raw = [
			line({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Let me check the docs first." }], stopReason: "toolUse" } }),
			line({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "Error Code internal_server_error: stream error: INTERNAL_ERROR" }] } }),
		].join("");

		const messages = parseJsonLines(raw);
		assert.equal(extractProviderError(messages), "Error Code internal_server_error: stream error: INTERNAL_ERROR");

		const result = collectOutput(raw);
		assert.equal(result.final, false);
		assert.equal(result.error, "Error Code internal_server_error: stream error: INTERNAL_ERROR");
		assert.equal(result.partialOutput, "Let me check the docs first.");
	});

	it("preserves non-JSON output", () => {
		const result = collectOutput("plain text output\n");
		assert.equal(result.output, "plain text output");
		assert.equal(result.final, true);
	});

	it("extracts usage from the last usage-bearing message", () => {
		const messages = parseJsonLines(
			[
				line({ type: "message_end", message: { role: "assistant", usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cost: 5 } } }),
				line({ type: "turn_end", message: { role: "assistant", usage: { input: 6, output: 7, cacheRead: 8, cacheWrite: 9, cost: { total: 10 } } } }),
			].join(""),
		);

		assert.deepEqual(extractUsage(messages), { input: 6, output: 7, cacheRead: 8, cacheWrite: 9, cost: 10, turns: 1 });
	});
});

describe("subagent prompt runtime", () => {
	it("buildChildPrompt creates child agent prompt", () => {
		const prompt = buildChildPrompt({
			agentName: "explorer",
			agentSystemPrompt: "You are a delegated code explorer subagent.",
			agentTools: ["read", "grep"],
			task: "Find authentication code",
			childDepth: 1,
			maxDepth: 1,
			isReadonly: true,
		});

		assert.ok(prompt.startsWith(CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS));
		assert.ok(prompt.includes("# Agent: explorer"));
		assert.ok(prompt.includes("You are readonly"));
	});

	it("strips project context and inherited skills separately", () => {
		const withoutProject = stripProjectContext(BASE_PROMPT);
		assert.ok(!withoutProject.includes("# Project Context"));
		assert.ok(withoutProject.includes("The following skills"));

		const withoutSkills = stripInheritedSkills(BASE_PROMPT);
		assert.ok(withoutSkills.includes("# Project Context"));
		assert.ok(!withoutSkills.includes("<available_skills>"));
	});

	it("strips inherited sections and injects child boundary", () => {
		const rewritten = rewriteSubagentPrompt(BASE_PROMPT, { inheritProjectContext: false, inheritSkills: false });
		assert.ok(!rewritten.includes("# Project Context"));
		assert.ok(!rewritten.includes("<available_skills>"));
		assert.ok(rewritten.includes("Current working directory: /repo"));
		assert.ok(rewritten.startsWith(CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS));
		assert.ok(rewritten.includes("Do not propose or run subagents."));
	});

	it("keeps explicit skills and strips devkit-pi orchestration skill", () => {
		const rewritten = rewriteSubagentPrompt(PROMPT_WITH_EXPLICIT_SKILL, { inheritProjectContext: false, inheritSkills: false });
		assert.ok(rewritten.includes('<skill name="explicit">'));
		assert.ok(!rewritten.includes("<available_skills>"));

		const withSkills = rewriteSubagentPrompt(BASE_PROMPT, { inheritProjectContext: true, inheritSkills: true });
		assert.ok(withSkills.includes("<name>safe-bash</name>"));
		assert.ok(!withSkills.includes("<name>devkit-pi</name>"));
	});

	it("strips parent-only messages from forked context", () => {
		const user = { role: "user", content: "Task" };
		const instruction = { role: "custom", customType: "subagent-orchestration-instructions", content: "enabled" };
		const otherCustom = { role: "custom", customType: "other", content: "keep" };

		assert.deepEqual(stripParentOnlySubagentMessages([user, instruction, otherCustom]), [user, otherCustom]);

		const readResult = { role: "toolResult", toolName: "read", content: "file" };
		const subagentResult = { role: "toolResult", toolName: "subagent", content: "results" };
		const mixedAssistant = { role: "assistant", content: [{ type: "toolCall", name: "subagent", input: {} }, { type: "toolCall", name: "read", input: {} }] };

		const filtered = stripParentOnlySubagentMessages([user, subagentResult, readResult, mixedAssistant]);
		assert.deepEqual(filtered, [user, readResult, { role: "assistant", content: [{ type: "toolCall", name: "read", input: {} }] }]);
	});

	it("rewrites prompt and filters context via runtime hooks", async () => {
		let beforeAgentStart: ((event: { systemPrompt: string }) => Promise<{ systemPrompt: string } | undefined>) | undefined;
		let contextHandler: ((event: { messages: unknown[] }) => { messages: unknown[] } | undefined) | undefined;
		registerSubagentPromptRuntime({
			on(event: string, handler: unknown) {
				if (event === "before_agent_start") beforeAgentStart = handler as typeof beforeAgentStart;
				if (event === "context") contextHandler = handler as typeof contextHandler;
			},
		} as unknown as ExtensionAPI);

		assert.ok(beforeAgentStart);
		process.env.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT = "0";
		process.env.PI_SUBAGENT_INHERIT_SKILLS = "0";

		const rewritten = await beforeAgentStart?.({ systemPrompt: BASE_PROMPT });
		assert.ok(rewritten);
		assert.ok(!rewritten.systemPrompt.includes("# Project Context"));
		assert.ok(!rewritten.systemPrompt.includes("<available_skills>"));

		const msg = { role: "user", content: "Task" };
		const instruction = { role: "custom", customType: "subagent-orchestration-instructions", content: "enabled" };
		assert.deepEqual(contextHandler?.({ messages: [msg, instruction] }), { messages: [msg] });

		const clean = [{ role: "user", content: "Task" }, { role: "toolResult", toolName: "read", content: "file" }];
		assert.equal(contextHandler?.({ messages: clean }), undefined);
	});
});

describe("subagent spawn command", () => {
	it("uses plain pi on non-Windows", () => {
		const args = ["--mode", "json", "Task: check output"];
		assert.deepEqual(getPiSpawnCommand(args, { platform: "darwin" }), { command: "pi", args });
	});

	it("uses node + argv1 script on Windows when argv1 is runnable JS", () => {
		const argv1 = "/tmp/pi-entry.mjs";
		const deps = makeDeps({ platform: "win32", execPath: "/usr/local/bin/node", argv1, existing: [argv1] });
		const args = ["--mode", "json", 'Task: Read C:/dev/file.md and review "quotes" & pipes | too'];
		const result = getPiSpawnCommand(args, deps);
		assert.equal(result.command, "/usr/local/bin/node");
		assert.equal(result.args[0], argv1);
		assert.equal(result.args[3], args[2]);
	});

	it("resolves Windows CLI script from package bin and piPackageRoot", () => {
		const packageJsonPath = "/opt/pi/package.json";
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.js");
		const deps = makeDeps({
			platform: "win32",
			execPath: "/usr/local/bin/node",
			argv1: "/opt/pi/subagent-runner.ts",
			packageJsonPath,
			packageJsonContent: JSON.stringify({ bin: { pi: "dist/cli/index.js" } }),
			existing: [packageJsonPath, cliPath],
		});
		deps.piPackageRoot = "/opt/pi";

		const result = getPiSpawnCommand(["-p", "Task: hello"], deps);
		assert.equal(result.command, "/usr/local/bin/node");
		assert.equal(result.args[0], cliPath);
	});

	it("falls back to pi when Windows CLI script cannot be resolved", () => {
		const args = ["-p", "Task: hello"];
		const result = getPiSpawnCommand(args, makeDeps({ platform: "win32", argv1: "/opt/pi/subagent-runner.ts", existing: [] }));
		assert.deepEqual(result, { command: "pi", args });
	});

	it("supports package bin as string", () => {
		const packageJsonPath = "/opt/pi/package.json";
		const cliPath = path.resolve(path.dirname(packageJsonPath), "dist/cli/index.mjs");
		const deps = makeDeps({
			platform: "win32",
			argv1: "/opt/pi/subagent-runner.ts",
			packageJsonPath,
			packageJsonContent: JSON.stringify({ bin: "dist/cli/index.mjs" }),
			existing: [packageJsonPath, cliPath],
		});
		assert.equal(resolveWindowsPiCliScript(deps), cliPath);
	});
});

describe("subagent readonly tool policy", () => {
	const agent: AgentConfig = {
		name: "explorer",
		description: "test",
		readonly: true,
		tools: ["read", "grep", "find", "ls", "lsp", "edit", "write"],
		systemPrompt: "test",
		source: "builtin",
		filePath: "agents/explorer.md",
	};

	it("allows lsp for readonly agents by default while removing write tools", () => {
		const tools = filterToolsForReadonly(agent, mergeConfig({}).subagents);
		assert.ok(tools.includes("lsp"));
		assert.equal(tools.includes("edit"), false);
		assert.equal(tools.includes("write"), false);
	});

	it("removes lsp when disabled or no readonly LSP actions are allowed", () => {
		assert.equal(filterToolsForReadonly(agent, mergeConfig({ subagents: { allowLspTools: false } }).subagents).includes("lsp"), false);
		assert.equal(filterToolsForReadonly(agent, mergeConfig({ subagents: { allowedLspActions: ["rename" as any] } }).subagents).includes("lsp"), false);
	});
});
