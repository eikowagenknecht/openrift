import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { addDeckCheckCardSchema, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";
import {
  applyDeckCheckZoneFixesSchema,
  createDeckCheckEntrySchema,
  deckCheckEntryDetailResponseSchema,
  deckCheckEntryStateChangeSchema,
  deckCheckEventDetailResponseSchema,
  deckCheckReResolveResponseSchema,
  deckCheckTickSchema,
  updateDeckCheckCardSchema,
  updateDeckCheckEntrySchema,
} from "./deck-check.js";

extendZodWithOpenApi(z);

const tournamentParamSchema = z.object({ tournamentId: z.uuid() });
const entryParamSchema = z.object({ tournamentId: z.uuid(), entryId: z.uuid() });
const entryCardParamSchema = z.object({
  tournamentId: z.uuid(),
  entryId: z.uuid(),
  cardId: z.uuid(),
});
const cardCopyParamSchema = z.object({
  tournamentId: z.uuid(),
  entryId: z.uuid(),
  cardId: z.uuid(),
  copyIndex: z.coerce.number().int().min(0).max(98),
});

const TAG = "Deck Check";
const BASE = "/api/v1/tournaments/{tournamentId}/deck-check";

// Mirrors the group-scoped deck-check surface but keys off the tournament id
// so any host can judge, not just a group. Event-collection CRUD, the
// submission token, and key minting stay on the tournaments contract.
export const tournamentDeckCheckContract = {
  listEntries: authedRoute
    .route({ method: "GET", path: `${BASE}/entries`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(tournamentParamSchema)
    .output(deckCheckEventDetailResponseSchema),
  createEntry: authedRoute
    .route({ method: "POST", path: `${BASE}/entries`, tags: [TAG], successStatus: 201 })
    .errors({
      NOT_FOUND: { message: "Tournament not found" },
      CONFLICT: { message: "Event is archived" },
      VALIDATION_ERROR: { status: 422, message: "Unknown deck section" },
    })
    .input(withParams(tournamentParamSchema, createDeckCheckEntrySchema))
    .output(deckCheckEntryDetailResponseSchema),
  getEntry: authedRoute
    .route({ method: "GET", path: `${BASE}/entries/{entryId}`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament or entry not found" } })
    .input(entryParamSchema)
    .output(deckCheckEntryDetailResponseSchema),
  setEntryState: authedRoute
    .route({ method: "PUT", path: `${BASE}/entries/{entryId}/state`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Tournament or entry not found" },
      CONFLICT: { message: "Transition not allowed in the current state" },
      VALIDATION_ERROR: { status: 422, message: "Review outcome required for this transition" },
    })
    .input(withParams(entryParamSchema, deckCheckEntryStateChangeSchema))
    .output(deckCheckEntryDetailResponseSchema),
  denyUnlockRequest: authedRoute
    .route({ method: "DELETE", path: `${BASE}/entries/{entryId}/unlock-request`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament or entry not found" } })
    .input(entryParamSchema)
    .output(deckCheckEntryDetailResponseSchema),
  updateEntry: authedRoute
    .route({ method: "PATCH", path: `${BASE}/entries/{entryId}`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament or entry not found" } })
    .input(withParams(entryParamSchema, updateDeckCheckEntrySchema))
    .output(deckCheckEntryDetailResponseSchema),
  deleteEntry: authedRoute
    .route({
      method: "DELETE",
      path: `${BASE}/entries/{entryId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Tournament or entry not found" } })
    .input(entryParamSchema),
  addCard: authedRoute
    .route({ method: "POST", path: `${BASE}/entries/{entryId}/cards`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Tournament or entry not found" },
      CONFLICT: { message: "Entry list is not yet submitted" },
      VALIDATION_ERROR: { status: 422, message: "Unknown deck section" },
    })
    .input(withParams(entryParamSchema, addDeckCheckCardSchema))
    .output(deckCheckEntryDetailResponseSchema),
  renameCard: authedRoute
    .route({ method: "PATCH", path: `${BASE}/entries/{entryId}/cards/{cardId}`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Tournament, entry, or card not found" },
      CONFLICT: { message: "Entry list is not yet submitted" },
      VALIDATION_ERROR: { status: 422, message: "Unknown deck section" },
    })
    .input(withParams(entryCardParamSchema, updateDeckCheckCardSchema))
    .output(deckCheckEntryDetailResponseSchema),
  applyZoneFixes: authedRoute
    .route({ method: "POST", path: `${BASE}/entries/{entryId}/zone-fixes`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Tournament or entry not found" },
      CONFLICT: { message: "Entry list is not yet submitted" },
    })
    .input(withParams(entryParamSchema, applyDeckCheckZoneFixesSchema))
    .output(deckCheckEntryDetailResponseSchema),
  removeCardCopy: authedRoute
    .route({
      method: "DELETE",
      path: `${BASE}/entries/{entryId}/cards/{cardId}/copies/{copyIndex}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Tournament, entry, or card not found" },
      CONFLICT: { message: "Entry list is not yet submitted" },
    })
    .input(cardCopyParamSchema),
  tickCard: authedRoute
    .route({
      method: "PUT",
      path: `${BASE}/entries/{entryId}/cards/{cardId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Tournament or entry not found" },
      CONFLICT: { message: "Entry list changed or not yet submitted" },
    })
    .input(withParams(entryCardParamSchema, deckCheckTickSchema)),
  unlinkEntry: authedRoute
    .route({ method: "DELETE", path: `${BASE}/entries/{entryId}/link`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament or entry not found" } })
    .input(entryParamSchema)
    .output(deckCheckEntryDetailResponseSchema),
  reResolve: authedRoute
    .route({ method: "POST", path: `${BASE}/re-resolve`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Tournament not found" } })
    .input(tournamentParamSchema)
    .output(deckCheckReResolveResponseSchema),
};

export type TournamentDeckCheckContract = typeof tournamentDeckCheckContract;
