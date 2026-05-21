/**
 * Agent discovery for devkit-pi
 * Only supports: builtin agents in agents/ directory
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./frontmatter.ts";

export type AgentScope = "user" | "project" | "both";
export type AgentSource = "builtin" | "user" | "project";

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

function loadAgentFromFile(filePath: string, source: AgentSource): AgentConfig | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);

    if (!frontmatter.name) {
      return null;
    }

    // Parse tools from comma-separated string
    let tools: string[] | undefined;
    if (frontmatter.tools) {
      tools = frontmatter.tools
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }

    return {
      name: frontmatter.name,
      description: frontmatter.description ?? "",
      readonly: frontmatter.readonly === "true" || frontmatter.readonly === "1",
      tools,
      model: frontmatter.model,
      systemPrompt: body || frontmatter.description || "",
      source,
      filePath,
    };
  } catch {
    return null;
  }
}

function discoverAgentsInDir(dir: string, source: AgentSource): AgentConfig[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return [];
  }

  const agents: AgentConfig[] = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isFile() && isMarkdownFile(file)) {
      const agent = loadAgentFromFile(filePath, source);
      if (agent) {
        agents.push(agent);
      }
    }
  }

  return agents;
}

/**
 * Discover all agents
 */
export function discoverAgents(cwd: string, scope: AgentScope): { agents: AgentConfig[] } {
  const agents: AgentConfig[] = [];

  // Always load builtin agents
  const builtinDir = getBuiltinAgentsDir(cwd);
  agents.push(...discoverAgentsInDir(builtinDir, "builtin"));

  // Load user agents if scope allows
  if (scope === "user" || scope === "both") {
    const userDir = getUserAgentsDir();
    agents.push(...discoverAgentsInDir(userDir, "user"));
  }

  // Load project agents if scope allows
  if (scope === "project" || scope === "both") {
    const projectDir = getProjectAgentsDir(cwd);
    if (projectDir) {
      agents.push(...discoverAgentsInDir(projectDir, "project"));
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

  return { agents: [...byName.values()] };
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
