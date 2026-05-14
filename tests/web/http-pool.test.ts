import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { HttpConnectionPool, resetConnectionPool } from "../../src/modules/web/http-pool.ts";

afterEach(() => {
	resetConnectionPool();
});

describe("HttpConnectionPool TLS defaults", () => {
	it("does not disable HTTPS certificate validation when created", () => {
		const pool = new HttpConnectionPool();
		try {
			const httpsAgent = (pool as unknown as { httpsAgent: { options: Record<string, unknown> } }).httpsAgent;
			assert.notEqual(httpsAgent.options.rejectUnauthorized, false);
		} finally {
			pool.destroy();
		}
	});

	it("does not disable HTTPS certificate validation after recreating agents", () => {
		const pool = new HttpConnectionPool();
		try {
			pool.updateConfig({ maxSockets: 20 });
			const httpsAgent = (pool as unknown as { httpsAgent: { options: Record<string, unknown> } }).httpsAgent;
			assert.notEqual(httpsAgent.options.rejectUnauthorized, false);
		} finally {
			pool.destroy();
		}
	});
});
