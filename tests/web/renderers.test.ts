import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import {
  renderFetchContentCall,
  renderFetchContentResult,
  renderGetSearchContentCall,
  renderGetSearchContentResult,
  renderWebSearchCall,
  renderWebSearchResult,
  safeStringify,
  truncateText,
} from "../../src/modules/web/renderers.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function result(details: unknown): AgentToolResult<any> {
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  } as AgentToolResult<any>;
}

function renderText(component: { render(width: number): string[] }): string {
  return component.render(240).join("\n");
}

describe("web tool renderers", () => {
  it("renders web_search call and compact result summary", () => {
    const call = renderText(
      renderWebSearchCall({ query: "pi tool rendering", queries: ["subagents"], numResults: 5 }, theme)
    );
    assert.match(call, /web_search/);
    assert.match(call, /pi tool rendering/);
    assert.match(call, /\+1 queries/);

    const compact = renderText(
      renderWebSearchResult(
        result({
          responseId: "search-1",
          queries: [
            {
              query: "pi tool rendering",
              results: [
                { title: "Result A", url: "https://example.com/a", snippet: "a" },
                { title: "Result B", url: "https://example.com/b", snippet: "b" },
                { title: "Result C", url: "https://example.com/c", snippet: "c" },
                { title: "Result D", url: "https://example.com/d", snippet: "d" },
              ],
            },
          ],
        }),
        { expanded: false, isPartial: false },
        theme
      )
    );

    assert.match(compact, /responseId: search-1/);
    assert.match(compact, /queries: 1, results: 4/);
    assert.match(compact, /Result A/);
    assert.match(compact, /\.\.\. \(1 more results,/);
    assert.match(compact, /to expand/);
    assert.doesNotMatch(compact, /chars/);
  });

  it("renders web_search expanded result as full JSON", () => {
    const expanded = renderText(
      renderWebSearchResult(
        result({ responseId: "search-1", queries: [{ query: "q", results: [{ title: "Only", url: "https://example.com" }] }] }),
        { expanded: true, isPartial: false },
        theme
      )
    );

    assert.match(expanded, /"responseId": "search-1"/);
    assert.match(expanded, /"title": "Only"/);
    assert.doesNotMatch(expanded, /to expand/);
  });

  it("renders fetch_content call and compact result summary without full content", () => {
    const longContent = "alpha ".repeat(1000);
    const call = renderText(renderFetchContentCall({ url: "https://example.com/docs/page" }, theme));
    assert.match(call, /fetch_content/);
    assert.match(call, /example.com\/docs\/page/);

    const compact = renderText(
      renderFetchContentResult(
        result({
          responseId: "fetch-1",
          results: [
            {
              url: "https://example.com/docs/page",
              title: "Docs Page",
              content: longContent,
              truncated: false,
              contentType: "text/html",
            },
          ],
        }),
        { expanded: false, isPartial: false },
        theme
      )
    );

    assert.match(compact, /responseId: fetch-1/);
    assert.match(compact, /urls: 1/);
    assert.match(compact, /Docs Page/);
    assert.match(compact, /content truncated/);
    assert.match(compact, /to expand/);
    assert.doesNotMatch(compact, /chars/);
    assert.ok(compact.length < longContent.length / 2, "compact view should not print full content");
  });

  it("renders get_search_content selector and compact selected content", () => {
    const call = renderText(renderGetSearchContentCall({ responseId: "fetch-1", urlIndex: 0 }, theme));
    assert.match(call, /get_search_content/);
    assert.match(call, /urlIndex=0/);

    const compact = renderText(
      renderGetSearchContentResult(
        result({
          responseId: "fetch-1",
          result: {
            url: "https://example.com/a",
            title: "A",
            content: "selected content",
            truncated: false,
          },
        }),
        { expanded: false, isPartial: false },
        theme
      )
    );

    assert.match(compact, /responseId: fetch-1/);
    assert.match(compact, /selected content/);
    assert.match(compact, /details hidden/);
    assert.match(compact, /to expand/);
  });

  it("renders partial and error states clearly", () => {
    assert.match(
      renderText(renderWebSearchResult(result({}), { expanded: false, isPartial: true }, theme)),
      /Searching/
    );
    assert.match(
      renderText(renderFetchContentResult(result({}), { expanded: false, isPartial: true }, theme)),
      /Fetching/
    );
    assert.match(
      renderText(renderGetSearchContentResult(result({}), { expanded: false, isPartial: true }, theme)),
      /Loading stored content/
    );

    const error = renderText(
      renderFetchContentResult(
        result({ error: { code: "CONTENT_FETCH_TIMEOUT", message: "timed out", recovery: { action: "retry" } } }),
        { expanded: false, isPartial: false },
        theme
      )
    );
    assert.match(error, /CONTENT_FETCH_TIMEOUT/);
    assert.match(error, /timed out/);
    assert.match(error, /Recovery/);
  });

  it("provides safe string and truncation helpers", () => {
    assert.deepEqual(truncateText("abc", 10), { text: "abc", truncated: false });
    assert.equal(truncateText("abcdef", 4).text, "abc…");

    const circular: any = {};
    circular.self = circular;
    assert.match(safeStringify(circular), /Unserializable/);
  });
});
