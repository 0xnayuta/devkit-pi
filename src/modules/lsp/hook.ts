/**
 * LSP Hook - automatic diagnostics feedback.
 *
 * The hook is config-driven only. It does not read legacy/global pi-lsp
 * settings and it is never registered in subagent child processes.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { Diagnostic } from "vscode-languageserver-protocol";
import { PI_SUBAGENT_CHILD, type RequiredLspHookConfig } from "../../shared/types.ts";
import {
  diagnosticsWaitMsForFile,
  formatDiagnostic,
  getCppCompilationDbHint,
  getOrCreateManager,
  LSP_SERVERS,
  shutdownManager,
} from "./core.ts";

type LspActivity = "idle" | "loading" | "working";
type HookMode = RequiredLspHookConfig["mode"];

const DIAGNOSTICS_PREVIEW_LINES = 10;
const MAX_HOOK_FILES_PER_TURN = 16;
const MAX_HOOK_OUTPUT_CHARS = 60_000;
const LSP_IDLE_SHUTDOWN_MS = 2 * 60 * 1000;
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const WARMUP_MAP: Record<string, string> = {
  "pubspec.yaml": ".dart",
  "package.json": ".ts",
  "pyproject.toml": ".py",
  "go.mod": ".go",
  "Cargo.toml": ".rs",
  "settings.gradle": ".kt",
  "settings.gradle.kts": ".kt",
  "build.gradle": ".kt",
  "build.gradle.kts": ".kt",
  "pom.xml": ".kt",
  gradlew: ".kt",
  "gradle.properties": ".kt",
  "Package.swift": ".swift",
  "CMakeLists.txt": ".cpp",
  "compile_commands.json": ".cpp",
  Makefile: ".cpp",
};

function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (item && typeof item === "object" && "type" in item && (item as any).type === "text") {
        return String((item as any).text ?? "");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function formatDiagnosticsForDisplay(text: string): string {
  return text
    .replace(/\n?This file has errors, please fix\n/gi, "\n")
    .replace(/<\/?file_diagnostics>\n?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateHookOutput(text: string): string {
  if (text.length <= MAX_HOOK_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_HOOK_OUTPUT_CHARS)}\n\n[devkit-pi:lsp-hook] Output truncated to ${MAX_HOOK_OUTPUT_CHARS} characters.`;
}

function getServerConfig(filePath: string) {
  const ext = path.extname(filePath);
  return LSP_SERVERS.find((server) => server.extensions.includes(ext));
}

function extractLspFiles(input: Record<string, unknown>): string[] {
  const files: string[] = [];
  if (typeof input.file === "string") files.push(input.file);
  if (Array.isArray(input.files)) {
    for (const item of input.files) {
      if (typeof item === "string") files.push(item);
    }
  }
  return files;
}

function inputRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function agentWasAborted(event: unknown): boolean {
  const messages = Array.isArray((event as any)?.messages) ? (event as any).messages : [];
  return messages.some(
    (message: any) =>
      message &&
      typeof message === "object" &&
      message.role === "assistant" &&
      (message.stopReason === "aborted" || message.stopReason === "error")
  );
}

function isHookModeEnabled(mode: HookMode): mode is Exclude<HookMode, "disabled"> {
  return mode === "agent_end" || mode === "edit_write";
}

export function registerLspHook(pi: ExtensionAPI, config: RequiredLspHookConfig): void {
  if (!config.enabled || config.mode === "disabled") return;
  if (process.env[PI_SUBAGENT_CHILD] === "1") return;

  const activeClients: Set<string> = new Set();
  let statusUpdateFn: ((key: string, text: string | undefined) => void) | null = null;
  let activity: LspActivity = "idle";
  let diagnosticsAbort: AbortController | null = null;
  let shuttingDown = false;
  let idleShutdownTimer: NodeJS.Timeout | null = null;
  const hookMode = config.mode;
  const touchedFiles: Map<string, boolean> = new Map();

  pi.registerMessageRenderer("lsp-diagnostics", (message: any, options: any, theme: any) => {
    const content = formatDiagnosticsForDisplay(messageContentToText(message.content));
    if (!content) return new Text("", 0, 0);

    const expanded = options?.expanded === true;
    const lines = content.split("\n");
    const maxLines = expanded ? lines.length : DIAGNOSTICS_PREVIEW_LINES;
    const display = lines.slice(0, maxLines);
    const remaining = lines.length - display.length;

    const styledLines = display.map((line) => {
      if (line.startsWith("File: ")) return theme.fg("muted", line);
      return theme.fg("toolOutput", line);
    });

    if (!expanded && remaining > 0) {
      styledLines.push(theme.fg("dim", `... (${remaining} more lines)`));
    }

    return new Text(styledLines.join("\n"), 0, 0);
  });

  function setActivity(next: LspActivity): void {
    activity = next;
    updateLspStatus();
  }

  function clearIdleShutdownTimer(): void {
    if (!idleShutdownTimer) return;
    clearTimeout(idleShutdownTimer);
    idleShutdownTimer = null;
  }

  async function shutdownLspServersForIdle(): Promise<void> {
    diagnosticsAbort?.abort();
    diagnosticsAbort = null;
    setActivity("idle");
    await shutdownManager();
    activeClients.clear();
    updateLspStatus();
  }

  function scheduleIdleShutdown(): void {
    clearIdleShutdownTimer();
    idleShutdownTimer = setTimeout(() => {
      idleShutdownTimer = null;
      if (shuttingDown) return;
      void shutdownLspServersForIdle();
    }, LSP_IDLE_SHUTDOWN_MS);
    idleShutdownTimer.unref?.();
  }

  function updateLspStatus(): void {
    if (!statusUpdateFn) return;

    const clients = activeClients.size > 0 ? [...activeClients].join(", ") : "";
    const clientsText = clients ? `${DIM}${clients}${RESET}` : "";
    const activityHint = activity === "idle" ? "" : `${DIM}•${RESET}`;
    let text = isHookModeEnabled(hookMode) ? `${GREEN}LSP${RESET}` : `${YELLOW}LSP${RESET}`;
    if (!isHookModeEnabled(hookMode)) text += ` ${DIM}(tool)${RESET}`;
    if (activityHint) text += ` ${activityHint}`;
    if (clientsText) text += ` ${clientsText}`;
    statusUpdateFn("lsp", text);
  }

  function ensureActiveClientForFile(filePath: string, cwd: string): string | undefined {
    const manager = getOrCreateManager(cwd);
    let absPath: string;
    try {
      absPath = manager.resolveFilePath(filePath);
    } catch {
      return undefined;
    }

    const server = getServerConfig(absPath);
    if (!server) return undefined;

    if (!activeClients.has(server.id)) {
      activeClients.add(server.id);
      updateLspStatus();
    }

    return absPath;
  }

  function buildDiagnosticsOutput(
    filePath: string,
    diagnostics: Diagnostic[],
    cwd: string,
    includeFileHeader: boolean
  ): { notification: string; errorCount: number; output: string } {
    const absPath = getOrCreateManager(cwd).resolveFilePath(filePath);
    const relativePath = path.relative(cwd, absPath);
    const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === 1).length;

    const maxPreview = 5;
    const lines = diagnostics.slice(0, maxPreview).map((diagnostic) => {
      const severity = diagnostic.severity === 1 ? "ERROR" : "WARN";
      return `${severity}[${diagnostic.range.start.line + 1}] ${diagnostic.message.split("\n")[0]}`;
    });

    let notification = `📋 ${relativePath}\n${lines.join("\n")}`;
    if (diagnostics.length > maxPreview)
      notification += `\n... +${diagnostics.length - maxPreview} more`;

    const header = includeFileHeader ? `File: ${relativePath}\n` : "";
    const output = `\n${header}This file has errors, please fix\n<file_diagnostics>\n${diagnostics.map(formatDiagnostic).join("\n")}\n</file_diagnostics>\n`;

    return { notification, errorCount, output };
  }

  async function collectDiagnostics(
    filePath: string,
    ctx: ExtensionContext,
    includeWarnings: boolean,
    includeFileHeader: boolean,
    notify = true
  ): Promise<string | undefined> {
    const manager = getOrCreateManager(ctx.cwd);
    const absPath = ensureActiveClientForFile(filePath, ctx.cwd);
    if (!absPath) return undefined;

    try {
      setActivity("working");
      const result = await manager.touchFileAndWait(absPath, diagnosticsWaitMsForFile(absPath));
      if (!result.receivedResponse) return undefined;

      const diagnostics = includeWarnings
        ? result.diagnostics
        : result.diagnostics.filter((diagnostic) => diagnostic.severity === 1);
      const hint = getCppCompilationDbHint(absPath, ctx.cwd);
      if (!diagnostics.length && !hint) return undefined;

      if (!diagnostics.length) return `\n${hint}\n`;

      const report = buildDiagnosticsOutput(absPath, diagnostics, ctx.cwd, includeFileHeader);
      const output = hint ? `${report.output}\n${hint}\n` : report.output;
      if (notify && ctx.hasUI) {
        ctx.ui.notify(report.notification, report.errorCount > 0 ? "error" : "warning");
      }
      return output;
    } catch {
      return undefined;
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    shuttingDown = false;
    statusUpdateFn = ctx.hasUI && ctx.ui.setStatus ? ctx.ui.setStatus.bind(ctx.ui) : null;
    updateLspStatus();

    const manager = getOrCreateManager(ctx.cwd);
    for (const [marker, ext] of Object.entries(WARMUP_MAP)) {
      if (!fs.existsSync(path.join(ctx.cwd, marker))) continue;
      setActivity("loading");
      manager
        .getClientsForFile(path.join(ctx.cwd, `dummy${ext}`))
        .then((clients) => {
          if (clients.length > 0) {
            const server = LSP_SERVERS.find((candidate) => candidate.extensions.includes(ext));
            if (server) activeClients.add(server.id);
          }
        })
        .catch(() => {})
        .finally(() => setActivity("idle"));
      break;
    }
  });

  pi.on("session_tree", async (_event, ctx) => {
    statusUpdateFn = ctx.hasUI && ctx.ui.setStatus ? ctx.ui.setStatus.bind(ctx.ui) : null;
    updateLspStatus();
  });

  pi.on("session_shutdown", async () => {
    shuttingDown = true;
    clearIdleShutdownTimer();
    diagnosticsAbort?.abort();
    diagnosticsAbort = null;
    setActivity("idle");
    await shutdownManager();
    activeClients.clear();
    statusUpdateFn?.("lsp", undefined);
  });

  pi.on("tool_call", async (event, ctx) => {
    const input = inputRecord((event as any).input);
    clearIdleShutdownTimer();

    if ((event as any).toolName === "lsp") {
      for (const file of extractLspFiles(input)) {
        ensureActiveClientForFile(file, ctx.cwd);
      }
      return;
    }

    if (
      (event as any).toolName !== "read" &&
      (event as any).toolName !== "write" &&
      (event as any).toolName !== "edit"
    )
      return;

    const filePath = typeof input.path === "string" ? input.path : undefined;
    if (!filePath) return;

    const absPath = ensureActiveClientForFile(filePath, ctx.cwd);
    if (!absPath) return;

    void getOrCreateManager(ctx.cwd)
      .getClientsForFile(absPath)
      .catch(() => {});
  });

  pi.on("agent_start", async () => {
    clearIdleShutdownTimer();
    diagnosticsAbort?.abort();
    diagnosticsAbort = null;
    setActivity("idle");
    touchedFiles.clear();
  });

  pi.on("agent_end", async (event, ctx) => {
    try {
      if (hookMode !== "agent_end") return;
      if (agentWasAborted(event)) {
        touchedFiles.clear();
        return;
      }
      if (touchedFiles.size === 0) return;
      if (!ctx.isIdle() || ctx.hasPendingMessages()) return;

      const abort = new AbortController();
      diagnosticsAbort?.abort();
      diagnosticsAbort = abort;

      const files = Array.from(touchedFiles.entries()).slice(0, MAX_HOOK_FILES_PER_TURN);
      touchedFiles.clear();

      try {
        const outputs: string[] = [];
        for (const [filePath, includeWarnings] of files) {
          if (shuttingDown || abort.signal.aborted) return;
          if (!ctx.isIdle() || ctx.hasPendingMessages()) {
            abort.abort();
            return;
          }

          const output = await collectDiagnostics(filePath, ctx, includeWarnings, true, false);
          if (abort.signal.aborted) return;
          if (output) outputs.push(output);
        }

        if (shuttingDown || abort.signal.aborted || outputs.length === 0) return;
        pi.sendMessage(
          {
            customType: "lsp-diagnostics",
            content: truncateHookOutput(outputs.join("\n")),
            display: true,
          },
          {
            triggerTurn: true,
            deliverAs: "followUp",
          }
        );
      } finally {
        if (diagnosticsAbort === abort) diagnosticsAbort = null;
        if (!shuttingDown) setActivity("idle");
      }
    } finally {
      if (!shuttingDown) scheduleIdleShutdown();
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if ((event as any).toolName === "lsp") {
      const input = inputRecord((event as any).input);
      if (input.action === "restart") {
        const target = typeof input.server === "string" ? input.server.trim() : "";
        if (!target || target === "all") activeClients.clear();
        else activeClients.delete(target);
        setActivity("idle");
        updateLspStatus();
      }
      return;
    }

    if ((event as any).toolName !== "write" && (event as any).toolName !== "edit") return;

    const input = inputRecord((event as any).input);
    const filePath = typeof input.path === "string" ? input.path : undefined;
    if (!filePath) return;

    const absPath = ensureActiveClientForFile(filePath, ctx.cwd);
    if (!absPath) return;

    if (hookMode === "agent_end") {
      const includeWarnings = (event as any).toolName === "write";
      const existing = touchedFiles.get(absPath) ?? false;
      touchedFiles.set(absPath, existing || includeWarnings);
      return;
    }

    if (hookMode !== "edit_write") return;
    const includeWarnings = (event as any).toolName === "write";
    const output = await collectDiagnostics(absPath, ctx, includeWarnings, false);
    if (!output) return;

    const content = Array.isArray((event as any).content) ? (event as any).content : [];
    return {
      content: [...content, { type: "text" as const, text: truncateHookOutput(output) }],
    };
  });
}
