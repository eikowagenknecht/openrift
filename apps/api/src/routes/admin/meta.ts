import { ERROR_CODES, WellKnown } from "@openrift/shared";
import type { AdminMetaEvent } from "@openrift/shared";
import { adminMetaContract } from "@openrift/shared/contracts/admin/meta";
import type { MetaEventOverlayField, MetaListStatus } from "@openrift/shared/types";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { assertExisted, assertFound, assertSlugAvailable } from "../../lib/assertions.js";
import { assertKnownFormat, validateFormatConfig } from "../../lib/deck-format-validation.js";
import { classifyMetaEventTier } from "../../lib/meta-event-classify.js";
import {
  toAdminMetaEvent,
  toAdminMetaPlayer,
  toMetaEventSource,
} from "../../lib/meta-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { MetaArchivedDeckInput, MetaDeckCardInput } from "../../repositories/meta.js";
import { createMetaEventPlayer } from "../../services/meta-event-players.js";
import type { MetaEventFieldEdit } from "../../services/meta-overlay-review.js";
import { writeEventOverlayFields } from "../../services/meta-overlay-review.js";
import { repromoteMetaEvents } from "../../services/meta-repromote.js";

const os = implement(adminMetaContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * What a hand-entered event claims, which is exactly what its creator typed.
 *
 * A field left out, or sent as an explicit null, claims nothing: the admin said
 * nothing about it, so a source linked later is still free to decide it. `tier`
 * is the one field with a computed default, and the default goes on the row
 * rather than into the claim for the same reason.
 */
function creationEdits(input: {
  name: string;
  eventDate: string;
  format: string;
  playerCount?: number | null;
  organizer?: string | null;
  notes?: string | null;
  tier?: string;
  country?: string | null;
  location?: string | null;
}): MetaEventFieldEdit[] {
  const edits: MetaEventFieldEdit[] = [
    { field: "name", value: input.name },
    { field: "eventDate", value: input.eventDate },
    { field: "format", value: input.format },
  ];
  const optional: [MetaEventOverlayField, string | number | null | undefined][] = [
    ["playerCount", input.playerCount],
    ["organizer", input.organizer],
    ["notes", input.notes],
    ["tier", input.tier],
    ["country", input.country],
    ["location", input.location],
  ];
  for (const [field, value] of optional) {
    if (value !== undefined && value !== null) {
      edits.push({ field, value: String(value) });
    }
  }
  return edits;
}

// Normalizes the contract's optional `preferredPrintingId` to the column's
// explicit null, so the repo never has to reason about an absent key.
function toCardInputs(
  cards: { cardId: string; zone: string; quantity: number; preferredPrintingId?: string | null }[],
): MetaDeckCardInput[] {
  return cards.map((card) => ({
    cardId: card.cardId,
    zone: card.zone as MetaDeckCardInput["zone"],
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId ?? null,
  }));
}

interface ListBody {
  name: string;
  format: string;
  formatConfig?: Record<string, unknown> | null;
  cards: { cardId: string; zone: string; quantity: number; preferredPrintingId?: string | null }[];
  listStatus: Exclude<MetaListStatus, "none">;
}

/**
 * Validates the list's format against `deck_formats` and its config against
 * that format's own schema, then shapes it for the repo. Both writes need it,
 * and skipping either would surface as an FK violation or a 500.
 */
async function toDeckInput(
  repos: ApiContext["repos"],
  list: ListBody,
): Promise<MetaArchivedDeckInput> {
  await assertKnownFormat(repos.deckFormats, list.format);
  const formatConfig = await validateFormatConfig(repos.customTags, list.format, list.formatConfig);
  return {
    name: list.name,
    format: list.format,
    formatConfig,
    cards: toCardInputs(list.cards),
    listStatus: list.listStatus,
  };
}

/**
 * A list's own legend and champion zones, which win over the standings row's
 * fields whenever a list is given. The archive reads the legend off the
 * standings row, so a pasted decklist has to sync it there or the entry would
 * be filed under whatever the form happened to hold.
 */
function zoneCardIds(deck: MetaArchivedDeckInput | null): {
  legendCardId: string | null;
  championCardId: string | null;
} {
  const inZone = (zone: string) => deck?.cards.find((card) => card.zone === zone)?.cardId ?? null;
  return {
    legendCardId: inZone(WellKnown.deckZone.LEGEND),
    championCardId: inZone(WellKnown.deckZone.CHAMPION),
  };
}

/** Rows per page when the client does not say. Matches the admin table's own page size. */
const ADMIN_META_EVENT_PAGE_SIZE = 50;

/**
 * Meta archive curation, mounted under `/api/admin/v1/meta`. The Hono
 * `requireAdmin` middleware on that prefix is the only role check — no
 * handler here re-derives it, and the archive is deliberately not a grantable
 * admin section.
 *
 * The unit of curation is a standings row: a decklist is an optional
 * attachment, so `list` on the write bodies distinguishes "leave it alone"
 * (absent), "this is the list" (an object) and "there is no list" (null).
 * Archived decks are created here rather than through the deck builder, so this
 * is the single place that stamps the synthetic owner and the public flag; both
 * live in the repo's transaction, and nothing in this file can mint a deck
 * under a different owner.
 */
export const adminMetaRouter = {
  listEvents: os.listEvents.handler(async ({ input, context }) => {
    const page = input.page ?? 1;
    const limit = input.limit ?? ADMIN_META_EVENT_PAGE_SIZE;
    const { rows, total } = await context.repos.meta.listEvents(
      {
        search: input.search,
        format: input.format,
        source: input.source,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        incompleteStandings: input.incompleteStandings,
        noDecks: input.noDecks,
      },
      { limit, offset: (page - 1) * limit },
      { sort: input.sort, direction: input.direction },
    );
    const sources = await context.repos.meta.sourcesForEvents(rows.map((row) => row.id));
    const sourcesByEvent = Map.groupBy(sources, (source) => source.metaEventId);
    return {
      events: rows.map((row) => toAdminMetaEvent(row, sourcesByEvent.get(row.id) ?? [])),
      total,
      page,
      limit,
    };
  }),

  getEvent: os.getEvent.handler(async ({ input, context }): Promise<AdminMetaEvent> => {
    const row = await context.repos.meta.eventById(input.id);
    assertFound(row, "Event not found");
    const sources = await context.repos.meta.sourcesForEvent(row.id);
    return toAdminMetaEvent(row, sources);
  }),

  createEvent: os.createEvent.handler(async ({ input, context }): Promise<AdminMetaEvent> => {
    const { meta, deckFormats } = context.repos;

    await assertKnownFormat(deckFormats, input.format);
    assertSlugAvailable(await meta.eventBySlug(input.slug), input.slug, "Event");

    // The row is minted with identity and the NOT NULL columns only. What the
    // admin typed is claimed by an overlay instead, the same way a later
    // correction is, so the live values stay derived from sources plus claims
    // and releasing one gives it up instead of stranding it on the row.
    const row = await meta.createEvent({
      slug: input.slug,
      name: input.name,
      eventDate: input.eventDate,
      format: input.format,
      playerCount: null,
      organizer: null,
      notes: null,
      tier: input.tier ?? classifyMetaEventTier({ playerCount: input.playerCount ?? null }),
      country: null,
      location: null,
    });

    await writeEventOverlayFields(context.repos, row.id, creationEdits(input), context.userId);
    const promoted = await meta.eventById(row.id);
    assertFound(promoted, "Event not found");
    return toAdminMetaEvent(promoted, []);
  }),

  // Slug only: every data field moves through the overlay layer, so a
  // re-promote can never silently revert an admin's edit.
  updateEvent: os.updateEvent.handler(async ({ input, context }): Promise<void> => {
    const { meta } = context.repos;
    const clash = await meta.eventBySlug(input.slug);
    if (clash && clash.id !== input.id) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Event "${input.slug}" already exists`);
    }
    assertExisted(await meta.updateEvent(input.id, { slug: input.slug }), "Event not found");
  }),

  deleteEvent: os.deleteEvent.handler(async ({ input, context }): Promise<void> => {
    assertExisted(await context.repos.meta.deleteEvent(input.id), "Event not found");
  }),

  // Named for the button ("Reapply rules"), but under the derive-live model it
  // is simply promotion run again: the rules live there, and an accepted
  // overlay still wins whatever it claims.
  reclassifyEvents: os.reclassifyEvents.handler(({ context }) =>
    repromoteMetaEvents(context.repos),
  ),

  eventPlayers: os.eventPlayers.handler(async ({ input, context }) => {
    const { meta, metaOverlays } = context.repos;
    assertFound(await meta.eventById(input.id), "Event not found");
    const [rows, overlays] = await Promise.all([
      meta.adminPlayersForEvent(input.id),
      metaOverlays.acceptedPlayerOverlays(input.id),
    ]);
    const claimsByPlayer = new Map<string, Set<string>>();
    for (const overlay of overlays) {
      if (overlay.metaEventPlayerId === null) {
        continue;
      }
      const claims = claimsByPlayer.get(overlay.metaEventPlayerId) ?? new Set<string>();
      for (const field of overlay.claimedFields) {
        claims.add(field);
      }
      claimsByPlayer.set(overlay.metaEventPlayerId, claims);
    }
    return {
      players: rows.map((row) => ({
        ...toAdminMetaPlayer(row),
        claimedFields: [...(claimsByPlayer.get(row.id) ?? [])],
      })),
    };
  }),

  createPlayer: os.createPlayer.handler(async ({ input, context }) => {
    const { meta } = context.repos;

    const deck = input.list === null ? null : await toDeckInput(context.repos, input.list);
    const zones = zoneCardIds(deck);

    // Shared with promotion, so the synthetic owner, the public flag, and the
    // share token are stamped in exactly one place.
    const result = await createMetaEventPlayer(meta, {
      eventId: input.eventId,
      rank: input.rank,
      rankIsTier: input.rankIsTier,
      playerName: input.playerName,
      wins: input.wins,
      losses: input.losses,
      draws: input.draws,
      legendCardId: zones.legendCardId ?? input.legendCardId,
      championCardId: zones.championCardId ?? input.championCardId,
      deck,
    });

    assertFound(result, "Event not found");
    return result;
  }),

  // There is no player PATCH: every standings-row correction goes through
  // `writePlayerOverlayFields`, so a re-promote can never silently revert it.
  // The deck's name is the one exception — see the contract for why.

  renamePlayerDeck: os.renamePlayerDeck.handler(async ({ input, context }): Promise<void> => {
    assertExisted(
      await context.repos.meta.renamePlayerDeck(input.id, input.name),
      "No deck on that standings row",
    );
  }),

  deletePlayer: os.deletePlayer.handler(async ({ input, context }): Promise<void> => {
    assertExisted(await context.repos.meta.deletePlayer(input.id), "Standings row not found");
  }),

  // A citation says where a slice of the event's data came from. It is public,
  // and it never carries a user: a contributor is credited through
  // `meta_credits`, which this router never touches.

  eventSources: os.eventSources.handler(async ({ input, context }) => {
    const { meta } = context.repos;
    assertFound(await meta.eventById(input.id), "Event not found");
    const rows = await meta.sourcesForEvent(input.id);
    return { sources: rows.map((row) => toMetaEventSource(row)) };
  }),

  createEventSource: os.createEventSource.handler(async ({ input, context }) => {
    const { meta } = context.repos;
    assertFound(await meta.eventById(input.id), "Event not found");

    // Hand-entered, so the key stays null: a provider's citation is written
    // when its event is accepted, and one typed in here would either collide
    // with that unique key or outlive the link that owns it.
    const row = await meta.insertEventSource({
      metaEventId: input.id,
      provider: null,
      externalId: null,
      label: input.label,
      sourceUrl: input.sourceUrl,
    });
    return toMetaEventSource(row);
  }),

  deleteEventSource: os.deleteEventSource.handler(async ({ input, context }): Promise<void> => {
    const { meta } = context.repos;

    const rows = await meta.sourcesForEvent(input.id);
    const existing = rows.find((row) => row.id === input.sourceId);
    assertFound(existing, "Citation not found");

    // Refusing a provider row is not pedantry: unlinking is what removes it, and
    // deleting it here would leave a linked source with no credit and no way to
    // get one back short of a relink.
    if (existing.provider !== null) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "That citation belongs to a linked source. Unlink its candidate to remove it.",
      );
    }
    assertExisted(await meta.deleteEventSource(input.sourceId), "Citation not found");
  }),
};
