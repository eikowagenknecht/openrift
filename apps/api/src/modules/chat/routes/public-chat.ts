import { findCard } from "@openrift/shared/card-search";
import * as Sentry from "@sentry/bun";
import { Hono } from "hono";

import type { Variables } from "../../../types.js";
import {
  chatCardLine,
  chatErrorLine,
  chatMissLine,
  chatUsageLine,
} from "../lib/chat-presenters.js";
import type { ChatCardIndex } from "../services/chat-card-index.js";
import { createChatCardIndexLoader } from "../services/chat-card-index.js";

/**
 * `GET /api/v1/chat/card?q=` always answers 200 text/plain, since a chat
 * bot's url-fetch command pastes the response body verbatim regardless of
 * status; a miss or an internal failure is a friendly sentence, not a JSON
 * error envelope. Failures are still reported to Sentry.
 */

const CHAT_CACHE_CONTROL = "public, max-age=300";

const MAX_QUERY_LENGTH = 100;

/**
 * A failure line must not be pinned for five minutes, so it is served
 * `no-store` while hit/miss/usage lines carry the shared cache.
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
 * The lookup index memo is scoped to one app's `repos`; a module-level memo
 * would leak one app's catalogue into another's in tests.
 */
export function createPublicChatRoute() {
  // `repos` isn't available until the first request; it's fixed for the
  // life of an app, so the memo stays valid after that.
  let loadIndex: (() => Promise<ChatCardIndex>) | null = null;

  return new Hono<{ Variables: Variables }>().get("/chat/card", async (c) => {
    const config = c.get("config");
    // CORS_ORIGIN's first entry is the deployment's own site origin (see cors.ts).
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
