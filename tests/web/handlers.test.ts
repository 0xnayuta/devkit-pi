import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getHandler, runHandler } from "../../src/modules/web/handlers.ts";

describe("Handler Registry", () => {
  it("returns HtmlHandler for html type", () => {
    const handler = getHandler("html");
    assert.ok(handler);
    assert.equal(typeof handler.process, "function");
  });

  it("returns PlainTextHandler for text type", () => {
    const handler = getHandler("text");
    assert.ok(handler);
  });

  it("returns PlainTextHandler for markdown type", () => {
    const handler = getHandler("markdown");
    assert.ok(handler);
  });

  it("returns JsonHandler for json type", () => {
    const handler = getHandler("json");
    assert.ok(handler);
  });

  it("returns CsvTsvHandler for csv type", () => {
    const handler = getHandler("csv");
    assert.ok(handler);
  });

  it("returns XmlHandler for xml type", () => {
    const handler = getHandler("xml");
    assert.ok(handler);
  });

  it("returns YamlHandler for yaml type", () => {
    const handler = getHandler("yaml");
    assert.ok(handler);
  });

  it("returns UnsupportedHandler for unsupported type", () => {
    const handler = getHandler("unsupported");
    assert.ok(handler);
  });
});

describe("HtmlHandler", () => {
  it("extracts title and text from HTML", () => {
    const handler = getHandler("html");
    const result = handler.process(
      "<html><head><title>My Page</title></head><body><h1>Hello</h1><p>World</p></body></html>",
      "https://example.com"
    );
    assert.equal(result.title, "My Page");
    assert.match(result.content, /Hello/);
    assert.match(result.content, /World/);
  });

  it("strips script and style tags", () => {
    const handler = getHandler("html");
    const result = handler.process(
      "<html><body><script>var x=1;</script><p>Content</p><style>.a{}</style></body></html>",
      "https://example.com"
    );
    assert.match(result.content, /Content/);
    assert.doesNotMatch(result.content, /var x/);
    assert.doesNotMatch(result.content, /\.a/);
  });

  it("returns undefined title when no title tag", () => {
    const handler = getHandler("html");
    const result = handler.process("<html><body><p>No title</p></body></html>", "https://example.com");
    assert.equal(result.title, undefined);
  });

  it("does not set parseWarning on success", () => {
    const handler = getHandler("html");
    const result = handler.process("<html><body>OK</body></html>", "https://example.com");
    assert.equal(result.parseWarning, undefined);
  });
});

describe("PlainTextHandler", () => {
  it("normalizes whitespace in plain text", () => {
    const handler = getHandler("text");
    const result = handler.process("  hello   world  \n\n\n  foo  ", "https://example.com/t.txt");
    // normalizeWhitespace collapses spaces but preserves trailing space before newlines
    assert.match(result.content, /hello world/);
    assert.match(result.content, /foo/);
    assert.doesNotMatch(result.content, /\n\n\n/); // collapsed to \n\n
  });

  it("preserves content for markdown", () => {
    const handler = getHandler("markdown");
    const result = handler.process("# Title\n\nSome **bold** text", "https://example.com/readme.md");
    assert.match(result.content, /# Title/);
    assert.match(result.content, /\*\*bold\*\*/);
  });

  it("handles source code text", () => {
    const handler = getHandler("text");
    const code = 'function hello() {\n  console.log("hi");\n}';
    const result = handler.process(code, "https://example.com/app.js");
    assert.match(result.content, /function hello/);
    assert.match(result.content, /console\.log/);
  });

  it("does not set parseWarning", () => {
    const handler = getHandler("text");
    const result = handler.process("simple text", "https://example.com");
    assert.equal(result.parseWarning, undefined);
  });
});

describe("JsonHandler", () => {
  it("pretty-prints valid JSON", () => {
    const handler = getHandler("json");
    const result = handler.process('{"name":"Alice","age":30}', "https://api.example.com/user");
    assert.equal(result.contentType, "application/json");
    assert.match(result.content, /"name": "Alice"/);
    assert.match(result.content, /"age": 30/);
    assert.equal(result.parseWarning, undefined);
  });

  it("pretty-prints JSON arrays", () => {
    const handler = getHandler("json");
    const result = handler.process('[1,2,3]', "https://api.example.com/nums");
    assert.match(result.content, /\[/);
    assert.match(result.content, /1/);
  });

  it("pretty-prints nested JSON", () => {
    const handler = getHandler("json");
    const result = handler.process('{"a":{"b":{"c":true}}}', "https://api.example.com/deep");
    assert.match(result.content, /"c": true/);
  });

  it("falls back to plain text with parseWarning on invalid JSON", () => {
    const handler = getHandler("json");
    const result = handler.process("{invalid json here", "https://api.example.com/bad");
    assert.equal(result.contentType, "application/json");
    assert.equal(result.parseWarning, "Invalid JSON, returned as plain text");
    assert.match(result.content, /invalid json here/);
  });

  it("falls back for completely non-JSON content", () => {
    const handler = getHandler("json");
    const result = handler.process("just some plain text, not json at all", "https://api.example.com/text");
    assert.equal(result.parseWarning, "Invalid JSON, returned as plain text");
    assert.match(result.content, /just some plain text/);
  });

  it("limits large arrays to first N items", () => {
    const handler = getHandler("json");
    const arr = Array.from({ length: 200 }, (_, i) => ({ id: i, name: `item${i}` }));
    const result = handler.process(JSON.stringify(arr), "https://api.example.com/list");
    assert.match(result.content, /"id": 0/);
    assert.match(result.content, /more items/);
    assert.doesNotMatch(result.content, /"id": 199/);
  });

  it("shows full array when under the limit", () => {
    const handler = getHandler("json");
    const arr = [1, 2, 3, 4, 5];
    const result = handler.process(JSON.stringify(arr), "https://api.example.com/small");
    assert.match(result.content, /\[/);
    assert.match(result.content, /5/);
    assert.doesNotMatch(result.content, /more items/);
  });

  it("extracts JSON-LD structured data", () => {
    const handler = getHandler("json");
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "My Great Article",
      description: "An article about things",
      author: { "@type": "Person", name: "Alice" },
      datePublished: "2024-01-15",
      articleBody: "This is the body of the article with lots of content.",
    });
    const result = handler.process(jsonLd, "https://example.com/article");
    assert.match(result.content, /Type: Article/);
    assert.match(result.content, /Title: My Great Article/);
    assert.match(result.content, /Description: An article about things/);
    assert.match(result.content, /Author: Alice/);
    assert.match(result.content, /Published: 2024-01-15/);
    assert.match(result.content, /Content: This is the body/);
    assert.equal(result.parseWarning, undefined);
  });

  it("extracts JSON-LD with string author", () => {
    const handler = getHandler("json");
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Home Page",
      description: "Welcome",
      author: "Bob",
    });
    const result = handler.process(jsonLd, "https://example.com");
    assert.match(result.content, /Type: WebPage/);
    assert.match(result.content, /Name: Home Page/);
    assert.match(result.content, /Author: Bob/);
  });

  it("skips JSON-LD extraction when not enough fields", () => {
    const handler = getHandler("json");
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Thing",
    });
    const result = handler.process(jsonLd, "https://example.com");
    // Only @type, no useful fields — should not be extracted as JSON-LD
    assert.equal(result.parseWarning, undefined);
    assert.match(result.content, /"@context"/); // falls back to pretty print
  });
});

describe("CsvTsvHandler", () => {
  it("parses simple CSV into a markdown table", () => {
    const handler = getHandler("csv");
    const csv = "name,age,city\nAlice,30,NYC\nBob,25,LA";
    const result = handler.process(csv, "https://example.com/data.csv");
    assert.equal(result.contentType, "text/csv");
    assert.match(result.content, /\| name/);
    assert.match(result.content, /\| Alice/);
    assert.match(result.content, /\| Bob/);
    assert.match(result.content, /---/); // separator line
    assert.equal(result.parseWarning, undefined);
  });

  it("handles TSV content with tab delimiter", () => {
    const handler = getHandler("csv");
    const tsv = "name\tage\nAlice\t30";
    const result = handler.process(tsv, "https://example.com/data.tsv");
    assert.equal(result.contentType, "text/tab-separated-values");
    assert.match(result.content, /\| name/);
    assert.match(result.content, /\| Alice/);
  });

  it("handles quoted fields with commas inside", () => {
    const handler = getHandler("csv");
    const csv = 'name,desc\nAlice,"Lives in NYC, NY"\nBob,"Simple"';
    const result = handler.process(csv, "https://example.com/quoted.csv");
    assert.match(result.content, /Lives in NYC, NY/);
  });

  it("handles empty CSV gracefully", () => {
    const handler = getHandler("csv");
    const result = handler.process("", "https://example.com/empty.csv");
    assert.equal(result.content, "");
    assert.equal(result.parseWarning, undefined);
  });

  it("truncates at MAX_CSV_ROWS (100)", () => {
    const handler = getHandler("csv");
    const header = "id,value";
    const rows = Array.from({ length: 200 }, (_, i) => `${i},val${i}`);
    const csv = [header, ...rows].join("\n");
    const result = handler.process(csv, "https://example.com/big.csv");
    // 201 total lines, MAX_CSV_ROWS=100, so 101 lines are truncated
    assert.match(result.content, /more rows truncated/);
    // The table should not contain all 200 rows
    assert.doesNotMatch(result.content, /val199/);
  });

  it("handles single-column CSV", () => {
    const handler = getHandler("csv");
    const csv = "name\nAlice\nBob";
    const result = handler.process(csv, "https://example.com/single.csv");
    assert.match(result.content, /\| name/);
    assert.match(result.content, /\| Alice/);
  });

  it("limits columns to MAX_CSV_COLUMNS (20)", () => {
    const handler = getHandler("csv");
    const header = Array.from({ length: 30 }, (_, i) => `col${i}`).join(",");
    const row = Array.from({ length: 30 }, (_, i) => `val${i}`).join(",");
    const csv = `${header}\n${row}`;
    const result = handler.process(csv, "https://example.com/wide.csv");
    // Should have col0-col19, but not col29
    assert.match(result.content, /col0/);
    assert.match(result.content, /col19/);
    assert.doesNotMatch(result.content, /col29/);
  });
});

describe("XmlHandler", () => {
  it("normalizes XML whitespace", () => {
    const handler = getHandler("xml");
    const xml = '<?xml version="1.0"?>\n<root>\n\t<item>hello</item>\n</root>';
    const result = handler.process(xml, "https://example.com/feed.xml");
    assert.equal(result.contentType, "application/xml");
    assert.match(result.content, /<root>/);
    assert.match(result.content, /<item>hello<\/item>/);
    // Tabs should be converted to 2 spaces
    assert.doesNotMatch(result.content, /\t/);
    assert.equal(result.parseWarning, undefined);
  });

  it("preserves XML structure", () => {
    const handler = getHandler("xml");
    const xml = "<root><a>1</a><b>2</b></root>";
    const result = handler.process(xml, "https://example.com/test.xml");
    assert.match(result.content, /<a>1<\/a>/);
    assert.match(result.content, /<b>2<\/b>/);
  });

  it("trims leading/trailing whitespace", () => {
    const handler = getHandler("xml");
    const result = handler.process("  \n  <root/>  \n  ", "https://example.com/test.xml");
    assert.equal(result.content, "<root/>");
  });

  it("extracts RSS feed entries", () => {
    const handler = getHandler("xml");
    const rss = `
      <rss version="2.0">
        <channel>
          <title>My Blog</title>
          <link>https://example.com</link>
          <item>
            <title>First Post</title>
            <link>https://example.com/post1</link>
            <pubDate>Mon, 15 Jan 2024 00:00:00 GMT</pubDate>
            <description>This is the first post about interesting things.</description>
          </item>
          <item>
            <title>Second Post</title>
            <link>https://example.com/post2</link>
            <pubDate>Tue, 16 Jan 2024 00:00:00 GMT</pubDate>
            <description>Another great post.</description>
          </item>
        </channel>
      </rss>`;
    const result = handler.process(rss, "https://example.com/feed.xml");
    assert.equal(result.contentType, "application/rss+xml");
    assert.match(result.content, /Feed: My Blog/);
    assert.match(result.content, /First Post/);
    assert.match(result.content, /https:\/\/example.com\/post1/);
    assert.match(result.content, /Second Post/);
    assert.match(result.content, /interesting things/);
  });

  it("extracts Atom feed entries", () => {
    const handler = getHandler("xml");
    const atom = `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>My Atom Feed</title>
        <link href="https://example.com"/>
        <entry>
          <title>Entry One</title>
          <link href="https://example.com/entry1"/>
          <published>2024-01-15T00:00:00Z</published>
          <summary>Summary of the first entry.</summary>
        </entry>
        <entry>
          <title>Entry Two</title>
          <link href="https://example.com/entry2"/>
          <updated>2024-01-16T00:00:00Z</updated>
          <summary>Summary of the second entry.</summary>
        </entry>
      </feed>`;
    const result = handler.process(atom, "https://example.com/atom.xml");
    assert.equal(result.contentType, "application/atom+xml");
    assert.match(result.content, /Feed: My Atom Feed/);
    assert.match(result.content, /Entry One/);
    assert.match(result.content, /https:\/\/example.com\/entry1/);
    assert.match(result.content, /2024-01-15/);
    assert.match(result.content, /Entry Two/);
    assert.match(result.content, /Summary of the first entry/);
  });

  it("falls back to XML formatting for non-feed XML", () => {
    const handler = getHandler("xml");
    const xml = "<config><setting name=\"debug\">true</setting></config>";
    const result = handler.process(xml, "https://example.com/config.xml");
    assert.equal(result.contentType, "application/xml");
    assert.match(result.content, /<config>/);
    assert.match(result.content, /debug/);
  });

  it("limits RSS items to MAX_RSS_ITEMS", () => {
    const handler = getHandler("xml");
    const items = Array.from(
      { length: 50 },
      (_, i) => `<item><title>Item ${i}</title><link>https://example.com/${i}</link></item>`
    ).join("\n");
    const rss = `<rss version="2.0"><channel><title>Big Feed</title>${items}</channel></rss>`;
    const result = handler.process(rss, "https://example.com/big-feed.xml");
    assert.match(result.content, /Feed: Big Feed/);
    assert.match(result.content, /Item 0/);
    assert.match(result.content, /Item 19/);
    assert.doesNotMatch(result.content, /Item 49/);
  });
});

describe("YamlHandler", () => {
  it("normalizes YAML whitespace", () => {
    const handler = getHandler("yaml");
    const yaml = "  name: Alice\n  age: 30\n\n  city: NYC  ";
    const result = handler.process(yaml, "https://example.com/config.yml");
    assert.equal(result.contentType, "text/yaml");
    assert.match(result.content, /name: Alice/);
    assert.match(result.content, /age: 30/);
    assert.equal(result.parseWarning, undefined);
  });
});

describe("UnsupportedHandler", () => {
  it("throws when process is called", () => {
    const handler = getHandler("unsupported");
    assert.throws(() => handler.process("data", "https://example.com/file.pdf"), /Unsupported/);
  });
});

describe("runHandler — parse failure fallback", () => {
  it("returns handler result on success", () => {
    const handler = getHandler("json");
    const result = runHandler(handler, '{"ok":true}', "https://api.example.com", "json");
    assert.equal(result.parseWarning, undefined);
    assert.match(result.content, /"ok": true/);
  });

  it("falls back to plain text when handler throws", () => {
    const handler = getHandler("unsupported");
    const result = runHandler(handler, "some data", "https://example.com/file.pdf", "unsupported");
    assert.equal(result.parseWarning, "Failed to process as unsupported, returned as plain text");
    assert.match(result.content, /some data/);
  });

  it("preserves parseWarning from handler's own fallback", () => {
    const handler = getHandler("json");
    const result = runHandler(handler, "not json", "https://api.example.com", "json");
    // JsonHandler catches the error internally and sets its own parseWarning
    assert.equal(result.parseWarning, "Invalid JSON, returned as plain text");
    assert.match(result.content, /not json/);
  });
});
