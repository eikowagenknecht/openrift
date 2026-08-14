import { findCard } from "@openrift/shared";
import * as Sentry from "@sentry/bun";
import { Hono } from "hono";

import {
  chatCardLine,
  chatErrorLine,
  chatMissLine,
  chatUsageLine,
} from "../../lib/chat-presenters.js";
import type { ChatCardIndex } from "../../services/chat-card-index.js";
import { createChatCardIndexLoader } from "../../services/chat-card-index.js";
import type { Variables } from "../../types.js";

/**
 * Chat-bot card lookup. `GET /api/v1/chat/card?q=` answers with one line of
 * plain text for a Twitch/Discord bot's url-fetch command (Nightbot,
 * StreamElements, Fossabot) to paste into chat verbatim.
 *
 * Those bots paste the response body whatever the status is, so this route
 * *always* answers 200 text/plain: a miss, a blank query and even an internal
 * failure are friendly sentences, never a JSON error envelope. Failures are
 * still reported to Sentry — the viewer just doesn't get a stack trace in chat.
 *
 * The response is anonymous and depends only on the catalogue, so it carries a
 * short shared cache: a popular `!card` command is the same URL for everyone
 * and does not need to reach the origin for every viewer.
 */

/** Short shared cache — see the module comment. */
const CHAT_CACHE_CONTROL = "public, max-age=300";

/**
 * Cap on the query before it reaches the ranking. A chat lookup is a card name
 * or a printing code; anything longer is noise, and the ranking scans every
 * card in the catalogue against it, so the length is worth bounding at the
 * door rather than at the presenter.
 */
const MAX_QUERY_LENGTH = 100;

/**
 * @returns A plain-text 200. Cacheable answers (hit, miss, usage) carry the
 *   shared cache; a failure line must not be pinned for five minutes, so it is
 *   served `no-store` and the next call retries.
 */
function chatResponse(line: string, cacheable = true): Response {
  return new Response(line, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": cacheable ? CHAT_CACHE_CONTROL : "no-store",
    },
  });
}

/**
 * Builds the route. It is a factory rather than a module-level app because it
 * owns the lookup index memo, which is scoped to one app's `repos` — a shared
 * module-level memo would leak one app's catalogue into another's in tests.
 *
 * @returns The chat route app, to mount under `/api/v1`.
 */
export function createPublicChatRoute() {
  // Built on the first request rather than here: `repos` only exists on the
  // context. `repos` is fixed for the life of an app (app.ts builds it once),
  // so the memo stays valid for every later request.
  let loadIndex: (() => Promise<ChatCardIndex>) | null = null;

  return new Hono<{ Variables: Variables }>().get("/chat/card", async (c) => {
    const config = c.get("config");
    // `CORS_ORIGIN` is a comma-separated allow-list whose first entry is the
    // deployment's own site origin, so preview and production each link to
    // themselves (see cors.ts).
    const firstOrigin = config.corsOrigin?.split(",")[0]?.trim();
    const siteUrl = firstOrigin || undefined;
    const query = (c.req.query("q") ?? "").slice(0, MAX_QUERY_LENGTH);

    if (!query.trim()) {
      return chatResponse(chatUsageLine(siteUrl));
    }

    try {
      loadIndex ??= createChatCardIndexLoader(c.get("repos"));
      const { index, labels } = await loadIndex();
      const card = findCard(index, query);
      if (!card) {
        return chatResponse(chatMissLine(query, siteUrl));
      }
      return chatResponse(chatCardLine(card, labels, siteUrl));
    } catch (error) {
      Sentry.captureException(error, { extra: { path: c.req.path, query } });
      return chatResponse(chatErrorLine(siteUrl), false);
    }
  });
}
