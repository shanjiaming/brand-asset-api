import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { normalizeDomain, extractBrandFromHtml, fetchBrandAssets } from "../src/extractor.mjs";
import { createAppHandler } from "../src/server.mjs";

test("normalizeDomain accepts domains and URLs and strips paths", () => {
  assert.equal(normalizeDomain("stripe.com"), "stripe.com");
  assert.equal(normalizeDomain("https://Docs.GitHub.com/en/get-started"), "docs.github.com");
  assert.equal(normalizeDomain("  example.org. "), "example.org");
});

test("normalizeDomain rejects invalid or internal hostnames", () => {
  assert.throws(() => normalizeDomain(""), /Missing/);
  assert.throws(() => normalizeDomain("notadomain"), /Invalid domain hostname/);
  assert.throws(() => normalizeDomain("localhost"), /Invalid domain hostname/);
  assert.throws(() => normalizeDomain("127.0.0.1"), /Private or internal/);
  assert.throws(() => normalizeDomain("169.254.169.254"), /Private or internal/);
  assert.throws(() => normalizeDomain("10.0.0.5"), /Private or internal/);
  assert.throws(() => normalizeDomain("myserver.local"), /Private or internal/);
});

test("extractBrandFromHtml extracts logos, icons, colors, fonts, and social links", () => {
  const html = `
    <!doctype html>
    <html>
      <head>
        <title>Acme Corp - Build Fast</title>
        <meta name="description" content="Developer infrastructure platform" />
        <meta property="og:site_name" content="Acme" />
        <meta property="og:image" content="/assets/og-banner.png" />
        <meta name="theme-color" content="#635bff" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" />
        <style>
          :root { --brand-primary: #635bff; --accent-color: #00d4ff; }
          body { font-family: "Inter", sans-serif; color: #111111; }
        </style>
      </head>
      <body>
        <a href="https://github.com/login">Login</a>
        <a href="https://github.com/acme">GitHub</a>
        <a href="https://x.com/intent">Share</a>
        <a href="https://x.com/acme">X</a>
      </body>
    </html>
  `;
  const manifest = {
    name: "Acme App",
    theme_color: "#635bff",
    icons: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }]
  };

  const result = extractBrandFromHtml(html, "https://acme.com/", manifest);
  assert.equal(result.name, "Acme");
  assert.equal(result.description, "Developer infrastructure platform");
  assert.equal(result.meta.themeColor, "#635bff");
  assert.ok(result.colors.includes("#635bff"));
  assert.ok(result.colors.includes("#00d4ff"));
  assert.ok(result.fonts.includes("Inter"));
  assert.equal(result.socialLinks.github, "https://github.com/acme");
  assert.equal(result.socialLinks.x, "https://x.com/acme");
  assert.ok(result.logos.some((l) => l.url === "https://acme.com/assets/og-banner.png"));
  assert.ok(result.logos.some((l) => l.url === "https://acme.com/favicon.svg"));
  assert.ok(result.logos.some((l) => l.url === "https://acme.com/icons/icon-512.png"));
});

test("fetchBrandAssets falls back to /favicon.ico when no icon links exist", async () => {
  const mockFetch = async (url, init) => {
    if (url === "https://minimal.example/") {
      return new Response("<html><head><title>Minimal</title></head></html>", { status: 200 });
    }
    if (url === "https://minimal.example/favicon.ico" && init?.method === "HEAD") {
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 404 });
  };

  const data = await fetchBrandAssets("minimal.example", { fetchImpl: mockFetch });
  assert.equal(data.domain, "minimal.example");
  assert.equal(data.name, "Minimal");
  assert.equal(data.icons.length, 1);
  assert.equal(data.icons[0].url, "https://minimal.example/favicon.ico");
  assert.equal(data.icons[0].source, "fallback");
});

test("HTTP server handles /health, /openapi.json, validation, and RapidAPI proxy secret", async () => {
  const mockExtractor = async (domain) => ({ domain, name: "Mocked", logos: [], icons: [], colors: [] });
  const handler = createAppHandler({
    proxySecret: "test-secret-123",
    fetchBrandAssets: mockExtractor
  });

  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const spec = await fetch(`${base}/openapi.json`);
    assert.equal(spec.status, 200);
    const specJson = await spec.json();
    assert.equal(specJson.openapi, "3.0.3");
    assert.ok(specJson.paths["/v1/brand"]);

    const unauth = await fetch(`${base}/v1/brand?domain=stripe.com`);
    assert.equal(unauth.status, 401);

    const missing = await fetch(`${base}/v1/brand`, {
      headers: { "x-rapidapi-proxy-secret": "test-secret-123" }
    });
    assert.equal(missing.status, 400);

    const ok = await fetch(`${base}/v1/brand?domain=stripe.com`, {
      headers: { "x-rapidapi-proxy-secret": "test-secret-123" }
    });
    assert.equal(ok.status, 200);
    const okJson = await ok.json();
    assert.equal(okJson.domain, "stripe.com");
    assert.equal(okJson.name, "Mocked");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
