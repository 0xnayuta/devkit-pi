import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { fetchContent } from "../../src/modules/web/fetch.ts";

const mergeWebConfig = (config: Parameters<typeof mergeConfig>[0]) => mergeConfig(config).web;

const originalFetch = globalThis.fetch;

describe("fetch_content", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns a structured error when URL is missing", async () => {
		const result = await fetchContent({}, mergeWebConfig({}));
		assert.deepEqual(result, {
			error: {
				code: "INVALID_INPUT",
				message: "fetch_content requires url or urls",
			},
		});
	});

	it("rejects private URLs and returns structured error", async () => {
		const r1 = await fetchContent({ url: "file:///etc/passwd" }, mergeWebConfig({}));
		assert.equal("error" in r1, true);
		if ("error" in r1) {
			assert.equal(r1.error.code, "CONTENT_FETCH_INVALID_URL");
		}

		const r2 = await fetchContent({ url: "http://localhost:3000" }, mergeWebConfig({}));
		assert.equal("error" in r2, true);
		if ("error" in r2) {
			assert.equal(r2.error.code, "CONTENT_FETCH_FAILED");
		}

		const r3 = await fetchContent({ url: "http://[::1]/" }, mergeWebConfig({}));
		assert.equal("error" in r3, true);
		if ("error" in r3) {
			assert.equal(r3.error.code, "CONTENT_FETCH_FAILED");
		}
	});

	it("maps malformed URLs to CONTENT_FETCH_INVALID_URL", async () => {
		const result = await fetchContent({ url: "not a url" }, mergeWebConfig({}));
		assert.equal("error" in result, true);
		if ("error" in result) {
			assert.equal(result.error.code, "CONTENT_FETCH_INVALID_URL");
			assert.match(result.error.message, /Invalid URL/);
		}
	});

	it("extracts text from HTML and truncates tool output", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response(
					"<html><head><title>Hello</title></head><body><script>x</script><h1>Hello</h1><p>World</p></body></html>",
					{
						status: 200,
						headers: { "content-type": "text/html" },
					}
				)
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/page" },
			mergeWebConfig({ web: { maxContentChars: 8 } })
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.equal(result.results[0].title, "Hello");
			assert.equal(result.results[0].content, "Hello He");
			assert.equal(result.results[0].truncated, true);
		}
	});

	it("falls back to Jina reader for JS-heavy pages when enabled", async () => {
		const calls: string[] = [];

		globalThis.fetch = ((input: string | URL) => {
			const url = String(input);
			calls.push(url);
			if (url.startsWith("https://r.jina.ai/")) {
				return Promise.resolve(
					new Response(
						"Markdown Content:\n# Better Title\n\nThis is useful extracted content from Jina.",
						{
							status: 200,
							headers: { "content-type": "text/plain" },
						}
					)
				);
			}

			return Promise.resolve(
				new Response(
					"<html><head><title>Stub</title></head><body><script>a</script><script>b</script><script>c</script><script>d</script><div id='app'></div></body></html>",
					{
						status: 200,
						headers: { "content-type": "text/html" },
					}
				)
			);
		}) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/js" },
			mergeWebConfig({ web: { enableJinaFallback: true } })
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.equal(result.results[0].title, "Better Title");
			assert.match(result.results[0].content, /useful extracted content/i);
			assert.equal(result.results[0].contentType, "text/markdown; source=jina");
		}

		assert.equal(calls.some((c) => c.startsWith("https://r.jina.ai/")), true);
	});

	it("triggers Jina when preferReader is true for normal HTML", async () => {
		const calls: string[] = [];

		globalThis.fetch = ((input: string | URL) => {
			const url = String(input);
			calls.push(url);
			if (url.startsWith("https://r.jina.ai/")) {
				return Promise.resolve(
					new Response("Markdown Content:\n# Jina Title\n\nReader content.", {
						status: 200,
						headers: { "content-type": "text/plain" },
					})
				);
			}

			return Promise.resolve(
				new Response(
					"<html><head><title>Original</title></head><body><p>This is a normal page with plenty of content so it would not trigger Jina automatically.</p></body></html>",
					{
						status: 200,
						headers: { "content-type": "text/html" },
					}
				)
			);
		}) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/page", preferReader: true },
			mergeWebConfig({ web: { enableJinaFallback: true } })
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.equal(result.results[0].title, "Jina Title");
			assert.match(result.results[0].content, /Reader content/);
		}
		assert.equal(calls.some((c) => c.startsWith("https://r.jina.ai/")), true);
	});

	it("does not trigger Jina when jinaTriggers is empty", async () => {
		const calls: string[] = [];

		globalThis.fetch = ((input: string | URL) => {
			const url = String(input);
			calls.push(url);
			if (url.startsWith("https://r.jina.ai/")) {
				return Promise.resolve(
					new Response("Markdown Content:\n# Jina", {
						status: 200,
						headers: { "content-type": "text/plain" },
					})
				);
			}

			return Promise.resolve(
				new Response(
					"<html><body><script>a</script><script>b</script><script>c</script><script>d</script></body></html>",
					{
						status: 200,
						headers: { "content-type": "text/html" },
					}
				)
			);
		}) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/js" },
			mergeWebConfig({ web: { enableJinaFallback: true, jinaTriggers: [] } })
		);

		assert.equal("responseId" in result, true);
		// Jina should NOT be called because jinaTriggers is empty
		assert.equal(calls.some((c) => c.startsWith("https://r.jina.ai/")), false);
	});

	it("does not trigger Jina when preferReader is false and no automatic trigger", async () => {
		const calls: string[] = [];

		globalThis.fetch = ((input: string | URL) => {
			const url = String(input);
			calls.push(url);
			if (url.startsWith("https://r.jina.ai/")) {
				return Promise.resolve(
					new Response("Markdown Content:\n# Jina", {
						status: 200,
						headers: { "content-type": "text/plain" },
					})
				);
			}

			return Promise.resolve(
				new Response(
					"<html><head><title>Good</title></head><body><p>" + "content ".repeat(200) + "</p></body></html>",
					{
						status: 200,
						headers: { "content-type": "text/html" },
					}
				)
			);
		}) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/page", preferReader: false },
			mergeWebConfig({ web: { enableJinaFallback: true } })
		);

		assert.equal("responseId" in result, true);
		// No automatic trigger, preferReader is false — Jina should not be called
		assert.equal(calls.some((c) => c.startsWith("https://r.jina.ai/")), false);
	});

	it("does not send private network URLs to Jina even when automatic fallback triggers", async () => {
		const calls: string[] = [];

		globalThis.fetch = ((input: string | URL) => {
			const url = String(input);
			calls.push(url);
			if (url.startsWith("https://r.jina.ai/")) {
				return Promise.resolve(
					new Response("Markdown Content:\n# Should not happen", {
						status: 200,
						headers: { "content-type": "text/plain" },
					})
				);
			}

			return Promise.resolve(
				new Response("<html><body><div id='app'></div></body></html>", {
					status: 200,
					headers: { "content-type": "text/html" },
				})
			);
		}) as typeof fetch;

		const result = await fetchContent(
			{ url: "http://localhost:3000/app" },
			mergeWebConfig({ web: { allowPrivateNetwork: true, enableJinaFallback: true } })
		);

		assert.equal("responseId" in result, true);
		assert.equal(calls.some((c) => c.startsWith("https://r.jina.ai/")), false);
	});

	it("does not send private network URLs to Jina when preferReader is true", async () => {
		const calls: string[] = [];

		globalThis.fetch = ((input: string | URL) => {
			const url = String(input);
			calls.push(url);
			if (url.startsWith("https://r.jina.ai/")) {
				return Promise.resolve(
					new Response("Markdown Content:\n# Should not happen", {
						status: 200,
						headers: { "content-type": "text/plain" },
					})
				);
			}

			return Promise.resolve(
				new Response("<html><head><title>Local</title></head><body><p>Local content</p></body></html>", {
					status: 200,
					headers: { "content-type": "text/html" },
				})
			);
		}) as typeof fetch;

		const result = await fetchContent(
			{ url: "http://127.0.0.1:3000/page", preferReader: true },
			mergeWebConfig({ web: { allowPrivateNetwork: true, enableJinaFallback: true } })
		);

		assert.equal("responseId" in result, true);
		assert.equal(calls.some((c) => c.startsWith("https://r.jina.ai/")), false);
	});

	it("limits the number of response bytes read from Jina", async () => {
		globalThis.fetch = ((input: string | URL) => {
			const url = String(input);
			if (url.startsWith("https://r.jina.ai/")) {
				return Promise.resolve(
					new Response("Markdown Content:\n# Jina Title\n\n" + "x".repeat(100), {
						status: 200,
						headers: { "content-type": "text/plain" },
					})
				);
			}

			return Promise.resolve(
				new Response("<html><body><p>Normal page with enough content.</p></body></html>", {
					status: 200,
					headers: { "content-type": "text/html" },
				})
			);
		}) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/page", preferReader: true },
			mergeWebConfig({ web: { enableJinaFallback: true, maxResponseBytes: 35 } })
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.equal(result.results[0].content.length <= 35, true);
			assert.equal(result.results[0].truncated, true);
		}
	});

	it("limits the number of response bytes read", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("0123456789", {
					status: 200,
					headers: { "content-type": "text/plain" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/text" },
			mergeWebConfig({ web: { maxResponseBytes: 5, maxContentChars: 100 } })
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.equal(result.results[0].content, "01234");
			assert.equal(result.results[0].truncated, true);
		}
	});

	// ============================================================================
	// D.4: Content type restrictions (updated for Phase 1)
	// ============================================================================

	it("accepts application/json content type", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response('{"key": "value"}', {
					status: 200,
					headers: { "content-type": "application/json" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/api" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.match(result.results[0].content, /"key"/);
		}
	});

	it("rejects image/png with binary magic bytes detection", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("\x89PNG\r\n\x1a\n", {
					status: 200,
					headers: { "content-type": "image/png" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/image.png" },
			mergeWebConfig({})
		);

		assert.equal("error" in result, true);
		if ("error" in result) {
			assert.equal(result.error.code, "CONTENT_FETCH_FAILED");
		}
	});

	it("falls back to text for application/octet-stream with no known extension", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("some text content", {
					status: 200,
					headers: { "content-type": "application/octet-stream" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/binary" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.equal(result.results[0].content, "some text content");
		}
	});

	// ============================================================================
	// Phase 1: URL extension fallback & content type detection
	// ============================================================================

	it("identifies JSON via URL extension when Content-Type is generic", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response('{"hello": "world"}', {
					status: 200,
					headers: { "content-type": "application/octet-stream" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/data.json" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.match(result.results[0].content, /hello/);
		}
	});

	it("identifies Markdown via URL extension when Content-Type is text/plain", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("# Hello\n\nThis is markdown", {
					status: 200,
					headers: { "content-type": "text/plain" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/docs/readme.md" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.match(result.results[0].content, /Hello/);
		}
	});

	it("identifies JSON via URL extension when Content-Type is text/plain", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response('{"hello":"world"}', {
					status: 200,
					headers: { "content-type": "text/plain" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/data.json" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.match(result.results[0].content, /"hello": "world"/);
			assert.equal(result.results[0].contentType, "application/json");
		}
	});

	it("identifies CSV via URL extension when Content-Type is text/plain", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("name,age\nAda,36", {
					status: 200,
					headers: { "content-type": "text/plain" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/table.csv" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.match(result.results[0].content, /\| name/);
			assert.equal(result.results[0].contentType, "text/csv");
		}
	});

	it("identifies XML/RSS via URL extension when Content-Type is text/plain", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("<rss><channel><title>Feed</title><item><title>One</title></item></channel></rss>", {
					status: 200,
					headers: { "content-type": "text/plain" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/feed.xml" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.match(result.results[0].content, /Feed: Feed/);
			assert.equal(result.results[0].contentType, "application/rss+xml");
		}
	});

	it("rejects .pdf files with clear unsupported message", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("%PDF-1.4 fake content", {
					status: 200,
					headers: { "content-type": "application/octet-stream" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/document.pdf" },
			mergeWebConfig({})
		);

		assert.equal("error" in result, true);
		if ("error" in result) {
			assert.equal(result.error.code, "CONTENT_FETCH_FAILED");
			assert.match(result.error.message, /\.pdf/);
			assert.match(result.error.message, /not supported/i);
		}
	});

	it("rejects .docx files with clear unsupported message", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("PK\x03\x04 fake docx", {
					status: 200,
					headers: { "content-type": "application/octet-stream" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/report.docx" },
			mergeWebConfig({})
		);

		assert.equal("error" in result, true);
		if ("error" in result) {
			assert.equal(result.error.code, "CONTENT_FETCH_FAILED");
			assert.match(result.error.message, /\.docx/);
		}
	});

	it("rejects binary content via magic bytes when extension is unknown", async () => {
		// Use Uint8Array to preserve raw binary bytes (string would UTF-8 encode them)
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response(
					new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
					{
						status: 200,
						headers: { "content-type": "application/octet-stream" },
					}
				)
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/unknown" },
			mergeWebConfig({})
		);

		assert.equal("error" in result, true);
		if ("error" in result) {
			assert.equal(result.error.code, "CONTENT_FETCH_FAILED");
			assert.match(result.error.message, /Binary content detected/i);
		}
	});

	it("rejects MP4 magic bytes at ftyp offset", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response(new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]), {
					status: 200,
					headers: { "content-type": "application/octet-stream" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/video" },
			mergeWebConfig({})
		);

		assert.equal("error" in result, true);
		if ("error" in result) {
			assert.equal(result.error.code, "CONTENT_FETCH_FAILED");
			assert.match(result.error.message, /Binary content detected/i);
		}
	});

	it("accepts text/* subtypes via header fallback", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("custom text content", {
					status: 200,
					headers: { "content-type": "text/x-custom-type" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/custom" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.equal(result.results[0].content, "custom text content");
		}
	});

	it("identifies source code via URL extension (.js)", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("console.log('hello');", {
					status: 200,
					headers: { "content-type": "application/octet-stream" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/app.js" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.match(result.results[0].content, /console\.log/);
		}
	});

	it("accepts application/vnd.api+json via header detection", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response('{"data": []}', {
					status: 200,
					headers: { "content-type": "application/vnd.api+json" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/api/v2" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.match(result.results[0].content, /data/);
		}
	});

	it("accepts text/plain content type", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("Plain text content", {
					status: 200,
					headers: { "content-type": "text/plain; charset=utf-8" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/plain.txt" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.equal(result.results[0].content, "Plain text content");
		}
	});

	it("accepts text/html content type", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("<html><body>HTML content</body></html>", {
					status: 200,
					headers: { "content-type": "text/html; charset=utf-8" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/page.html" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.match(result.results[0].content, /HTML content/i);
		}
	});

	it("handles content-type with charset parameter", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("UTF-8 text", {
					status: 200,
					headers: { "content-type": "text/plain; charset=UTF-8" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/utf8.txt" },
			mergeWebConfig({})
		);

		assert.equal("responseId" in result, true);
	});

	// ============================================================================
	// Phase 4: allowPrivateNetwork
	// ============================================================================

	it("allows localhost when allowPrivateNetwork is true", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("local dev server content", {
					status: 200,
					headers: { "content-type": "text/plain" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "http://localhost:3000/api" },
			mergeWebConfig({ web: { allowPrivateNetwork: true } })
		);

		assert.equal("responseId" in result, true);
		if ("responseId" in result) {
			assert.equal(result.results[0].content, "local dev server content");
		}
	});

	it("still blocks localhost when allowPrivateNetwork is false", async () => {
		const result = await fetchContent(
			{ url: "http://localhost:3000/api" },
			mergeWebConfig({ web: { allowPrivateNetwork: false } })
		);

		assert.equal("error" in result, true);
	});

	it("still blocks localhost by default", async () => {
		const result = await fetchContent(
			{ url: "http://localhost:3000/api" },
			mergeWebConfig({})
		);

		assert.equal("error" in result, true);
	});
});
