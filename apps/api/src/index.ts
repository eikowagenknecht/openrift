import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { cardsRoute } from "./routes/cards.js";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      const allowed = process.env.CORS_ORIGIN;
      if (!allowed || allowed === "*") return origin;
      // Support comma-separated origins and wildcard subdomains
      // e.g. "https://openrift.app,https://*.openrift-web.workers.dev"
      const patterns = allowed.split(",").map((s) => s.trim());
      for (const pattern of patterns) {
        if (pattern === origin) return origin;
        if (pattern.includes("*")) {
          const regex = new RegExp(`^${pattern.replace(/\./g, "\\.").replace("*", "[^.]+")}$`);
          if (regex.test(origin)) return origin;
        }
      }
      return undefined;
    },
  }),
);

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.route("/api", cardsRoute);

const port = Number(process.env.PORT ?? 3000);

console.log(`API server listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
