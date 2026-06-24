/**
 * Security Module Tests
 * Phase 3 — table-driven SSRF prevention coverage
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_WEB_CONFIG } from "../../src/config/load-config.ts";
import { getWebSecurityLimits, validatePublicHttpUrl } from "../../src/modules/web/security.ts";

async function expectRejects(url: string, pattern: RegExp, options?: { allowPrivateNetwork?: boolean }) {
	await assert.rejects(() => validatePublicHttpUrl(url, options), pattern);
}

describe("security - getWebSecurityLimits", () => {
	it("extracts limit fields from config", () => {
		const limits = getWebSecurityLimits(DEFAULT_WEB_CONFIG);
		assert.equal(limits.timeoutMs, DEFAULT_WEB_CONFIG.timeoutMs);
		assert.equal(limits.maxResponseBytes, DEFAULT_WEB_CONFIG.maxResponseBytes);
		assert.equal(limits.maxContentChars, DEFAULT_WEB_CONFIG.maxContentChars);
		assert.equal(limits.maxResults, DEFAULT_WEB_CONFIG.maxResults);
	});
});

describe("security - validatePublicHttpUrl: invalid URLs", () => {
	const cases = [
		{ name: "empty string", url: "", pattern: /Invalid URL/ },
		{ name: "malformed URL", url: "not a url", pattern: /Invalid URL/ },
		{ name: "ftp protocol", url: "ftp://example.com/file", pattern: /Unsupported URL protocol: ftp:/ },
		{ name: "file protocol", url: "file:///etc/passwd", pattern: /Unsupported URL protocol: file:/ },
		{
			name: "javascript pseudo protocol",
			url: "javascript:alert(1)",
			pattern: /Unsupported URL protocol: javascript:/,
		},
	] as const;

	for (const t of cases) {
		it(`rejects ${t.name}`, async () => {
			await expectRejects(t.url, t.pattern);
		});
	}
});

describe("security - validatePublicHttpUrl: blocked hostnames", () => {
	const cases = [
		{ name: "localhost", url: "http://localhost:3000", pattern: /Blocked private hostname.*localhost/ },
		{ name: "localhost. with trailing dot", url: "http://localhost./", pattern: /Blocked private hostname/ },
		{ name: "subdomain of localhost", url: "http://app.localhost:8080", pattern: /Blocked private hostname/ },
		{ name: "*.local", url: "http://myhost.local", pattern: /Blocked private hostname/ },
		{ name: "*.internal", url: "http://service.internal", pattern: /Blocked private hostname/ },
	] as const;

	for (const t of cases) {
		it(`rejects ${t.name}`, async () => {
			await expectRejects(t.url, t.pattern);
		});
	}
});

describe("security - validatePublicHttpUrl: private IPv4 addresses", () => {
	const cases = [
		"http://0.0.0.0/",
		"http://10.0.0.1/",
		"http://10.255.255.255/",
		"http://127.0.0.1/",
		"http://127.0.0.2/",
		"http://169.254.169.254/metadata",
		"http://172.16.0.1/",
		"http://172.31.255.255/",
		"http://192.168.1.1/",
		"http://100.64.0.1/",
		"http://100.127.255.255/",
		"http://224.0.0.1/",
		"http://255.255.255.255/",
	] as const;

	for (const url of cases) {
		it(`rejects ${url}`, async () => {
			await expectRejects(url, /Blocked private address/);
		});
	}
});

describe("security - validatePublicHttpUrl: public IPv4 boundary", () => {
	const cases = [
		{ url: "http://8.8.8.8/", host: "8.8.8.8", protocol: "http:" },
		{ url: "http://93.184.216.34/", host: "93.184.216.34", protocol: "http:" },
		{ url: "https://1.1.1.1/", host: "1.1.1.1", protocol: "https:" },
	] as const;

	for (const t of cases) {
		it(`accepts ${t.url}`, async () => {
			const parsed = await validatePublicHttpUrl(t.url);
			assert.equal(parsed.hostname, t.host);
			assert.equal(parsed.protocol, t.protocol);
		});
	}
});

describe("security - validatePublicHttpUrl: private IPv6 addresses", () => {
	const rejectCases = [
		"http://[::1]/",
		"http://[::]/",
		"http://[fe80::1]/",
		"http://[fc00::1]/",
		"http://[fd00::1]/",
		"http://[::ffff:127.0.0.1]/",
		"http://[::ffff:10.0.0.1]/",
		"http://[::ffff:192.168.1.1]/",
		"http://[::ffff:169.254.169.254]/",
	] as const;

	for (const url of rejectCases) {
		it(`rejects ${url}`, async () => {
			await expectRejects(url, /Blocked private address/);
		});
	}

	it("accepts IPv4-mapped public address", async () => {
		const parsed = await validatePublicHttpUrl("http://[::ffff:93.184.216.34]/");
		assert.ok(parsed.hostname.includes("::ffff:"));
	});
});

describe("security - validatePublicHttpUrl: valid public URLs", () => {
	it("accepts public IPv4 over http and https", async () => {
		const http = await validatePublicHttpUrl("http://93.184.216.34/");
		const https = await validatePublicHttpUrl("https://93.184.216.34/");
		assert.equal(http.hostname, "93.184.216.34");
		assert.equal(http.protocol, "http:");
		assert.equal(https.protocol, "https:");
	});

	it("returns URL object with path/query/hash", async () => {
		const parsed = await validatePublicHttpUrl("http://93.184.216.34:8080/path?q=1#hash");
		assert.equal(parsed.hostname, "93.184.216.34");
		assert.equal(parsed.port, "8080");
		assert.equal(parsed.pathname, "/path");
		assert.equal(parsed.search, "?q=1");
		assert.equal(parsed.hash, "#hash");
	});
});

describe("security - validatePublicHttpUrl: hostname DNS resolution", () => {
	const cases = [
		{ url: "http://example.com/", host: "example.com", protocol: "http:" },
		{ url: "https://example.com/", host: "example.com", protocol: "https:" },
	] as const;

	for (const t of cases) {
		it(`accepts ${t.url}`, async () => {
			const parsed = await validatePublicHttpUrl(t.url);
			assert.equal(parsed.hostname, t.host);
			assert.equal(parsed.protocol, t.protocol);
		});
	}
});

describe("security - validatePublicHttpUrl: allowPrivateNetwork", () => {
	const allowCases = [
		{ url: "http://localhost:3000", host: "localhost" },
		{ url: "http://127.0.0.1:8080/api", host: "127.0.0.1" },
		{ url: "http://10.0.0.1/", host: "10.0.0.1" },
		{ url: "http://192.168.1.100:3000", host: "192.168.1.100" },
		{ url: "http://myhost.local:8080", host: "myhost.local" },
	] as const;

	for (const t of allowCases) {
		it(`allows ${t.url} when enabled`, async () => {
			const parsed = await validatePublicHttpUrl(t.url, { allowPrivateNetwork: true });
			assert.equal(parsed.hostname, t.host);
		});
	}

	const stillRejectCases = [
		{ name: "invalid URL", url: "not a url", pattern: /Invalid URL/ },
		{ name: "unsupported ftp protocol", url: "ftp://localhost/file", pattern: /Unsupported URL protocol: ftp:/ },
		{ name: "unsupported file protocol", url: "file:///etc/passwd", pattern: /Unsupported URL protocol: file:/ },
	] as const;

	for (const t of stillRejectCases) {
		it(`still rejects ${t.name} when enabled`, async () => {
			await expectRejects(t.url, t.pattern, { allowPrivateNetwork: true });
		});
	}

	it("blocks localhost by default and when explicitly false", async () => {
		await expectRejects("http://localhost:3000", /Blocked private hostname/);
		await expectRejects("http://localhost:3000", /Blocked private hostname/, {
			allowPrivateNetwork: false,
		});
	});
});

describe("security - getWebSecurityLimits: allowPrivateNetwork", () => {
	it("defaults to false", () => {
		const limits = getWebSecurityLimits(DEFAULT_WEB_CONFIG);
		assert.equal(limits.allowPrivateNetwork, false);
	});
});
