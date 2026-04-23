import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { createLogger } from "@openrift/shared/logger";
import { z } from "zod";

import { postChangelogToDiscord } from "../../services/changelog-discord.js";
import type { Variables } from "../../types.js";

const log = createLogger("admin");

// ── Route definitions ───────────────────────────────────────────────────────

const postChangelog = createRoute({
  method: "post",
  path: "/changelog/post",
  tags: ["Admin - Operations"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            posted: z.boolean().openapi({ example: true }),
          }),
        },
      },
      description: "Today's changelog entries posted to Discord (if any)",
    },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminChangelogRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  postChangelog,
  async (c) => {
    const repos = c.get("repos");
    const config = c.get("config");
    const posted = await postChangelogToDiscord(repos, config.changelogPath, log);
    return c.json({ posted });
  },
);
