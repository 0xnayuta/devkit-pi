---
status: current
audience: all
last_verified: 2026-05-12
language: english
---

# Convert Content Tool Reference

`convert_content` currently supports local `path` input and remote `url` input. Remote URLs are safely downloaded to a temporary file first, then converted to Markdown through the configured MarkItDown CLI provider. TUI renderers and toolkit-level activity integration are implemented.

Canonical source: `src/modules/convert/` and `src/config/load-config.ts`.

## Tool

| Tool | Status | Purpose |
|---|---|---|
| `convert_content` | Local path and URL conversion implemented | Convert local files or safely downloaded remote files to Markdown with MarkItDown CLI |

## Parameters

```ts
{
  path?: string,
  url?: string,
  maxContentChars?: number,
  timeoutMs?: number
}
```

Execution validates that exactly one of `path` or `url` is provided. Providing both or neither returns `INVALID_INPUT`.

## Current tool behavior

- `convertContent.enabled=false` disables tool registration.
- `path` must point to an existing local file inside the active workspace (`process.cwd()` for the extension process). Missing paths and directories return `FILE_NOT_FOUND`; paths outside the workspace return `INVALID_INPUT`.
- Local files larger than `convertContent.maxResponseBytes` return `FILE_TOO_LARGE` before provider execution.
- `url` must use `http:` or `https:`. Other protocols return `UNSUPPORTED_PROTOCOL`.
- Remote URLs are validated with private-network protection before download.
- Every redirect hop is revalidated with the same private-network policy before being followed.
- Current DNS validation happens before `fetch`; this blocks common private-network targets but does not claim to eliminate all DNS rebinding / DNS TOCTOU risks.
- Remote responses larger than `convertContent.maxResponseBytes` return `FILE_TOO_LARGE` before provider execution.
- Temporary downloaded files are removed after conversion succeeds or fails.
- Local and downloaded file conversion invokes the configured MarkItDown CLI provider.
- Per-call `timeoutMs` and `maxContentChars` override config defaults when they are positive integers.
- Provider output beyond `maxContentChars` is truncated with `truncated=true`.
- Tool calls include compact/expanded TUI renderers for call/result display.
- Successful and failed conversions are recorded in the shared toolkit activity log with `type="convert"`.
- `allowPrivateNetwork=false` blocks localhost, loopback, private, link-local, metadata-style, and internal hostnames/IPs by default. Set `convertContent.allowPrivateNetwork=true` only for trusted environments.
- `file_path` is not a supported canonical field; use `path`.

## MarkItDown provider status

`src/modules/convert/provider.ts` implements `MarkItDownProvider`:

- Uses `src/shared/external-command.ts` for configured MarkItDown CLI command availability checks and execution.
- Invokes the configured executable with the input file as a structured argument, without shell interpolation.
- Applies conversion timeout through the shared external command runner.
- Checks input file size against `maxResponseBytes` in the convert provider before execution.
- Receives stdout/stderr from the shared runner.
- Maps missing command, timeout, non-zero exit, and file-too-large failures to convert error codes.
- Truncates stdout to `maxContentChars` and returns `truncated=true`.

`src/shared/external-command.ts` is infrastructure only: it resolves/runs short external commands and collects stdout/stderr. MarkItDown-specific behavior, convert error mapping, file-size checks, metadata, and output truncation remain in `src/modules/convert/provider.ts`.

## Success result

```ts
{
  source: string,
  provider: "markitdown",
  content: string,
  truncated: boolean,
  metadata?: {
    contentType?: string,
    fileName?: string,
    fileSize?: number,
    durationMs?: number
  }
}
```

## Error codes

```text
INVALID_INPUT
FILE_NOT_FOUND
FILE_TOO_LARGE
UNSUPPORTED_PROTOCOL
COMMAND_NOT_FOUND
CONVERT_TIMEOUT
CONVERT_FAILED
NETWORK_ERROR
PRIVATE_NETWORK_BLOCKED
```

See [Configuration](./configuration.md#convert-content-configuration) for `convertContent` defaults.
