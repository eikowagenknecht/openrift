import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "kysely";

import { auth } from "./auth.js";
import { db } from "./db.js";
import { cardsRoute } from "./routes/cards.js";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const app = new Hono<{ Variables: Variables }>();

app.use(
  "/api/*",
  cors({
    credentials: true,
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

app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

app.use("/api/*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  await next();
});

app.get("/api/health", async (c) => {
  try {
    await sql`SELECT 1`.execute(db);
  } catch {
    return c.json({ status: "db_unreachable" }, 503);
  }

  try {
    const result = await db.selectFrom("sets").select("id").limit(1).execute();
    if (result.length === 0) {
      return c.json({ status: "db_empty" }, 503);
    }
  } catch {
    return c.json({ status: "db_not_migrated" }, 503);
  }

  return c.json({ status: "ok" });
});

app.route("/api", cardsRoute);

const port = Number(process.env.PORT ?? 3000);

console.log(`API server listening on http://localhost:${port}`);
export default { fetch: app.fetch, port };
