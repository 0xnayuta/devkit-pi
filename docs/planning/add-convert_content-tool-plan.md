---
status: proposed
audience: maintainer
last_verified: 2026-05-12
language: english
---

# Plan: Add `convert_content` Tool

> **⚠️ Status: Proposed — not current behavior.** This document describes a future tool plan. devkit-pi has **not** implemented or publicly registered a `convert_content` tool. The features, interfaces, and behavior described here are **not part of the current public API**. For the current public contract, see [Reference index](../reference/README.md), `src/`, and `tests/`.

## Positioning

`convert_content` is a new agent tool responsible for:

```text
Complex files / local files / downloaded remote files → Markdown
```

Its positioning is not web fetch, but **document conversion**.

The suggested tool system becomes:

```text
web_search       — search the web
fetch_content    — lightweight URL content fetching
convert_content  — complex file to Markdown conversion
```

Phase 1 of `convert_content` recommends only integrating the **MarkItDown CLI provider**.

---

## Phase 1 Minimum Viable Scope

Phase 1 goal:

```text
Convert local files or remote URLs to Markdown via MarkItDown CLI
```

Supported inputs:

```text
file_path
url
```

Outputs:

```text
Markdown content
provider information
source information
truncated flag
metadata
```

Not directly supported:

```text
OCR
Audio transcription
LLM image description
ZIP recursive extraction
Multiple providers
Complex chunking
Structured element models
```

---

## Recommended Phase Breakdown

## Phase 1: Define Tool Boundary and Schema

### Goal

Add an independent tool:

```text
convert_content
```

Do not name it `markitdown` to avoid binding to a specific implementation.

### Input Design

Phase 1 recommends supporting:

```ts
{
  source: {
    type: "file_path" | "url",
    value: string
  },
  outputFormat?: "markdown",
  maxOutputChars?: number,
  timeoutMs?: number
}
```

Can also be simpler:

```ts
{
  path?: string,
  url?: string,
  maxOutputChars?: number,
  timeoutMs?: number
}
```

But `source.type` is clearer from a long-term perspective.

### Output Design

```ts
{
  source: string,
  provider: "markitdown",
  outputFormat: "markdown",
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

### Execution Boundary

Phase 1 only outputs Markdown, not JSON/chunks/assets.

---

## Phase 2: Implement MarkItDown CLI Provider

### Goal

Invoke MarkItDown via external command, without forcing Python dependencies into devkit-pi's Node dependency chain.

### Main Content

Implement:

```text
MarkItDownProvider
```

Responsibilities:

```text
Check if markitdown command exists
Call markitdown input-file
Capture stdout/stderr
Handle exit code
Handle timeout
Handle output truncation
Return Markdown
```

### Why CLI?

Because devkit-pi is a pi coding extension package, it should not force all users to install Python packages into the Node dependency chain.

CLI approach is more suitable for:

```text
Optional capability
Local toolchain
User self-installs
Cross-provider extension
```

### Execution Boundary

Do not auto-install MarkItDown. Only prompt users on how to install in error messages.

---

## Phase 3: Support Local file_path Input

### Goal

First get the most stable input path working.

### Main Content

For local files:

```text
Check if file exists
Check if it is a file
Check file size
Check if path is allowed to access
Call markitdown
Limit output length
```

### Security Boundary

If devkit-pi has a workspace root concept, recommend default allowing only access to:

```text
Current workspace
Explicitly allowed paths
```

Avoid agents arbitrarily reading user system files.

Can provide config:

```json
{
  "convertContent": {
    "allowOutsideWorkspace": false
  }
}
```

### Acceptance Criteria

Local PDF, DOCX, PPTX, XLSX, HTML, Markdown and other files can be converted to Markdown via MarkItDown.

---

## Phase 4: Support URL Input, but Must First Download Safely

### Goal

Allow agents to call:

```text
convert_content({ url })
```

for remote files, but don't directly pass URLs to MarkItDown.

### Recommended Flow

```text
1. Validate URL
2. Use devkit-pi's own secure download logic to download to temp file
3. Apply maxDownloadBytes
4. Apply timeout
5. Record contentType / fileName / fileSize
6. Call MarkItDown to convert temp file
7. Delete temp file
8. Return Markdown
```

### Why Not Directly Give MarkItDown URL?

Because directly handing to external tools weakens control over:

```text
Download size
Download timeout
SSRF protection
Private network access restriction
Temp file cleanup
Error format
metadata
```

### Execution Boundary

Phase 1 URL download does not need to support complex cookies, login, or browser rendering.

---

## Phase 5: Configuration System

### Suggested Configuration

```json
{
  "convertContent": {
    "enabled": true,
    "provider": "markitdown",
    "command": "markitdown",
    "timeoutMs": 30000,
    "maxDownloadBytes": 10485760,
    "maxOutputChars": 50000,
    "allowOutsideWorkspace": false,
    "allowPrivateNetwork": false
  }
}
```

### Execution Boundary

Whether to enable by default or disable by default depends on your devkit-pi product strategy.

My recommendation:

```text
Tool registration can exist by default
If markitdown doesn't exist at actual execution, return friendly error
Don't force users to install
```

This best fits the positioning of "personal workflow comprehensive extension package".

---

## Phase 6: Integration with `fetch_content`

### Goal

Let the two tools collaborate, but don't couple them too deeply.

### Recommended Approach

When `fetch_content` encounters complex types, return error or structured hint:

```text
Unsupported content type: application/pdf.
This content type is better handled by convert_content.
```

If tool schema supports structured errors, can add:

```json
{
  "error": "unsupported_content_type",
  "contentType": "application/pdf",
  "suggestedTool": "convert_content"
}
```

### Whether to Support `fetch_content.autoConvert`

Phase 1 does not recommend supporting auto-conversion by default.

Can do later:

```json
{
  "url": "...",
  "autoConvert": true
}
```

But Phase 1 is better to keep explicit:

```text
fetch_content fails and suggests convert_content
Agent explicitly calls convert_content
```

This is more controllable and easier to debug.

---

## Phase 7: Testing and Documentation

### Testing Scope

At minimum cover:

```text
markitdown command missing
Local file_path successful conversion, using mock command
URL download to temp file then convert
Conversion timeout
Output truncation
Download size limit
Temp file cleanup
stderr summary
file_path does not exist
Workspace-external path access not allowed
Unsupported fetch_content suggesting convert_content
```

### Documentation Content

Documentation should explain:

```text
convert_content is an optional tool
Requires users to self-install MarkItDown CLI
Difference from fetch_content
What inputs are supported
What advanced capabilities Phase 1 does not support
How to configure command / timeout / maxOutputChars
How to handle remote URLs
```

---

## `convert_content` Phase 1 Boundary Summary

### Do

```text
Add new independent agent tool convert_content
Integrate MarkItDown CLI
Support local file_path
Support remote url, but first download securely to temp file
Output Markdown
Support timeout
Support maxDownloadBytes
Support maxOutputChars
Support command missing friendly error
Support config items
Support basic tests and documentation
```

### Don't Do

```text
Don't put MarkItDown into fetch_content
Don't auto-install MarkItDown
Don't directly call Python API
Don't do OCR config
Don't do audio transcription
Don't do image understanding
Don't do ZIP recursive parsing
Don't do multiple providers
Don't do complex chunking
Don't do structured element models
Don't introduce Docling / Marker / Tika / Pandoc
```

---
