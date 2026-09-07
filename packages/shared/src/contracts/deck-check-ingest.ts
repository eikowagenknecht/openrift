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
  riotId: z.string().max(120).nullish(),
  submittedAt: z.iso.datetime({ offset: true }).nullish(),
  allowDeckPublishing: z.boolean().optional(),
  allowNameSharing: z.boolean().optional(),
  allowRiotIdSharing: z.boolean().optional(),
  withdrawn: z.boolean().optional(),
  cards: z.array(deckCheckIngestCardSchema).max(DECK_CHECK_MAX_CARD_LINES_PER_ENTRY).default([]),
});

// Pushes never create tournaments: `tournamentId` must be an existing
// deck-check tournament hosted by the key's host.
export const deckCheckIngestSchema = z.object({
  tournamentId: z.uuid(),
  entries: z.array(deckCheckIngestEntrySchema).max(DECK_CHECK_MAX_ENTRIES_PER_PUSH).default([]),
});

export const deckCheckIngestEntryResultSchema = z
  .object({
    externalId: z.string(),
    entryId: z.string(),
    claimUrl: z.string().nullable(),
  })
  .openapi("DeckCheckIngestEntryResult");

export const deckCheckIngestResultResponseSchema = z
  .object({
    tournamentId: z.string(),
    entriesCreated: z.number().int().nonnegative(),
    entriesUpdated: z.number().int().nonnegative(),
    entriesUnchanged: z.number().int().nonnegative(),
    entriesWithdrawn: z.number().int().nonnegative(),
    checksInvalidated: z.number().int().nonnegative(),
    // Deprecated: always 0, kept so existing provider integrations keep parsing.
    entriesIgnored: z.number().int().nonnegative(),
    entries: z.array(deckCheckIngestEntryResultSchema),
  })
  .openapi("DeckCheckIngestResultResponse");

// Rate limit and 1 MB body limit are applied as Hono middleware on the path
// (`app.ts`), not visible in this contract.
export const deckCheckIngestContract = {
  push: oc
    .route({
      method: "POST",
      path: "/api/v1/ingest/deck-check",
      tags: ["Deck Check"],
      description:
        "Provider push for a tournament's deck check (ADR-025). Authenticated by " +
        "the host's API key (`Authorization: Bearer <key>`). Pushes never create " +
        "tournaments: the tournament is created in OpenRift and addressed by its " +
        "`tournamentId`. Partial semantics: entries absent from a push are " +
        "untouched; withdrawal is the explicit per-entry flag.",
    })
    .meta({ auth: "bearer" })
    .input(deckCheckIngestSchema)
    .errors({
      NOT_FOUND: { message: "Tournament not found" },
      CONFLICT: { message: "Tournament is not accepting submissions" },
      VALIDATION_ERROR: { status: 422, message: "Push contains invalid data" },
    })
    .output(deckCheckIngestResultResponseSchema),
};

export type DeckCheckIngestContract = typeof deckCheckIngestContract;
