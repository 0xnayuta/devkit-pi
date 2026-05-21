import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPinnedLookup,
  fetchWithPinnedDns,
  resolveAndValidateAddresses,
} from "../../src/modules/web/network.ts";

describe("web/network resolveAndValidateAddresses", () => {
  it("returns literal IP directly without DNS lookup", async () => {
    let lookupCalled = false;
    const addresses = await resolveAndValidateAddresses(
      new URL("https://93.184.216.34/path"),
      { allowPrivateNetwork: false },
      {
        lookupImpl: async () => {
          lookupCalled = true;
          return [];
        },
      }
    );

    assert.equal(lookupCalled, false);
    assert.deepEqual(addresses, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("uses lookupImpl for hostname URLs", async () => {
    const addresses = await resolveAndValidateAddresses(
      new URL("https://example.com/path"),
      { allowPrivateNetwork: false },
      {
        lookupImpl: async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
        ],
      }
    );

    assert.deepEqual(addresses, [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
  });

  it("rejects private addresses returned by the pinning lookup", async () => {
    await assert.rejects(
      () =>
        resolveAndValidateAddresses(
          new URL("https://example.com/path"),
          { allowPrivateNetwork: false },
          {
            lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }],
          }
        ),
      /Blocked private address for example\.com: 127\.0\.0\.1/
    );
  });

  it("rejects mixed public and private lookup results", async () => {
    await assert.rejects(
      () =>
        resolveAndValidateAddresses(
          new URL("https://example.com/path"),
          { allowPrivateNetwork: false },
          {
            lookupImpl: async () => [
              { address: "93.184.216.34", family: 4 },
              { address: "169.254.169.254", family: 4 },
            ],
          }
        ),
      /Blocked private address for example\.com: 169\.254\.169\.254/
    );
  });

  it("rejects private IPv6 lookup results", async () => {
    await assert.rejects(
      () =>
        resolveAndValidateAddresses(
          new URL("https://example.com/path"),
          { allowPrivateNetwork: false },
          {
            lookupImpl: async () => [{ address: "::1", family: 6 }],
          }
        ),
      /Blocked private address for example\.com: ::1/
    );
  });

  it("allows private lookup results only when explicitly enabled", async () => {
    const addresses = await resolveAndValidateAddresses(
      new URL("https://example.com/path"),
      { allowPrivateNetwork: true },
      {
        lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }],
      }
    );

    assert.deepEqual(addresses, [{ address: "127.0.0.1", family: 4 }]);
  });

  it("rejects empty lookup results", async () => {
    await assert.rejects(
      () =>
        resolveAndValidateAddresses(
          new URL("https://example.com/path"),
          { allowPrivateNetwork: false },
          {
            lookupImpl: async () => [],
          }
        ),
      /Unable to resolve hostname: example\.com/
    );
  });

  it("normalizes lookup failures to stable DNS resolution errors", async () => {
    await assert.rejects(
      () =>
        resolveAndValidateAddresses(
          new URL("https://example.com/path"),
          { allowPrivateNetwork: false },
          {
            lookupImpl: async () => {
              throw new Error("ENOTFOUND");
            },
          }
        ),
      /Unable to resolve hostname: example\.com\. ENOTFOUND/
    );
  });

  it("normalizes IPv6 literals before validating and pinning", async () => {
    const addresses = await resolveAndValidateAddresses(
      new URL("https://[2606:2800:220:1:248:1893:25c8:1946]/path"),
      { allowPrivateNetwork: false },
      {
        lookupImpl: async () => {
          throw new Error("literal IP must not use DNS lookup");
        },
      }
    );

    assert.deepEqual(addresses, [
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
  });
});

describe("web/network createPinnedLookup", () => {
  it("returns only pinned addresses with round-robin selection", () => {
    const lookup = createPinnedLookup(new URL("https://example.com/path"), [
      { address: "93.184.216.34", family: 4 },
      { address: "93.184.216.35", family: 4 },
    ]);

    const calls: Array<{ address: string; family: number }> = [];
    lookup("example.com", { family: 4 }, (error, address, family) => {
      assert.equal(error, null);
      calls.push({ address, family });
    });
    lookup("example.com", { family: "IPv4" }, (error, address, family) => {
      assert.equal(error, null);
      calls.push({ address, family });
    });

    assert.deepEqual(calls, [
      { address: "93.184.216.34", family: 4 },
      { address: "93.184.216.35", family: 4 },
    ]);
  });

  it("returns pinned address arrays for all:true lookup calls", () => {
    const lookup = createPinnedLookup(new URL("https://example.com/path"), [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);

    lookup("example.com", { all: true }, (error, addresses) => {
      assert.equal(error, null);
      assert.deepEqual(addresses, [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ]);
    });
  });

  it("filters pinned address arrays by family for all:true lookup calls", () => {
    const lookup = createPinnedLookup(new URL("https://example.com/path"), [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);

    lookup("example.com", { all: true, family: 6 }, (error, addresses) => {
      assert.equal(error, null);
      assert.deepEqual(addresses, [{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }]);
    });
  });

  it("rejects hostname mismatch", () => {
    const lookup = createPinnedLookup(new URL("https://example.com/path"), [
      { address: "93.184.216.34", family: 4 },
    ]);

    lookup("evil.example", { family: 4 }, (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /hostname mismatch/i);
    });
  });

  it("normalizes bracketed IPv6 hostnames before matching", () => {
    const lookup = createPinnedLookup(new URL("https://[2606:2800:220:1:248:1893:25c8:1946]/path"), [
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);

    lookup("2606:2800:220:1:248:1893:25c8:1946", { family: 6 }, (error, address, family) => {
      assert.equal(error, null);
      assert.equal(address, "2606:2800:220:1:248:1893:25c8:1946");
      assert.equal(family, 6);
    });
  });
});

describe("web/network fetchWithPinnedDns", () => {
  function lifecycleDependencies() {
    let closeCount = 0;
    const dispatcher = {
      async close() {
        closeCount += 1;
      },
    };

    return {
      get closeCount() {
        return closeCount;
      },
      dispatcher,
      lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
      createDispatcher: () => dispatcher,
    };
  }

  it("passes dispatcher from createDispatcher into fetchImpl", async () => {
    const dispatcher = {} as RequestInit["dispatcher"];

    let receivedDispatcher: unknown;
    const response = await fetchWithPinnedDns(
      "https://example.com/api",
      {
        method: "GET",
        timeoutMs: 1000,
        allowPrivateNetwork: false,
      },
      {
        lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
        createDispatcher: () => dispatcher,
        fetchImpl: async (_input, init) => {
          receivedDispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher;
          return new Response("ok", { status: 200 });
        },
      }
    );

    assert.equal(response.status, 200);
    assert.equal(receivedDispatcher, dispatcher);
  });

  it("creates default pinned dispatcher when factory not provided", async () => {
    let initSeen: RequestInit & Record<string, unknown> = {};

    await fetchWithPinnedDns(
      "https://example.com/api",
      {
        method: "GET",
        timeoutMs: 1234,
        allowPrivateNetwork: false,
      },
      {
        lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
        fetchImpl: async (_input, init) => {
          initSeen = (init ?? {}) as RequestInit & Record<string, unknown>;
          return new Response("ok", { status: 200 });
        },
      }
    );

    assert.ok("dispatcher" in initSeen);
  });

  it("does not leak internal fields into fetch init", async () => {
    let initSeen: RequestInit & Record<string, unknown> = {};

    await fetchWithPinnedDns(
      "https://example.com/api",
      {
        method: "POST",
        timeoutMs: 1234,
        allowPrivateNetwork: false,
        headers: { "x-test": "1" },
      },
      {
        lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
        fetchImpl: async (_input, init) => {
          initSeen = (init ?? {}) as RequestInit & Record<string, unknown>;
          return new Response("ok", { status: 200 });
        },
      }
    );

    assert.equal(initSeen.method, "POST");
    assert.equal((initSeen.headers as Record<string, string>)["x-test"], "1");
    assert.equal("timeoutMs" in initSeen, false);
    assert.equal("allowPrivateNetwork" in initSeen, false);
  });

  it("preserves key fetch response metadata when wrapping the body", async () => {
    const dependencies = lifecycleDependencies();
    const upstream = new Response("ok", {
      status: 201,
      statusText: "Created",
      headers: { "x-test": "1" },
    });
    Object.defineProperty(upstream, "url", {
      configurable: true,
      value: "https://example.com/api",
    });
    Object.defineProperty(upstream, "redirected", { configurable: true, value: true });
    Object.defineProperty(upstream, "type", { configurable: true, value: "cors" });

    const response = await fetchWithPinnedDns(
      "https://example.com/api",
      {
        method: "GET",
        timeoutMs: 1000,
        allowPrivateNetwork: false,
      },
      {
        ...dependencies,
        fetchImpl: async () => upstream,
      }
    );

    assert.equal(response.status, 201);
    assert.equal(response.statusText, "Created");
    assert.equal(response.headers.get("x-test"), "1");
    assert.equal(response.url, "https://example.com/api");
    assert.equal(response.redirected, true);
    assert.equal(response.type, "cors");
    assert.equal(response.bodyUsed, false);
    assert.equal(await response.text(), "ok");
    assert.equal(response.bodyUsed, true);
    assert.equal(dependencies.closeCount, 1);
  });

  it("closes the dispatcher after the response body is fully read", async () => {
    const dependencies = lifecycleDependencies();
    const response = await fetchWithPinnedDns(
      "https://example.com/api",
      {
        method: "GET",
        timeoutMs: 1000,
        allowPrivateNetwork: false,
      },
      {
        ...dependencies,
        fetchImpl: async () => new Response("ok", { status: 200 }),
      }
    );

    assert.equal(dependencies.closeCount, 0);
    assert.equal(await response.text(), "ok");
    assert.equal(dependencies.closeCount, 1);
  });

  it("closes the dispatcher when the response body is cancelled", async () => {
    const dependencies = lifecycleDependencies();
    const response = await fetchWithPinnedDns(
      "https://example.com/api",
      {
        method: "GET",
        timeoutMs: 1000,
        allowPrivateNetwork: false,
      },
      {
        ...dependencies,
        fetchImpl: async () => new Response("ok", { status: 200 }),
      }
    );

    await response.body?.cancel();
    assert.equal(dependencies.closeCount, 1);
  });

  it("closes the dispatcher when response body reading fails", async () => {
    const dependencies = lifecycleDependencies();
    const failingBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("body read failed"));
      },
    });

    const response = await fetchWithPinnedDns(
      "https://example.com/api",
      {
        method: "GET",
        timeoutMs: 1000,
        allowPrivateNetwork: false,
      },
      {
        ...dependencies,
        fetchImpl: async () => new Response(failingBody, { status: 200 }),
      }
    );

    await assert.rejects(() => response.text(), /body read failed/);
    assert.equal(dependencies.closeCount, 1);
  });

  it("closes the dispatcher immediately for responses without a body", async () => {
    const dependencies = lifecycleDependencies();
    const response = await fetchWithPinnedDns(
      "https://example.com/api",
      {
        method: "GET",
        timeoutMs: 1000,
        allowPrivateNetwork: false,
      },
      {
        ...dependencies,
        fetchImpl: async () => new Response(null, { status: 204 }),
      }
    );

    assert.equal(response.status, 204);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(dependencies.closeCount, 1);
  });

  it("closes the dispatcher when fetch throws before returning a response", async () => {
    const dependencies = lifecycleDependencies();

    await assert.rejects(
      () =>
        fetchWithPinnedDns(
          "https://example.com/api",
          {
            method: "GET",
            timeoutMs: 1000,
            allowPrivateNetwork: false,
          },
          {
            ...dependencies,
            fetchImpl: async () => {
              throw new Error("network failure");
            },
          }
        ),
      /network failure/
    );

    assert.equal(dependencies.closeCount, 1);
  });

  it("disposes the dispatcher at most once", async () => {
    const dependencies = lifecycleDependencies();
    const response = await fetchWithPinnedDns(
      "https://example.com/api",
      {
        method: "GET",
        timeoutMs: 1000,
        allowPrivateNetwork: false,
      },
      {
        ...dependencies,
        fetchImpl: async () => new Response("ok", { status: 200 }),
      }
    );

    assert.equal(await response.text(), "ok");
    await response.body?.cancel().catch(() => undefined);
    assert.equal(dependencies.closeCount, 1);
  });
});
