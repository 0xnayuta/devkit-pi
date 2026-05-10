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

	it("rejects non-http URLs", async () => {
		const result = await fetchContent({ url: "file:///etc/passwd" }, mergeWebConfig({}));
		assert.equal("error" in result, true);
		if ("error" in result) {
			assert.equal(result.error.code, "FETCH_CONTENT_FAILED");
			assert.match(result.error.message, /Unsupported URL protocol/);
		}
	});

	it("rejects localhost URLs before fetching", async () => {
		const result = await fetchContent({ url: "http://localhost:3000" }, mergeWebConfig({}));
		assert.equal("error" in result, true);
		if ("error" in result) {
			assert.equal(result.error.code, "FETCH_CONTENT_FAILED");
			assert.match(result.error.message, /Blocked private hostname/);
		}
	});

	it("rejects bracketed ipv6 loopback", async () => {
		const result = await fetchContent({ url: "http://[::1]/" }, mergeWebConfig({}));
		assert.equal("error" in result, true);
		if ("error" in result) {
			assert.equal(result.error.code, "FETCH_CONTENT_FAILED");
			assert.match(result.error.message, /Blocked private address/);
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
	// D.4: Content type restrictions
	// ============================================================================

	it("rejects application/json content type", async () => {
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

		assert.equal("error" in result, true);
		if ("error" in result) {
			assert.equal(result.error.code, "FETCH_CONTENT_FAILED");
			assert.match(result.error.message, /Unsupported content type/i);
		}
	});

	it("rejects image/png content type", async () => {
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
			assert.equal(result.error.code, "FETCH_CONTENT_FAILED");
			assert.match(result.error.message, /Unsupported content type/i);
		}
	});

	it("rejects application/octet-stream content type", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("binary data here", {
					status: 200,
					headers: { "content-type": "application/octet-stream" },
				})
			)) as typeof fetch;

		const result = await fetchContent(
			{ url: "https://93.184.216.34/binary" },
			mergeWebConfig({})
		);

		assert.equal("error" in result, true);
		if ("error" in result) {
			assert.equal(result.error.code, "FETCH_CONTENT_FAILED");
			assert.match(result.error.message, /Unsupported content type/i);
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
});
