/**
 * Extract Module Tests
 * Phase 1 — HTML content extraction correctness
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractHeadingTitle,
  extractHtml,
  extractPlainText,
  isLikelyJsRendered,
  normalizeWhitespace,
  shouldTryJinaFallback,
  truncateContent,
} from "../../src/modules/web/extract.ts";

// ---------------------------------------------------------------------------
// truncateContent
// ---------------------------------------------------------------------------

describe("extract - truncateContent", () => {
  it("returns content unchanged when under limit", () => {
    const result = truncateContent("hello", 100);
    assert.equal(result.content, "hello");
    assert.equal(result.truncated, false);
  });

  it("returns content unchanged when exactly at limit", () => {
    const result = truncateContent("hello", 5);
    assert.equal(result.content, "hello");
    assert.equal(result.truncated, false);
  });

  it("truncates content exceeding limit", () => {
    const result = truncateContent("hello world", 5);
    assert.equal(result.content, "hello");
    assert.equal(result.truncated, true);
  });

  it("returns empty string without truncation for empty input", () => {
    const result = truncateContent("", 100);
    assert.equal(result.content, "");
    assert.equal(result.truncated, false);
  });

  it("handles zero maxContentChars", () => {
    const result = truncateContent("abc", 0);
    assert.equal(result.content, "");
    assert.equal(result.truncated, true);
  });
});

// ---------------------------------------------------------------------------
// normalizeWhitespace
// ---------------------------------------------------------------------------

describe("extract - normalizeWhitespace", () => {
  it("trims leading and trailing whitespace", () => {
    assert.equal(normalizeWhitespace("  hello  "), "hello");
  });

  it("collapses multiple spaces into one", () => {
    assert.equal(normalizeWhitespace("hello    world"), "hello world");
  });

  it("collapses tabs into single space", () => {
    assert.equal(normalizeWhitespace("hello\t\tworld"), "hello world");
  });

  it("normalizes CRLF to LF", () => {
    assert.equal(normalizeWhitespace("line1\r\nline2"), "line1\nline2");
  });

  it("collapses 3+ newlines into 2", () => {
    assert.equal(normalizeWhitespace("a\n\n\n\nb"), "a\n\nb");
  });

  it("preserves double newlines", () => {
    assert.equal(normalizeWhitespace("a\n\nb"), "a\n\nb");
  });

  it("strips leading whitespace after newline", () => {
    assert.equal(normalizeWhitespace("line1\n  line2"), "line1\nline2");
  });

  it("handles empty string", () => {
    assert.equal(normalizeWhitespace(""), "");
  });

  it("handles whitespace-only string", () => {
    assert.equal(normalizeWhitespace("   \t\n  "), "");
  });
});

// ---------------------------------------------------------------------------
// extractHeadingTitle
// ---------------------------------------------------------------------------

describe("extract - extractHeadingTitle", () => {
  it("extracts h1 heading", () => {
    assert.equal(extractHeadingTitle("# My Title"), "My Title");
  });

  it("extracts h2 heading", () => {
    assert.equal(extractHeadingTitle("## Section Title"), "Section Title");
  });

  it("returns undefined when no heading found", () => {
    assert.equal(extractHeadingTitle("just plain text"), undefined);
  });

  it("returns undefined for empty string", () => {
    assert.equal(extractHeadingTitle(""), undefined);
  });

  it("strips inline markdown formatting from heading", () => {
    assert.equal(extractHeadingTitle("# **bold** and *italic*"), "bold and italic");
  });

  it("extracts heading from middle of text", () => {
    const text = "Some preamble\n## Real Title\nBody text";
    assert.equal(extractHeadingTitle(text), "Real Title");
  });

  it("normalizes whitespace in heading", () => {
    assert.equal(extractHeadingTitle("#  Spaced   Title  "), "Spaced Title");
  });

  it("returns undefined for h3+ (only h1-h2 supported)", () => {
    assert.equal(extractHeadingTitle("### Deep heading"), undefined);
  });
});

// ---------------------------------------------------------------------------
// isLikelyJsRendered
// ---------------------------------------------------------------------------

describe("extract - isLikelyJsRendered", () => {
  it("returns true for empty body with many scripts", () => {
    const html = `
      <html><body>
        <script src="a.js"></script>
        <script src="b.js"></script>
        <script src="c.js"></script>
        <script src="d.js"></script>
      </body></html>
    `;
    assert.equal(isLikelyJsRendered(html), true);
  });

  it("returns false for body with substantial text content", () => {
    const longText = "word ".repeat(100); // 500 chars > 200 threshold
    const html = `
      <html><body>
        <script src="a.js"></script>
        <script src="b.js"></script>
        <script src="c.js"></script>
        <script src="d.js"></script>
        <p>${longText}</p>
      </body></html>
    `;
    assert.equal(isLikelyJsRendered(html), false);
  });

  it("returns false when no body tag present", () => {
    const html = "<html><div>content</div></html>";
    assert.equal(isLikelyJsRendered(html), false);
  });

  it("returns false with few scripts and little content", () => {
    const html = "<html><body><script>x</script><p>hi</p></body></html>";
    assert.equal(isLikelyJsRendered(html), false);
  });

  it("excludes script/style content from text length calculation", () => {
    // Lots of text inside script tags should NOT count as useful content
    const longScript = "x".repeat(500);
    const html = `
      <html><body>
        <script>${longScript}</script>
        <script>${longScript}</script>
        <script>${longScript}</script>
        <script>${longScript}</script>
      </body></html>
    `;
    assert.equal(isLikelyJsRendered(html), true);
  });
});

// ---------------------------------------------------------------------------
// shouldTryJinaFallback
// ---------------------------------------------------------------------------

describe("extract - shouldTryJinaFallback", () => {
  it("returns true when extracted content is very short", () => {
    assert.equal(shouldTryJinaFallback("<html><body>x</body></html>", "x"), true);
  });

  it("returns true when content is short but page is JS-heavy", () => {
    const html = `
      <html><body>
        <script src="a.js"></script>
        <script src="b.js"></script>
        <script src="c.js"></script>
        <script src="d.js"></script>
      </body></html>
    `;
    assert.equal(shouldTryJinaFallback(html, "hi"), true);
  });

  it("returns false when extracted content is long enough", () => {
    const longContent = "word ".repeat(100);
    assert.equal(shouldTryJinaFallback("<html><body></body></html>", longContent), false);
  });
});

// ---------------------------------------------------------------------------
// extractPlainText
// ---------------------------------------------------------------------------

describe("extract - extractPlainText", () => {
  it("returns extracted content with url and metadata", () => {
    const result = extractPlainText("https://example.com", "Hello world", {
      maxContentChars: 1000,
    });
    assert.equal(result.url, "https://example.com");
    assert.equal(result.content, "Hello world");
    assert.equal(result.truncated, false);
    assert.equal(result.title, undefined);
  });

  it("normalizes whitespace in plain text", () => {
    const result = extractPlainText("https://example.com", "  hello   world  ", {
      maxContentChars: 1000,
    });
    assert.equal(result.content, "hello world");
  });

  it("truncates long plain text", () => {
    const long = "a".repeat(2000);
    const result = extractPlainText("https://example.com", long, {
      maxContentChars: 100,
    });
    assert.equal(result.content.length, 100);
    assert.equal(result.truncated, true);
  });

  it("includes contentType when provided", () => {
    const result = extractPlainText("https://example.com", "text", {
      maxContentChars: 1000,
      contentType: "text/plain",
    });
    assert.equal(result.contentType, "text/plain");
  });
});

// ---------------------------------------------------------------------------
// extractHtml
// ---------------------------------------------------------------------------

describe("extract - extractHtml", () => {
  it("extracts title from <title> tag", () => {
    const html = "<html><head><title>Page Title</title></head><body>Content</body></html>";
    const result = extractHtml("https://example.com", html, { maxContentChars: 1000 });
    assert.equal(result.title, "Page Title");
  });

  it("returns undefined title when no <title> tag", () => {
    const html = "<html><body>Content</body></html>";
    const result = extractHtml("https://example.com", html, { maxContentChars: 1000 });
    assert.equal(result.title, undefined);
  });

  it("strips script tags from output", () => {
    const html = "<html><body><script>alert('xss')</script><p>Safe</p></body></html>";
    const result = extractHtml("https://example.com", html, { maxContentChars: 1000 });
    assert.ok(!result.content.includes("alert"));
    assert.ok(result.content.includes("Safe"));
  });

  it("strips style tags from output", () => {
    const html = "<html><body><style>body{color:red}</style><p>Text</p></body></html>";
    const result = extractHtml("https://example.com", html, { maxContentChars: 1000 });
    assert.ok(!result.content.includes("color:red"));
    assert.ok(result.content.includes("Text"));
  });

  it("strips noscript tags from output", () => {
    const html = "<html><body><noscript>JS required</noscript><p>Content</p></body></html>";
    const result = extractHtml("https://example.com", html, { maxContentChars: 1000 });
    assert.ok(!result.content.includes("JS required"));
    assert.ok(result.content.includes("Content"));
  });

  it("strips HTML comments", () => {
    const html = "<html><body><!-- secret --><p>Visible</p></body></html>";
    const result = extractHtml("https://example.com", html, { maxContentChars: 1000 });
    assert.ok(!result.content.includes("secret"));
    assert.ok(result.content.includes("Visible"));
  });

  it("converts <br> to newlines", () => {
    const html = "<html><body><p>Line1<br>Line2</p></body></html>";
    const result = extractHtml("https://example.com", html, { maxContentChars: 1000 });
    assert.ok(result.content.includes("Line1\n"));
  });

  it("decodes HTML entities", () => {
    const html = "<html><body><p>&amp; &lt; &gt; &quot; &#39;</p></body></html>";
    const result = extractHtml("https://example.com", html, { maxContentChars: 1000 });
    assert.ok(result.content.includes("&"));
    assert.ok(result.content.includes("<"));
    assert.ok(result.content.includes(">"));
    assert.ok(result.content.includes('"'));
    assert.ok(result.content.includes("'"));
  });

  it("decodes &nbsp; to space", () => {
    const html = "<html><body><p>hello&nbsp;world</p></body></html>";
    const result = extractHtml("https://example.com", html, { maxContentChars: 1000 });
    assert.ok(result.content.includes("hello world"));
  });

  it("truncates long HTML content", () => {
    const longText = "word ".repeat(1000);
    const html = `<html><body><p>${longText}</p></body></html>`;
    const result = extractHtml("https://example.com", html, { maxContentChars: 100 });
    assert.equal(result.content.length, 100);
    assert.equal(result.truncated, true);
  });

  it("sets url on result", () => {
    const result = extractHtml("https://test.dev", "<html><body>x</body></html>", {
      maxContentChars: 1000,
    });
    assert.equal(result.url, "https://test.dev");
  });

  it("includes contentType when provided", () => {
    const result = extractHtml("https://test.dev", "<html><body>x</body></html>", {
      maxContentChars: 1000,
      contentType: "text/html",
    });
    assert.equal(result.contentType, "text/html");
  });
});
