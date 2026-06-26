import { oc } from "@orpc/contract";

import { deckCheckIngestResultResponseSchema } from "../response-schemas.js";
import { deckCheckIngestSchema } from "../schemas.js";

/**
 * oRPC contract for the deck-check provider push (ADR-025). This contract
 * exists for the OpenAPI documentation only: the endpoint is **implemented as a
 * plain Hono route** (see `apps/api/src/routes/public/deck-check-ingest.ts`),
 * not an oRPC handler, because external providers depend on the exact
 * `{ error, code }` error envelope produced by the global Hono `onError` — oRPC
 * would emit `{ message, code }` instead. Keep the schemas here in sync with
 * that route's manual validation.
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
    .input(deckCheckIngestSchema)
    .output(deckCheckIngestResultResponseSchema),
};

export type DeckCheckIngestContract = typeof deckCheckIngestContract;
