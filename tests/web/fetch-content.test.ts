import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import {
	detectJinaTrigger,
	extractHeadingTitle,
	extractHtml,
	extractPlainText,
	isLikelyJsRendered,
	normalizeWhitespace,
	truncateContent,
} from "../../src/modules/web/extract.ts";
import { fetchContent } from "../../src/modules/web/fetch.ts";
import { getHandler, runHandler } from "../../src/modules/web/handlers.ts";
import { createAbortRejectingFetch, createRedirectLoopFetch } from "../shared/async-fetch-helpers.ts";

const mergeWebConfig = (config: Parameters<typeof mergeConfig>[0]) => mergeConfig(config).web;
const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function mockFetch(body: string | Uint8Array, contentType: string, status = 200) {
	globalThis.fetch = (() =>
		Promise.resolve(new Response(body, { status, headers: { "content-type": contentType } }))) as typeof fetch;
}

async function assertFetchOk(params: Parameters<typeof fetchContent>[0], config = mergeWebConfig({})) {
	const result = await fetchContent(params, config);
	assert.equal("responseId" in result, true);
	if (!("responseId" in result)) throw new Error("expected fetch_content success");
	return result;
}

async function assertFetchError(
	params: Parameters<typeof fetchContent>[0],
	code?: string,
	config = mergeWebConfig({})
) {
	const result = await fetchContent(params, config);
	assert.equal("error" in result, true);
	if (!("error" in result)) throw new Error("expected fetch_content error");
	if (code) assert.equal(result.error.code, code);
	return result;
}

describe("fetch_content input, security, and limits", () => {
	it("returns structured errors for missing, malformed, or blocked URLs", async () => {
		assert.deepEqual(await fetchContent({}, mergeWebConfig({})), {
			error: { code: "INVALID_INPUT", message: "fetch_content requires url or urls" },
		});

		const malformed = await assertFetchError({ url: "not a url" }, "CONTENT_FETCH_INVALID_URL");
		assert.match(malformed.error.message, /Invalid URL/);

		await assertFetchError({ url: "file:///etc/passwd" }, "CONTENT_FETCH_INVALID_URL");
		await assertFetchError({ url: "http://localhost:3000" }, "CONTENT_FETCH_FAILED");
		await assertFetchError({ url: "http://[::1]/" }, "CONTENT_FETCH_FAILED");
	});

	it("allows private network URLs only when explicitly configured", async () => {
		await assertFetchError({ url: "http://localhost:3000/api" });
		await assertFetchError(
			{ url: "http://localhost:3000/api" },
			undefined,
			mergeWebConfig({ web: { allowPrivateNetwork: false } })
		);

		mockFetch("local dev server content", "text/plain");
		const allowed = await assertFetchOk(
			{ url: "http://localhost:3000/api" },
			mergeWebConfig({ web: { allowPrivateNetwork: true } })
		);
		assert.equal(allowed.results[0].content, "local dev server content");
	});

	it("follows redirects manually and fetches the final URL content", async () => {
		const calls: string[] = [];
		globalThis.fetch = ((input: string | URL) => {
			const url = String(input);
			calls.push(url);
			if (url === "https://93.184.216.34/start") {
				return Promise.resolve(new Response(null, { status: 302, headers: { location: "/final" } }));
			}
			if (url === "https://93.184.216.34/final") {
				return Promise.resolve(
					new Response("redirected content", { status: 200, headers: { "content-type": "text/plain" } })
				);
			}
			return Promise.resolve(new Response("unexpected", { status: 500, headers: { "content-type": "text/plain" } }));
		}) as typeof fetch;

		const result = await assertFetchOk({ url: "https://93.184.216.34/start" });
		assert.equal(result.results[0].url, "https://93.184.216.34/final");
		assert.equal(result.results[0].content, "redirected content");
		assert.deepEqual(calls, ["https://93.184.216.34/start", "https://93.184.216.34/final"]);
	});

	it("limits response bytes and max content characters", async () => {
		mockFetch("0123456789", "text/plain");
		const responseLimited = await assertFetchOk(
			{ url: "https://93.184.216.34/text" },
			mergeWebConfig({ web: { maxResponseBytes: 5, maxContentChars: 100 } })
		);
		assert.equal(responseLimited.results[0].content, "01234");
		assert.equal(responseLimited.results[0].truncated, true);

		mockFetch(
			"<html><head><title>Hello</title></head><body><script>x</script><h1>Hello</h1><p>World</p></body></html>",
			"text/html"
		);
		const contentLimited = await assertFetchOk(
			{ url: "https://93.184.216.34/page" },
			mergeWebConfig({ web: { maxContentChars: 8 } })
		);
		assert.equal(contentLimited.results[0].title, "Hello");
		assert.equal(contentLimited.results[0].content, "Hello He");
		assert.equal(contentLimited.results[0].truncated, true);
	});

	it("returns structured error when redirect chain exceeds limit", async () => {
		globalThis.fetch = createRedirectLoopFetch() as typeof fetch;

		const result = await assertFetchError({ url: "https://93.184.216.34/loop" }, "CONTENT_FETCH_FAILED");
		assert.match(result.error.message, /Too many redirects/);
	});

	it("maps abort signals to CONTENT_FETCH_TIMEOUT", async () => {
		const controller = new AbortController();
		globalThis.fetch = createAbortRejectingFetch() as typeof fetch;

		const pending = fetchContent({ url: "https://93.184.216.34/abort" }, mergeWebConfig({}), controller.signal);
		controller.abort();
		const result = await pending;
		assert.equal("error" in result, true);
		if ("error" in result) {
			assert.equal(result.error.code, "CONTENT_FETCH_TIMEOUT");
		}
	});
});

describe("fetch_content Jina reader fallback", () => {
	it("falls back for JS-heavy pages when enabled", async () => {
		const calls: string[] = [];
		globalThis.fetch = ((input: string | URL) => {
			const url = String(input);
			calls.push(url);
			if (url.startsWith("https://r.jina.ai/")) {
				return Promise.resolve(
					new Response("Markdown Content:\n# Better Title\n\nThis is useful extracted content from Jina.", {
						status: 200,
						headers: { "content-type": "text/plain" },
					})
				);
			}
			return Promise.resolve(
				new Response(
					"<html><head><title>Stub</title></head><body><script>a</script><script>b</script><script>c</script><script>d</script><div id='app'></div></body></html>",
					{ status: 200, headers: { "content-type": "text/html" } }
				)
			);
		}) as typeof fetch;

		const result = await assertFetchOk(
			{ url: "https://93.184.216.34/js" },
			mergeWebConfig({ web: { enableJinaFallback: true } })
		);
		assert.equal(result.results[0].title, "Better Title");
		assert.match(result.results[0].content, /useful extracted content/i);
		assert.equal(result.results[0].contentType, "text/markdown; source=jina");
		assert.equal(
			calls.some((call) => call.startsWith("https://r.jina.ai/")),
			true
		);
	});

	it("cancels non-OK Jina fallback bodies", async () => {
		let jinaCancelCount = 0;
		globalThis.fetch = ((input: string | URL) => {
			const url = String(input);
			if (url.startsWith("https://r.jina.ai/")) {
				return Promise.resolve(
					new Response(
						new ReadableStream<Uint8Array>({
							cancel() {
								jinaCancelCount += 1;
							},
						}),
						{ status: 500, headers: { "content-type": "text/plain" } }
					)
				);
			}
			return Promise.resolve(
				new Response(
					"<html><head><title>Original</title></head><body><script>a</script><script>b</script><script>c</script><script>d</script><div id='app'></div></body></html>",
					{ status: 200, headers: { "content-type": "text/html" } }
				)
			);
		}) as typeof fetch;

		const result = await assertFetchOk(
			{ url: "https://93.184.216.34/js" },
			mergeWebConfig({ web: { enableJinaFallback: true } })
		);
		assert.equal(result.results[0].title, "Original");
		assert.equal(jinaCancelCount, 1);
	});

	it("honors preferReader and jinaTriggers", async () => {
		const calls: string[] = [];
		globalThis.fetch = ((input: string | URL) => {
			const url = String(input);
			calls.push(url);
			if (url.startsWith("https://r.jina.ai/"))
				return Promise.resolve(
					new Response("Markdown Content:\n# Jina Title\n\nReader content.", {
						status: 200,
						headers: { "content-type": "text/plain" },
					})
				);
			return Promise.resolve(
				new Response(
					"<html><head><title>Original</title></head><body><p>This page has enough normal content and should only use Jina when requested.</p></body></html>",
					{ status: 200, headers: { "content-type": "text/html" } }
				)
			);
		}) as typeof fetch;

		const preferred = await assertFetchOk(
			{ url: "https://93.184.216.34/page", preferReader: true },
			mergeWebConfig({ web: { enableJinaFallback: true } })
		);
		assert.equal(preferred.results[0].title, "Jina Title");
		assert.equal(
			calls.some((call) => call.startsWith("https://r.jina.ai/")),
			true
		);

		calls.length = 0;
		const noAutomatic = await assertFetchOk(
			{ url: "https://93.184.216.34/js" },
			mergeWebConfig({ web: { enableJinaFallback: true, jinaTriggers: [] } })
		);
		assert.ok(noAutomatic.results[0].content.length >= 0);
		assert.equal(
			calls.some((call) => call.startsWith("https://r.jina.ai/")),
			false
		);
	});

	it("does not send private network URLs to Jina and caps Jina response bytes", async () => {
		const calls: string[] = [];
		globalThis.fetch = ((input: string | URL) => {
			const url = String(input);
			calls.push(url);
			if (url.startsWith("https://r.jina.ai/"))
				return Promise.resolve(
					new Response(`Markdown Content:\n# Jina Title\n\n${"x".repeat(100)}`, {
						status: 200,
						headers: { "content-type": "text/plain" },
					})
				);
			return Promise.resolve(
				new Response("<html><body><div id='app'></div></body></html>", {
					status: 200,
					headers: { "content-type": "text/html" },
				})
			);
		}) as typeof fetch;

		await assertFetchOk(
			{ url: "http://localhost:3000/app", preferReader: true },
			mergeWebConfig({ web: { allowPrivateNetwork: true, enableJinaFallback: true } })
		);
		assert.equal(
			calls.some((call) => call.startsWith("https://r.jina.ai/")),
			false
		);

		calls.length = 0;
		const limited = await assertFetchOk(
			{ url: "https://93.184.216.34/page", preferReader: true },
			mergeWebConfig({ web: { enableJinaFallback: true, maxResponseBytes: 35 } })
		);
		assert.equal(
			calls.some((call) => call.startsWith("https://r.jina.ai/")),
			true
		);
		assert.equal(limited.results[0].content.length <= 35, true);
		assert.equal(limited.results[0].truncated, true);
	});
});

describe("fetch_content supported and unsupported content types", () => {
	it("accepts common text-friendly content types", async () => {
		const cases: Array<[string, string, string | RegExp, string?]> = [
			["https://93.184.216.34/api", "application/json", /"key"/, undefined],
			["https://93.184.216.34/api/v2", "application/vnd.api+json", /data/, undefined],
			["https://93.184.216.34/plain.txt", "text/plain; charset=utf-8", "Plain text content", undefined],
			["https://93.184.216.34/page.html", "text/html; charset=utf-8", /HTML content/i, undefined],
			["https://93.184.216.34/custom", "text/x-custom-type", "custom text content", undefined],
		];

		for (const [url, contentType, expected] of cases) {
			const body = contentType.includes("json")
				? '{"key":"value","data":[]}'
				: contentType.includes("html")
					? "<html><body>HTML content</body></html>"
					: contentType.includes("custom")
						? "custom text content"
						: "Plain text content";
			mockFetch(body, contentType);
			const result = await assertFetchOk({ url });
			if (typeof expected === "string") assert.equal(result.results[0].content, expected);
			else assert.match(result.results[0].content, expected);
		}
	});

	it("uses URL extension fallback for generic or text/plain content types", async () => {
		const cases = [
			{
				url: "https://93.184.216.34/data.json",
				type: "application/octet-stream",
				body: '{"hello":"world"}',
				expect: /hello/,
				contentType: "application/json",
			},
			{
				url: "https://93.184.216.34/docs/readme.md",
				type: "text/plain",
				body: "# Hello\n\nThis is markdown",
				expect: /Hello/,
			},
			{
				url: "https://93.184.216.34/table.csv",
				type: "text/plain",
				body: "name,age\nAda,36",
				expect: /\| name/,
				contentType: "text/csv",
			},
			{
				url: "https://93.184.216.34/feed.xml",
				type: "text/plain",
				body: "<rss><channel><title>Feed</title><item><title>One</title></item></channel></rss>",
				expect: /Feed: Feed/,
				contentType: "application/rss+xml",
			},
			{
				url: "https://93.184.216.34/app.js",
				type: "application/octet-stream",
				body: "console.log('hello');",
				expect: /console\.log/,
			},
		];

		for (const item of cases) {
			mockFetch(item.body, item.type);
			const result = await assertFetchOk({ url: item.url });
			assert.match(result.results[0].content, item.expect);
			if (item.contentType) assert.equal(result.results[0].contentType, item.contentType);
		}
	});

	it("rejects unsupported or binary content with structured errors", async () => {
		const cases: Array<[string, string | Uint8Array, string, RegExp?]> = [
			["https://93.184.216.34/image.png", "\x89PNG\r\n\x1a\n", "image/png"],
			[
				"https://93.184.216.34/document.pdf",
				"%PDF-1.4 fake content",
				"application/octet-stream",
				/\.pdf|not supported/i,
			],
			["https://93.184.216.34/download", "%PDF-1.4 fake content", "application/pdf", /Unsupported content type/i],
			["https://93.184.216.34/report.docx", "PK\x03\x04 fake docx", "application/octet-stream", /\.docx/i],
			[
				"https://93.184.216.34/unknown",
				new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
				"application/octet-stream",
				/Binary content detected/i,
			],
			[
				"https://93.184.216.34/video",
				new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
				"application/octet-stream",
				/Binary content detected/i,
			],
		];

		for (const [url, body, contentType, message] of cases) {
			mockFetch(body, contentType);
			const result = await assertFetchError({ url }, "CONTENT_FETCH_FAILED");
			if (message) assert.match(result.error.message, message);
			if (url.endsWith(".pdf") || url.endsWith(".docx") || contentType === "application/pdf") {
				assert.match(result.error.message, /try convert_content/i);
				assert.match(result.error.message, /MarkItDown CLI provider/i);
			} else {
				assert.doesNotMatch(result.error.message, /try convert_content/i);
			}
		}
	});

	it("falls back to text for application/octet-stream with no known extension", async () => {
		mockFetch("some text content", "application/octet-stream");
		const result = await assertFetchOk({ url: "https://93.184.216.34/binary" });
		assert.equal(result.results[0].content, "some text content");
	});
});

describe("fetch_content extraction helpers", () => {
	it("truncates and normalizes text consistently", () => {
		assert.deepEqual(truncateContent("hello", 100), { content: "hello", truncated: false });
		assert.deepEqual(truncateContent("hello world", 5), { content: "hello", truncated: true });
		assert.deepEqual(truncateContent("abc", 0), { content: "", truncated: true });
		assert.equal(normalizeWhitespace("  hello\t\tworld\r\n\n\n  next  "), "hello world\n\nnext");
	});

	it("extracts heading titles and detects Jina triggers", () => {
		assert.equal(extractHeadingTitle("# **bold** and *italic*"), "bold and italic");
		assert.equal(extractHeadingTitle("preamble\n## Real Title\nBody"), "Real Title");
		assert.equal(extractHeadingTitle("### Deep heading"), undefined);

		const jsHeavy =
			"<html><body><script>a</script><script>b</script><script>c</script><script>d</script><div id='app'></div></body></html>";
		assert.equal(isLikelyJsRendered(jsHeavy), true);
		assert.equal(isLikelyJsRendered(`<html><body>${"word ".repeat(100)}</body></html>`), false);
		assert.equal(detectJinaTrigger("<html><body>x</body></html>", "x"), "short-html");
		assert.equal(detectJinaTrigger(jsHeavy, "word ".repeat(100)), "js-heavy-html");
		assert.equal(detectJinaTrigger("<html><body><p>ok</p></body></html>", "word ".repeat(100)), null);
	});

	it("extracts plain text and HTML with metadata, sanitization, and truncation", () => {
		const text = extractPlainText("https://example.com", "  hello   world  ", {
			maxContentChars: 1000,
			contentType: "text/plain",
		});
		assert.equal(text.url, "https://example.com");
		assert.equal(text.content, "hello world");
		assert.equal(text.contentType, "text/plain");
		assert.equal(extractPlainText("https://example.com", "a".repeat(2000), { maxContentChars: 100 }).truncated, true);

		const html = extractHtml(
			"https://example.com",
			"<html><head><title>Page Title</title></head><body><!-- secret --><script>alert('x')</script><style>.a{}</style><noscript>JS</noscript><p>hello&nbsp;world<br>next &amp; more</p></body></html>",
			{ maxContentChars: 1000, contentType: "text/html" }
		);
		assert.equal(html.title, "Page Title");
		assert.equal(html.url, "https://example.com");
		assert.equal(html.contentType, "text/html");
		assert.match(html.content, /hello world/);
		assert.match(html.content, /next & more/);
		assert.doesNotMatch(html.content, /alert|secret|color|JS/);
		assert.equal(
			extractHtml("https://example.com", `<html><body>${"word ".repeat(1000)}</body></html>`, {
				maxContentChars: 100,
			}).truncated,
			true
		);
	});
});

describe("fetch_content handlers", () => {
	it("resolves handlers for supported and unsupported content families", () => {
		for (const type of ["html", "text", "markdown", "json", "csv", "xml", "yaml", "unsupported"] as const) {
			assert.equal(typeof getHandler(type).process, "function", `${type} should resolve to a handler`);
		}
	});

	it("handles HTML, plain text, and markdown", () => {
		const html = getHandler("html").process(
			"<html><head><title>My Page</title></head><body><script>var x=1;</script><style>.a{}</style><h1>Hello</h1><p>World</p></body></html>",
			"https://example.com"
		);
		assert.equal(html.title, "My Page");
		assert.match(html.content, /Hello/);
		assert.match(html.content, /World/);
		assert.doesNotMatch(html.content, /var x|\.a/);
		assert.equal(html.parseWarning, undefined);

		const text = getHandler("text").process("  hello   world  \n\n\n  foo  ", "https://example.com/t.txt");
		assert.match(text.content, /hello world/);
		assert.doesNotMatch(text.content, /\n\n\n/);

		const markdown = getHandler("markdown").process("# Title\n\nSome **bold** text", "https://example.com/readme.md");
		assert.match(markdown.content, /# Title/);
		assert.match(markdown.content, /\*\*bold\*\*/);
	});

	it("pretty-prints JSON, extracts useful JSON-LD, and falls back on invalid JSON", () => {
		const json = getHandler("json").process('{"name":"Alice","age":30}', "https://api.example.com/user");
		assert.equal(json.contentType, "application/json");
		assert.match(json.content, /"name": "Alice"/);
		assert.equal(json.parseWarning, undefined);

		const bigArray = getHandler("json").process(
			JSON.stringify(Array.from({ length: 200 }, (_, id) => ({ id }))),
			"https://api.example.com/list"
		);
		assert.match(bigArray.content, /more items/);
		assert.doesNotMatch(bigArray.content, /"id": 199/);

		const jsonLd = getHandler("json").process(
			JSON.stringify({
				"@context": "https://schema.org",
				"@type": "Article",
				headline: "My Great Article",
				description: "An article",
				author: { name: "Alice" },
				datePublished: "2024-01-15",
				articleBody: "Body text",
			}),
			"https://example.com/article"
		);
		assert.match(jsonLd.content, /Type: Article/);
		assert.match(jsonLd.content, /Title: My Great Article/);
		assert.match(jsonLd.content, /Author: Alice/);

		const invalid = getHandler("json").process("{invalid json here", "https://api.example.com/bad");
		assert.equal(invalid.parseWarning, "Invalid JSON, returned as plain text");
		assert.match(invalid.content, /invalid json here/);
	});

	it("converts CSV/TSV to markdown tables with row and column limits", () => {
		const csv = getHandler("csv").process(
			'name,desc\nAlice,"Lives in NYC, NY"\nBob,"Simple"',
			"https://example.com/data.csv"
		);
		assert.equal(csv.contentType, "text/csv");
		assert.match(csv.content, /\| name/);
		assert.match(csv.content, /Lives in NYC, NY/);

		const tsv = getHandler("csv").process("name\tage\nAlice\t30", "https://example.com/data.tsv");
		assert.equal(tsv.contentType, "text/tab-separated-values");
		assert.match(tsv.content, /\| Alice/);

		const rows = Array.from({ length: 200 }, (_, i) => `${i},val${i}`);
		const large = getHandler("csv").process(["id,value", ...rows].join("\n"), "https://example.com/big.csv");
		assert.match(large.content, /more rows truncated/);
		assert.doesNotMatch(large.content, /val199/);

		const wide = getHandler("csv").process(
			`${Array.from({ length: 30 }, (_, i) => `col${i}`).join(",")}\n${Array.from({ length: 30 }, (_, i) => `val${i}`).join(",")}`,
			"https://example.com/wide.csv"
		);
		assert.match(wide.content, /col0/);
		assert.match(wide.content, /col19/);
		assert.doesNotMatch(wide.content, /col29/);
	});

	it("handles XML/RSS/Atom/YAML and unsupported parse fallback", () => {
		const rss = getHandler("xml").process(
			"<rss><channel><title>My Blog</title><item><title>First Post</title><link>https://example.com/post1</link><description>Interesting things.</description></item></channel></rss>",
			"https://example.com/feed.xml"
		);
		assert.equal(rss.contentType, "application/rss+xml");
		assert.match(rss.content, /Feed: My Blog/);
		assert.match(rss.content, /First Post/);

		const atom = getHandler("xml").process(
			'<feed xmlns="http://www.w3.org/2005/Atom"><title>My Atom Feed</title><entry><title>Entry One</title><link href="https://example.com/entry1"/><summary>Summary</summary></entry></feed>',
			"https://example.com/atom.xml"
		);
		assert.equal(atom.contentType, "application/atom+xml");
		assert.match(atom.content, /Entry One/);

		const xml = getHandler("xml").process("  \n  <root><item>hello</item></root>  ", "https://example.com/test.xml");
		assert.equal(xml.contentType, "application/xml");
		assert.match(xml.content, /<item>hello<\/item>/);
		assert.doesNotMatch(xml.content, /\t/);

		const yaml = getHandler("yaml").process(
			"  name: Alice\n  age: 30\n\n  city: NYC  ",
			"https://example.com/config.yml"
		);
		assert.equal(yaml.contentType, "text/yaml");
		assert.match(yaml.content, /name: Alice/);

		assert.throws(() => getHandler("unsupported").process("data", "https://example.com/file.pdf"), /Unsupported/);
		const fallback = runHandler(
			getHandler("unsupported"),
			"some data",
			"https://example.com/file.pdf",
			"unsupported"
		);
		assert.equal(fallback.parseWarning, "Failed to process as unsupported, returned as plain text");
		assert.match(fallback.content, /some data/);

		const invalidJson = runHandler(getHandler("json"), "not json", "https://api.example.com", "json");
		assert.equal(invalidJson.parseWarning, "Invalid JSON, returned as plain text");
	});
});
