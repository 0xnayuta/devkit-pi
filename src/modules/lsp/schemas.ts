import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";

export const MAX_WORKSPACE_DIAGNOSTIC_FILES = 64;

export const LSP_ACTIONS = [
  "definition",
  "references",
  "hover",
  "symbols",
  "diagnostics",
  "workspace-diagnostics",
  "signature",
  "rename",
  "codeAction",
  "restart",
  "servers",
] as const;

const SEVERITY_FILTERS = ["all", "error", "warning", "info", "hint"] as const;

export const LspParams = Type.Object({
  action: StringEnum(LSP_ACTIONS),
  file: Type.Optional(Type.String({ description: "File path (required for most actions)" })),
  files: Type.Optional(
    Type.Array(Type.String(), {
      description: "File paths for workspace-diagnostics",
      maxItems: MAX_WORKSPACE_DIAGNOSTIC_FILES,
    })
  ),
  line: Type.Optional(
    Type.Number({
      description: "Line (1-indexed). Required for position-based actions unless query provided.",
    })
  ),
  column: Type.Optional(
    Type.Number({
      description: "Column (1-indexed). Required for position-based actions unless query provided.",
    })
  ),
  endLine: Type.Optional(
    Type.Number({ description: "End line for range-based actions (codeAction)" })
  ),
  endColumn: Type.Optional(
    Type.Number({ description: "End column for range-based actions (codeAction)" })
  ),
  query: Type.Optional(
    Type.String({
      description:
        "Symbol name filter (for symbols) or to resolve position (for definition/references/hover/signature)",
    })
  ),
  newName: Type.Optional(Type.String({ description: "New name for rename action" })),
  severity: Type.Optional(
    StringEnum(SEVERITY_FILTERS, {
      description: 'Filter diagnostics: "all"|"error"|"warning"|"info"|"hint"',
    })
  ),
  server: Type.Optional(
    Type.String({
      description: 'For action="restart": server id (e.g. "clangd") or "all" (default).',
    })
  ),
});

export type LspParamsType = Static<typeof LspParams>;
