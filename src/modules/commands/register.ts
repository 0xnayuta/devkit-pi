import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_SUBAGENT_LSP_ACTIONS } from "../../config/load-config.ts";
import { PI_SUBAGENT_CHILD, type ResolvedToolkitConfig } from "../../shared/types.ts";
import { LSP_ACTIONS } from "../lsp/tool.ts";
import { createActivityPanel } from "../subagents/commands/activity.ts";
import { formatDoctorReport, runDoctorChecks } from "../subagents/commands/doctor.ts";
import { formatAgentList, getAgentList } from "../subagents/commands/list.ts";
import { formatLogs, type LogsOptions } from "../subagents/commands/logs.ts";
import { showToolkitReport } from "./report-viewer.ts";

interface ToolkitCommandArgs {
  subcommand: string;
  rest: string;
}

function parseToolkitArgs(args: string): ToolkitCommandArgs {
  const trimmed = args.trim();
  if (!trimmed) return { subcommand: "help", rest: "" };

  const [first, ...rest] = trimmed.split(/\s+/);
  return {
    subcommand: first.toLowerCase(),
    rest: rest.join(" "),
  };
}

function parseLogsOptions(args: string): LogsOptions {
  const options: LogsOptions = {};
  if (args.includes("--search")) {
    options.type = "search";
  } else if (args.includes("--fetch")) {
    options.type = "fetch";
  } else if (args.includes("--convert")) {
    options.type = "convert";
  }
  const match = args.match(/--limit\s+(\d+)/);
  if (match) {
    options.limit = Number.parseInt(match[1], 10);
  }
  return options;
}

function formatModulesOverview(config: ResolvedToolkitConfig): string {
  const lines: string[] = [];
  lines.push("devkit-pi modules");
  lines.push("=");
  lines.push(`subagents: ${config.subagents.enabled ? "enabled" : "disabled"}`);
  lines.push(`web:       ${config.web.enabled ? "enabled" : "disabled"}`);
  lines.push(`convert:   ${config.convertContent.enabled ? "enabled" : "disabled"}`);
  lines.push(
    `lsp:       ${
      config.lsp.enabled
        ? `enabled (tool=${config.lsp.tool.enabled ? "on" : "off"}, hook=${config.lsp.hook.enabled ? config.lsp.hook.mode : "disabled"})`
        : "disabled"
    }`
  );
  lines.push(`commands:  ${config.commands.enabled ? "enabled" : "disabled"}`);
  return lines.join("\n");
}

function formatLspOverview(config: ResolvedToolkitConfig): string {
  const lines: string[] = [];
  lines.push("LSP module");
  lines.push("=");
  lines.push(`enabled: ${config.lsp.enabled}`);
  lines.push(`tool.enabled: ${config.lsp.tool.enabled}`);
  lines.push(`tool.allowMutatingActions: ${config.lsp.tool.allowMutatingActions}`);
  lines.push(`hook.enabled: ${config.lsp.hook.enabled}`);
  lines.push(`hook.mode: ${config.lsp.hook.mode}`);
  lines.push(`tool.actions: ${LSP_ACTIONS.join(", ")}`);
  lines.push(`subagent.readonlyActions(default): ${DEFAULT_SUBAGENT_LSP_ACTIONS.join(", ")}`);
  return lines.join("\n");
}

function formatHelp(): string {
  return [
    "devkit-pi toolkit command",
    "=",
    "Usage:",
    "  /toolkit doctor     Run unified diagnostics checks",
    "  /toolkit modules    Show module enablement status",
    "  /toolkit logs       Show recent web activity logs",
    "  /toolkit agents     List builtin/user/project agents",
    "  /toolkit lsp        Show LSP tool/hook configuration",
    "  /toolkit activity   Open activity panel",
    "  /toolkit help       Show this help",
  ].join("\n");
}

export function registerToolkitCommands(pi: ExtensionAPI, config: ResolvedToolkitConfig): void {
  if (!config.commands.enabled) return;
  if (process.env[PI_SUBAGENT_CHILD] === "1") return;

  pi.registerCommand("toolkit", {
    description: "devkit-pi command center: doctor/modules/logs/agents/lsp/activity",
    handler: async (args: string, ctx) => {
      const { subcommand, rest } = parseToolkitArgs(args);

      try {
        if (subcommand === "doctor") {
          const report = await runDoctorChecks(ctx.cwd, config);
          const output = formatDoctorReport(report);
          await showToolkitReport(ctx, {
            title: "Toolkit Doctor",
            content: output,
          });
          ctx.ui.notify(
            `Doctor: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failed} failed`,
            "info"
          );
          return;
        }

        if (subcommand === "modules") {
          await showToolkitReport(ctx, {
            title: "Toolkit Modules",
            content: formatModulesOverview(config),
          });
          return;
        }

        if (subcommand === "logs") {
          await showToolkitReport(ctx, {
            title: "Toolkit Activity Logs",
            content: formatLogs(parseLogsOptions(rest)),
          });
          return;
        }

        if (subcommand === "agents") {
          const report = getAgentList(ctx.cwd);
          await showToolkitReport(ctx, {
            title: `Toolkit Agents (${report.total})`,
            content: formatAgentList(report),
          });
          return;
        }

        if (subcommand === "lsp") {
          await showToolkitReport(ctx, {
            title: "Toolkit LSP",
            content: formatLspOverview(config),
          });
          return;
        }

        if (subcommand === "activity") {
          const panel = createActivityPanel({ maxEntries: 15, autoRefresh: true });
          await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
            panel.setOnClose(() => done());

            return {
              render: (width: number) => panel.render(width),
              invalidate: () => panel.invalidate(),
              handleInput: (data: string) => {
                panel.handleInput(data);
                tui.requestRender();
              },
              dispose: () => panel.dispose(),
            };
          });

          ctx.ui.notify("Activity panel closed", "info");
          return;
        }

        await showToolkitReport(ctx, {
          title: "Toolkit Help",
          content: formatHelp(),
        });
      } catch (error) {
        ctx.ui.notify(
          `Toolkit command failed: ${error instanceof Error ? error.message : error}`,
          "error"
        );
      }
    },
  });
}
