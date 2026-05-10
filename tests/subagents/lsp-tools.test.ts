import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import type { AgentConfig } from "../../src/modules/subagents/agents.ts";
import { filterToolsForReadonly } from "../../src/modules/subagents/executor.ts";

const agent: AgentConfig = {
  name: "explorer",
  description: "test",
  readonly: true,
  tools: ["read", "grep", "find", "ls", "lsp", "edit", "write"],
  systemPrompt: "test",
  source: "builtin",
  filePath: "agents/explorer.md",
};

describe("subagent LSP tools", () => {
  it("allows lsp for readonly agents by default", () => {
    const tools = filterToolsForReadonly(agent, mergeConfig({}).subagents);
    assert.ok(tools.includes("lsp"));
    assert.equal(tools.includes("edit"), false);
    assert.equal(tools.includes("write"), false);
  });

  it("removes lsp when subagents.allowLspTools is false", () => {
    const tools = filterToolsForReadonly(
      agent,
      mergeConfig({ subagents: { allowLspTools: false } }).subagents
    );
    assert.equal(tools.includes("lsp"), false);
  });

  it("removes lsp when no readonly LSP actions are allowed", () => {
    const tools = filterToolsForReadonly(
      agent,
      mergeConfig({ subagents: { allowedLspActions: ["rename" as any] } }).subagents
    );
    assert.equal(tools.includes("lsp"), false);
  });
});
