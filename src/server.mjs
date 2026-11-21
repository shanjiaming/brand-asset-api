import http from "node:http";
import { fetchBrandAssets } from "./extractor.mjs";
import { buildOpenApiSpec } from "./openapi.mjs";

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": statusCode === 200 ? "public, max-age=3600" : "no-store"
  });
  res.end(body);
}

/**
 * Create an HTTP request handler with optional RapidAPI secret enforcement.
 */
export function createAppHandler(options = {}) {
  const proxySecret = options.proxySecret ?? process.env.RAPIDAPI_PROXY_SECRET ?? "";
  const extractor = options.fetchBrandAssets || fetchBrandAssets;

  return async function handleRequest(req, res) {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = reqUrl.pathname;

    if (req.method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    if (pathname === "/health") {
      return sendJson(res, 200, { status: "ok" });
    }

    if (pathname === "/openapi.json") {
      const origin = `https://${req.headers.host || "localhost"}`;
      return sendJson(res, 200, buildOpenApiSpec(origin));
    }

    if (pathname === "/") {
      return sendJson(res, 200, {
        service: "brand-asset-api",
        version: "1.0.0",
        endpoints: ["/v1/brand?domain=stripe.com", "/openapi.json", "/health"]
      });
    }

    if (pathname === "/v1/brand") {
      if (proxySecret) {
        const provided = req.headers["x-rapidapi-proxy-secret"];
        if (provided !== proxySecret) {
          return sendJson(res, 401, { error: "Unauthorized" });
        }
      }

      const domain = reqUrl.searchParams.get("domain");
      if (!domain) {
        return sendJson(res, 400, { error: "Missing required query parameter: domain" });
      }

      try {
        const result = await extractor(domain);
        return sendJson(res, 200, result);
      } catch (err) {
        const msg = err?.message || "Failed to extract brand assets";
        const isClientError =
          msg.includes("Invalid") ||
          msg.includes("Missing") ||
          msg.includes("not allowed");
        return sendJson(res, isClientError ? 400 : 502, { error: msg });
      }
    }

    return sendJson(res, 404, { error: "Not found" });
  };
}

export function startServer(port = Number(process.env.PORT) || 3000) {
  const server = http.createServer(createAppHandler());
  server.listen(port, () => {
    console.log(`brand-asset-api listening on http://localhost:${port}`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
