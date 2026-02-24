import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { cardsRoute } from "./routes/cards.js";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "*",
  }),
);

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.route("/api", cardsRoute);

const port = Number(process.env.PORT ?? 3000);

console.log(`API server listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
