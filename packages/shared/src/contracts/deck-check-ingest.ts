import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { DECK_CHECK_MAX_CARD_LINES_PER_ENTRY } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const DECK_CHECK_MAX_ENTRIES_PER_PUSH = 500;

const deckCheckIngestCardSchema = z.object({
  name: z.string().min(1).max(300),
  quantity: z.number().int().min(1).max(99),
  section: z.string().min(1).max(50),
});

const deckCheckIngestEntrySchema = z.object({
  externalId: z.string().min(1).max(200),
  playerName: z.string().min(1).max(120),
  playerEmail: z.string().max(254).nullish(),
  riotId: z.string().max(120).nullish(),
  submittedAt: z.iso.datetime({ offset: true }).nullish(),
  /** Consent for the organizer to publish the deck list publicly; omitted = keep stored (true on first insert). */
  allowDeckPublishing: z.boolean().optional(),
  /** Consent to show the player's name on public platforms; omitted = keep stored (true on first insert). */
  allowNameSharing: z.boolean().optional(),
  /** Consent to show the player's Riot ID on public platforms; omitted = keep stored (true on first insert). */
  allowRiotIdSharing: z.boolean().optional(),
  /** Soft-withdraws the entry; a later push without the flag restores it. */
  withdrawn: z.boolean().optional(),
  cards: z.array(deckCheckIngestCardSchema).max(DECK_CHECK_MAX_CARD_LINES_PER_ENTRY).default([]),
});

/**
 * The provider push payload. Pushes never create events: `eventId` must be an
 * existing event (created in OpenRift) inside the key's group. Partial
 * semantics: entries absent from a push are untouched; withdrawal is the
 * explicit per-entry flag, never an omission.
 */
export const deckCheckIngestSchema = z.object({
  eventId: z.uuid(),
  entries: z.array(deckCheckIngestEntrySchema).max(DECK_CHECK_MAX_ENTRIES_PER_PUSH).default([]),
});

const deckCheckIngestEntryResultSchema = z
  .object({
    externalId: z.string(),
    entryId: z.string(),
    claimUrl: z.string(),
  })
  .openapi("DeckCheckIngestEntryResult");

export const deckCheckIngestResultResponseSchema = z
  .object({
    eventId: z.string(),
    entriesCreated: z.number().int().nonnegative(),
    entriesUpdated: z.number().int().nonnegative(),
    entriesUnchanged: z.number().int().nonnegative(),
    entriesWithdrawn: z.number().int().nonnegative(),
    checksInvalidated: z.number().int().nonnegative(),
    // Deprecated: always 0 since ADR-027 removed edit-takeover; kept so
    // existing provider integrations keep parsing.
    entriesIgnored: z.number().int().nonnegative(),
    entries: z.array(deckCheckIngestEntryResultSchema),
  })
  .openapi("DeckCheckIngestResultResponse");

/**
 * oRPC contract for the deck-check provider push (ADR-025). The handler
 * (`apps/api/src/routes/public/deck-check-ingest.ts`) is a `meta: "bearer"`
 * procedure: it authenticates off a per-group `Authorization: Bearer <key>`
 * header (read via `context.reqHeader`), not the session cookie — so it skips
 * session resolution and carries the `bearerAuth` OpenAPI security marker. Its
 * rate limit and 1 MB body limit stay as Hono middleware on the path (`app.ts`).
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
    .meta({ auth: "bearer" })
    .input(deckCheckIngestSchema)
    .output(deckCheckIngestResultResponseSchema),
};

export type DeckCheckIngestContract = typeof deckCheckIngestContract;
