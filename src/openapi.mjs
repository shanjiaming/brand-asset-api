export function buildOpenApiSpec(serverUrl = "https://your-deployed-domain.example.com") {
  return {
    openapi: "3.0.3",
    info: {
      title: "Brand Asset & Logo Extractor API",
      version: "1.0.0",
      description:
        "Extract company logos, favicons, brand hex color palettes, fonts, social links, and OpenGraph metadata from any public domain."
    },
    servers: [{ url: serverUrl }],
    paths: {
      "/v1/brand": {
        get: {
          summary: "Extract brand assets for a domain",
          parameters: [
            {
              name: "domain",
              in: "query",
              required: true,
              schema: { type: "string", example: "stripe.com" },
              description: "Target domain or URL (e.g. stripe.com or https://stripe.com)"
            }
          ],
          responses: {
            "200": {
              description: "Extracted brand assets",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      domain: { type: "string" },
                      resolvedUrl: { type: "string" },
                      name: { type: "string", nullable: true },
                      description: { type: "string", nullable: true },
                      logos: { type: "array", items: { type: "object" } },
                      icons: { type: "array", items: { type: "object" } },
                      colors: { type: "array", items: { type: "string" } },
                      fonts: { type: "array", items: { type: "string" } },
                      socialLinks: { type: "object" },
                      meta: { type: "object" }
                    }
                  }
                }
              }
            },
            "400": { description: "Invalid or missing domain parameter" },
            "401": { description: "Unauthorized proxy secret" },
            "502": { description: "Failed to fetch upstream domain" }
          }
        }
      },
      "/health": {
        get: {
          summary: "Health check",
          responses: {
            "200": { description: "Service is healthy" }
          }
        }
      }
    }
  };
}
