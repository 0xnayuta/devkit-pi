/**
 * Security Module Tests
 * Phase 1 — SSRF prevention for validatePublicHttpUrl
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getWebSecurityLimits,
  validatePublicHttpUrl,
} from "../../src/modules/web/security.ts";
import { DEFAULT_WEB_CONFIG } from "../../src/config/load-config.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
  it("rejects empty string", async () => {
    await assert.rejects(() => validatePublicHttpUrl(""), /Invalid URL/);
  });

  it("rejects malformed URL", async () => {
    await assert.rejects(() => validatePublicHttpUrl("not a url"), /Invalid URL/);
  });

  it("rejects ftp:// protocol", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("ftp://example.com/file"),
      /Unsupported URL protocol: ftp:/
    );
  });

  it("rejects file:// protocol", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("file:///etc/passwd"),
      /Unsupported URL protocol: file:/
    );
  });

  it("rejects javascript: pseudo-protocol", async () => {
    // new URL("javascript:...") parses successfully but protocol is "javascript:"
    await assert.rejects(
      () => validatePublicHttpUrl("javascript:alert(1)"),
      /Unsupported URL protocol: javascript:/
    );
  });
});

describe("security - validatePublicHttpUrl: blocked hostnames", () => {
  it("rejects localhost", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://localhost:3000"),
      /Blocked private hostname.*localhost/
    );
  });

  it("rejects localhost. (trailing dot)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://localhost./"),
      /Blocked private hostname/
    );
  });

  it("rejects subdomain of localhost (*.localhost)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://app.localhost:8080"),
      /Blocked private hostname/
    );
  });

  it("rejects *.local", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://myhost.local"),
      /Blocked private hostname/
    );
  });

  it("rejects *.internal", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://service.internal"),
      /Blocked private hostname/
    );
  });
});

describe("security - validatePublicHttpUrl: private IPv4 addresses", () => {
  it("rejects 0.0.0.0", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://0.0.0.0/"),
      /Blocked private address/
    );
  });

  it("rejects 10.x.x.x (class A private)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://10.0.0.1/"),
      /Blocked private address/
    );
  });

  it("rejects 10.255.255.255", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://10.255.255.255/"),
      /Blocked private address/
    );
  });

  it("rejects 127.0.0.1 (loopback)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://127.0.0.1/"),
      /Blocked private address/
    );
  });

  it("rejects 127.0.0.2", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://127.0.0.2/"),
      /Blocked private address/
    );
  });

  it("rejects 169.254.x.x (link-local)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://169.254.169.254/metadata"),
      /Blocked private address/
    );
  });

  it("rejects 172.16.x.x (class B private lower bound)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://172.16.0.1/"),
      /Blocked private address/
    );
  });

  it("rejects 172.31.x.x (class B private upper bound)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://172.31.255.255/"),
      /Blocked private address/
    );
  });

  it("rejects 192.168.x.x (class C private)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://192.168.1.1/"),
      /Blocked private address/
    );
  });

  it("rejects 100.64.x.x (carrier-grade NAT lower bound)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://100.64.0.1/"),
      /Blocked private address/
    );
  });

  it("rejects 100.127.x.x (carrier-grade NAT upper bound)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://100.127.255.255/"),
      /Blocked private address/
    );
  });

  it("rejects 224.0.0.1 (multicast)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://224.0.0.1/"),
      /Blocked private address/
    );
  });

  it("rejects 255.255.255.255 (broadcast)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://255.255.255.255/"),
      /Blocked private address/
    );
  });
});

describe("security - validatePublicHttpUrl: public IPv4 boundary", () => {
  // Public IPs bypass DNS lookup — just verify they are accepted.
  it("accepts 8.8.8.8 (public DNS)", async () => {
    const url = await validatePublicHttpUrl("http://8.8.8.8/");
    assert.equal(url.hostname, "8.8.8.8");
  });

  it("accepts 93.184.216.34 (example.com)", async () => {
    const url = await validatePublicHttpUrl("http://93.184.216.34/");
    assert.equal(url.hostname, "93.184.216.34");
  });

  it("accepts 1.1.1.1 (Cloudflare)", async () => {
    const url = await validatePublicHttpUrl("https://1.1.1.1/");
    assert.equal(url.hostname, "1.1.1.1");
    assert.equal(url.protocol, "https:");
  });
});

describe("security - validatePublicHttpUrl: private IPv6 addresses", () => {
  it("rejects [::1] (loopback)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://[::1]/"),
      /Blocked private address/
    );
  });

  it("rejects [::] (unspecified)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://[::]/"),
      /Blocked private address/
    );
  });

  it("rejects [fe80::1] (link-local)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://[fe80::1]/"),
      /Blocked private address/
    );
  });

  it("rejects [fc00::1] (unique local fc)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://[fc00::1]/"),
      /Blocked private address/
    );
  });

  it("rejects [fd00::1] (unique local fd)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://[fd00::1]/"),
      /Blocked private address/
    );
  });

  it("rejects [::ffff:127.0.0.1] (IPv4-mapped loopback)", async () => {
    // Node.js normalizes ::ffff:127.0.0.1 → ::ffff:7f00:1 in the URL hostname.
    // The hex groups 0x7f00:0x0001 encode 127.0.0.1 — must be detected.
    await assert.rejects(
      () => validatePublicHttpUrl("http://[::ffff:127.0.0.1]/"),
      /Blocked private address/
    );
  });

  it("rejects [::ffff:10.0.0.1] (IPv4-mapped class A private)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://[::ffff:10.0.0.1]/"),
      /Blocked private address/
    );
  });

  it("rejects [::ffff:192.168.1.1] (IPv4-mapped class C private)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://[::ffff:192.168.1.1]/"),
      /Blocked private address/
    );
  });

  it("rejects [::ffff:a9fe:a9fe] (hex form of 169.254.169.254)", async () => {
    // 169=0xa9, 254=0xfe → 0xa9fe:0xa9fe
    await assert.rejects(
      () => validatePublicHttpUrl("http://[::ffff:169.254.169.254]/"),
      /Blocked private address/
    );
  });

  it("accepts [::ffff:93.184.216.34] (IPv4-mapped public address)", async () => {
    const url = await validatePublicHttpUrl("http://[::ffff:93.184.216.34]/");
    assert.ok(url.hostname.includes("::ffff:"));
  });
});

describe("security - validatePublicHttpUrl: valid public URLs", () => {
  it("accepts public IP address directly", async () => {
    const url = await validatePublicHttpUrl("http://93.184.216.34/");
    assert.equal(url.hostname, "93.184.216.34");
    assert.equal(url.protocol, "http:");
  });

  it("accepts https:// public IP", async () => {
    const url = await validatePublicHttpUrl("https://93.184.216.34/");
    assert.equal(url.protocol, "https:");
  });

  it("returns a URL object with correct path, query, and hash", async () => {
    const url = await validatePublicHttpUrl("http://93.184.216.34:8080/path?q=1#hash");
    assert.equal(url.hostname, "93.184.216.34");
    assert.equal(url.port, "8080");
    assert.equal(url.pathname, "/path");
    assert.equal(url.search, "?q=1");
    assert.equal(url.hash, "#hash");
  });
});

describe("security - validatePublicHttpUrl: hostname DNS resolution", () => {
  // These tests use real DNS resolution for public hostnames.
  // They verify the happy path (public hostname → public IP) works end-to-end.
  it("accepts example.com (resolves to public IP)", async () => {
    const url = await validatePublicHttpUrl("http://example.com/");
    assert.equal(url.hostname, "example.com");
  });

  it("accepts https://example.com", async () => {
    const url = await validatePublicHttpUrl("https://example.com/");
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "example.com");
  });
});

describe("security - validatePublicHttpUrl: allowPrivateNetwork", () => {
  it("allows localhost when enabled", async () => {
    const url = await validatePublicHttpUrl("http://localhost:3000", {
      allowPrivateNetwork: true,
    });
    assert.equal(url.hostname, "localhost");
    assert.equal(url.port, "3000");
  });

  it("allows 127.0.0.1 when enabled", async () => {
    const url = await validatePublicHttpUrl("http://127.0.0.1:8080/api", {
      allowPrivateNetwork: true,
    });
    assert.equal(url.hostname, "127.0.0.1");
  });

  it("allows private 10.x.x.x when enabled", async () => {
    const url = await validatePublicHttpUrl("http://10.0.0.1/", {
      allowPrivateNetwork: true,
    });
    assert.equal(url.hostname, "10.0.0.1");
  });

  it("allows 192.168.x.x when enabled", async () => {
    const url = await validatePublicHttpUrl("http://192.168.1.100:3000", {
      allowPrivateNetwork: true,
    });
    assert.equal(url.hostname, "192.168.1.100");
  });

  it("allows .local hostname when enabled", async () => {
    const url = await validatePublicHttpUrl("http://myhost.local:8080", {
      allowPrivateNetwork: true,
    });
    assert.equal(url.hostname, "myhost.local");
  });

  it("still rejects invalid URL format even when enabled", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("not a url", { allowPrivateNetwork: true }),
      /Invalid URL/
    );
  });

  it("still rejects unsupported protocol even when enabled", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("ftp://localhost/file", { allowPrivateNetwork: true }),
      /Unsupported URL protocol: ftp:/
    );
  });

  it("still rejects file:// protocol even when enabled", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("file:///etc/passwd", { allowPrivateNetwork: true }),
      /Unsupported URL protocol: file:/
    );
  });

  it("blocks localhost by default (allowPrivateNetwork not set)", async () => {
    await assert.rejects(
      () => validatePublicHttpUrl("http://localhost:3000"),
      /Blocked private hostname/
    );
  });

  it("blocks localhost when explicitly false", async () => {
    await assert.rejects(
      () =>
        validatePublicHttpUrl("http://localhost:3000", { allowPrivateNetwork: false }),
      /Blocked private hostname/
    );
  });
});

describe("security - getWebSecurityLimits: allowPrivateNetwork", () => {
  it("defaults to false", () => {
    const limits = getWebSecurityLimits(DEFAULT_WEB_CONFIG);
    assert.equal(limits.allowPrivateNetwork, false);
  });
});
