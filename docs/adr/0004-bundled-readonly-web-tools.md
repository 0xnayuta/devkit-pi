---
status: accepted
audience: maintainer
last_verified: 2026-05-12
---

# ADR 0004: Bundled Readonly Web Tools

> Historical decision record: this document records the context and trade-offs at the time, and is not equivalent to current API reference; current behavior is defined by `docs/reference/`, `src/`, and `tests/`.

## Status

Accepted (implementation completed 2026-05-10)

## Context

The built-in `researcher` agent declares usage of:

```text
web_search, fetch_content, get_search_content
```

These tools are not part of pi core's built-in tools. The reference project `nicobailon/pi-subagents` chose to depend on the independent extension `pi-web-access`, but this project wants `researcher` to be usable out-of-the-box while maintaining a lightweight boundary.

## Decision

Bundle a set of minimal readonly web tools within `pi-subagents`:

- `web_search`
- `fetch_content`
- `get_search_content`

The implementation goal is to be compatible with `pi-web-access`'s commonly used interface subset, not to replicate its full functionality.

## Scope

### Included

- General web search
- HTTP/HTTPS URL content fetching
- Basic HTML/text to readable text extraction
- `responseId` in-memory storage
- Retrieve full content from historical search/fetch results by `responseId`
- Timeout, response size, output length limits
- SSRF protection

### Excluded

- Curator UI
- Gemini Web/browser cookie
- YouTube/video analysis
- PDF specialized handling
- GitHub repo clone
- MCP/Exa complex fallback
- Multi-provider automatic orchestration
- Authenticated fetching
- Writing project files

## Recommended module structure

```text
src/web/
├─ index.ts      # registerWebTools(pi, config)
├─ schemas.ts    # TypeBox parameter schemas
├─ types.ts      # web tool internal types
├─ security.ts   # URL validation, SSRF protection, timeout/size defaults
├─ storage.ts    # responseId -> search/fetch result cache
├─ fetch.ts      # fetch_content
├─ extract.ts    # HTML/text extraction
└─ search.ts     # web_search provider
```

## Registration strategy

Subagent processes cannot register the `subagent` tool, but must be able to register web tools:

```ts
registerWebTools(pi, effectiveConfig);

if (process.env[PI_SUBAGENT_CHILD] === "1") return;

registerSubagentTool(pi);
```

| Process | Registered content |
|---|---|
| Main agent process | `subagent` + optional `web_*` |
| Subagent process | `web_search` / `fetch_content` / `get_search_content` |
| Subagent process | Does not register `subagent` |

## Security boundary

- Only allows `http:` / `https:`
- Blocks `localhost`, loopback, link-local, private IP
- Blocks `file:` and other local protocols
- Sets fetch timeout
- Sets maximum response body size
- Sets maximum output character count
- Limits redirects
- By default only handles text/html/text/plain and other text content
- Does not write project files; results only stored in memory or session-level temporary state

## Consequences

Advantages:

- `researcher` usable out-of-the-box
- No dependency on external `pi-web-access`
- Maintains readonly security boundary
- Interface remains familiar for common use cases

Trade-offs:

- Project scope expanded from pure subagent orchestration to include basic web research tools
- Need to maintain network access, security limits, and provider compatibility
- Search provider stability becomes a new maintenance point
