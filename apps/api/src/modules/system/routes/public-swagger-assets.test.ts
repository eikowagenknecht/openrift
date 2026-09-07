import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { Variables } from "../../../types.js";
import { SWAGGER_ASSETS_BASE_URL, swaggerAssetsRoute } from "./public-swagger-assets";

// Production mounts the assets unversioned at /api (app.ts) — mirror that here.
const app = new Hono<{ Variables: Variables }>().route("/api", swaggerAssetsRoute);

describe("GET /api/swagger-ui-dist/:file", () => {
  it("serves the swagger CSS with a stylesheet content type", async () => {
    const res = await app.request("/api/swagger-ui-dist/swagger-ui.css");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  it("serves the swagger bundle with a script content type, defining the SwaggerUIBundle global the /api/ui bootstrap calls", async () => {
    const res = await app.request("/api/swagger-ui-dist/swagger-ui-bundle.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("SwaggerUIBundle");
  });

  it("marks assets as cacheable", async () => {
    const res = await app.request("/api/swagger-ui-dist/swagger-ui.css");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
  });

  it("returns 404 for files outside the whitelist", async () => {
    const res = await app.request("/api/swagger-ui-dist/package.json");
    expect(res.status).toBe(404);
  });

  it("returns 404 for traversal attempts", async () => {
    const res = await app.request("/api/swagger-ui-dist/..%2Fpackage.json");
    expect(res.status).toBe(404);
  });
});

describe("swagger UI page asset URLs", () => {
  // The middleware's default asset host is the jsDelivr CDN, which the site
  // CSP (script-src/style-src 'self') blocks.
  it("references the self-hosted assets, not the CDN", async () => {
    const page = new Hono().get(
      "/api/ui",
      swaggerUI({ url: "/api/doc", baseUrl: SWAGGER_ASSETS_BASE_URL }),
    );
    const res = await page.request("/api/ui");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('src="/api/swagger-ui-dist/swagger-ui-bundle.js"');
    expect(html).toContain('href="/api/swagger-ui-dist/swagger-ui.css"');
    expect(html).not.toContain("cdn.jsdelivr.net");
  });
});
