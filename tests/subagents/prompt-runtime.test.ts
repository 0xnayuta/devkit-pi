import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import registerSubagentPromptRuntime, {
	CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS,
	buildChildPrompt,
	rewriteSubagentPrompt,
	stripInheritedSkills,
	stripParentOnlySubagentMessages,
	stripProjectContext,
	stripSubagentOrchestrationSkill,
} from "../../src/modules/subagents/prompt-runtime.ts";

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

afterEach(() => {
	if (envSnapshot.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT === undefined) delete process.env.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT;
	else process.env.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT = envSnapshot.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT;
	if (envSnapshot.PI_SUBAGENT_INHERIT_SKILLS === undefined) delete process.env.PI_SUBAGENT_INHERIT_SKILLS;
	else process.env.PI_SUBAGENT_INHERIT_SKILLS = envSnapshot.PI_SUBAGENT_INHERIT_SKILLS;
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

	it("strips both sections together and injects child boundary", () => {
		const rewritten = rewriteSubagentPrompt(BASE_PROMPT, {
			inheritProjectContext: false,
			inheritSkills: false,
		});
		assert.ok(!rewritten.includes("# Project Context"));
		assert.ok(!rewritten.includes("<available_skills>"));
		assert.ok(rewritten.includes("Current working directory: /repo"));
		assert.ok(rewritten.startsWith(CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS));
		assert.ok(rewritten.includes("Do not propose or run subagents."));
	});

	it("keeps explicit skills, strips devkit-pi orchestration skill", () => {
		const rewritten = rewriteSubagentPrompt(PROMPT_WITH_EXPLICIT_SKILL, {
			inheritProjectContext: false,
			inheritSkills: false,
		});
		assert.ok(rewritten.includes('<skill name="explicit">'));
		assert.ok(!rewritten.includes("<available_skills>"));

		const withSkills = rewriteSubagentPrompt(BASE_PROMPT, {
			inheritProjectContext: true,
			inheritSkills: true,
		});
		assert.ok(withSkills.includes("<name>safe-bash</name>"));
		assert.ok(!withSkills.includes("<name>devkit-pi</name>"));
	});

	it("strips parent-only messages from forked context", () => {
		const user = { role: "user", content: "Task" };
		const instruction = { role: "custom", customType: "subagent-orchestration-instructions", content: "enabled" };
		const otherCustom = { role: "custom", customType: "other", content: "keep" };

		assert.deepEqual(stripParentOnlySubagentMessages([user, instruction, otherCustom]), [user, otherCustom]);

		// Also strips subagent tool calls/results
		const readResult = { role: "toolResult", toolName: "read", content: "file" };
		const subagentResult = { role: "toolResult", toolName: "subagent", content: "results" };
		const mixedAssistant = { role: "assistant", content: [{ type: "toolCall", name: "subagent", input: {} }, { type: "toolCall", name: "read", input: {} }] };

		const filtered = stripParentOnlySubagentMessages([user, subagentResult, readResult, mixedAssistant]);
		assert.deepEqual(filtered, [user, readResult, { role: "assistant", content: [{ type: "toolCall", name: "read", input: {} }] }]);
	});

	it("rewrites prompt via before_agent_start hook", async () => {
		let beforeAgentStart: ((event: { systemPrompt: string }) => Promise<{ systemPrompt: string } | undefined>) | undefined;
		registerSubagentPromptRuntime({
			on(event: string, handler: (payload: { systemPrompt: string }) => Promise<{ systemPrompt: string } | undefined>) {
				if (event === "before_agent_start") beforeAgentStart = handler;
			},
		} as { on(event: string, handler: (payload: { systemPrompt: string }) => Promise<{ systemPrompt: string } | undefined>): void });

		assert.ok(beforeAgentStart);
		process.env.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT = "0";
		process.env.PI_SUBAGENT_INHERIT_SKILLS = "0";

		const rewritten = await beforeAgentStart?.({ systemPrompt: BASE_PROMPT });
		assert.ok(rewritten);
		assert.ok(!rewritten.systemPrompt.includes("# Project Context"));
		assert.ok(!rewritten.systemPrompt.includes("<available_skills>"));
	});

	it("filters context artifacts, passes through clean history", () => {
		let contextHandler: ((event: { messages: unknown[] }) => { messages: unknown[] } | undefined) | undefined;
		registerSubagentPromptRuntime({
			on(event: string, handler: (payload: { messages: unknown[] }) => { messages: unknown[] } | undefined) {
				if (event === "context") contextHandler = handler;
			},
		} as { on(event: string, handler: (payload: { messages: unknown[] }) => { messages: unknown[] } | undefined): void });

		const msg = { role: "user", content: "Task" };
		const instruction = { role: "custom", customType: "subagent-orchestration-instructions", content: "enabled" };
		assert.deepEqual(contextHandler?.({ messages: [msg, instruction] }), { messages: [msg] });

		// clean history passes through
		const clean = [{ role: "user", content: "Task" }, { role: "toolResult", toolName: "read", content: "file" }];
		assert.equal(contextHandler?.({ messages: clean }), undefined);
	});
});
