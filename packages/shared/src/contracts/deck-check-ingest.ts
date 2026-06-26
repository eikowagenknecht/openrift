import { oc } from "@orpc/contract";

import { deckCheckIngestResultResponseSchema } from "../response-schemas.js";
import { deckCheckIngestSchema } from "../schemas.js";

/**
 * oRPC contract for the deck-check provider push (ADR-025). The handler
 * (`apps/api/src/routes/public/deck-check-ingest.ts`) is a `meta: "public"`
 * procedure: it authenticates off a per-group `Authorization: Bearer <key>`
 * header (read via `context.reqHeader`), not the session cookie. Its rate limit
 * and 1 MB body limit stay as Hono middleware on the path (see `app.ts`).
 */
export const deckCheckIngestContract = {
  push: oc
    .route({
      method: "POST",
      path: "/api/v1/ingest/deck-check",
      tags: ["Deck Check"],
      description:
        "Provider push for deck-check events (ADR-025). Authenticated by a " +
        "per-group API key (`Authorization: Bearer <key>`). Pushes never create " +
        "events: the event is created in OpenRift and addressed by its id. " +
        "Partial semantics: entries absent from a push are untouched; withdrawal " +
        "is the explicit per-entry flag.",
    })
    .meta({ auth: "public" })
    .input(deckCheckIngestSchema)
    .output(deckCheckIngestResultResponseSchema),
};

export type DeckCheckIngestContract = typeof deckCheckIngestContract;
