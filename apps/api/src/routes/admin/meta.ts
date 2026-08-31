import { ERROR_CODES, WellKnown } from "@openrift/shared";
import type { AdminMetaEvent } from "@openrift/shared";
import { adminMetaContract } from "@openrift/shared/contracts/admin/meta";
import type { MetaListStatus } from "@openrift/shared/types";
import { implement } from "@orpc/server";
import type { Updateable } from "kysely";

import type { MetaEventsTable } from "../../db/index.js";
import { AppError } from "../../errors.js";
import { assertFound, assertSlugAvailable } from "../../lib/assertions.js";
import { assertKnownFormat, validateFormatConfig } from "../../lib/deck-format-validation.js";
import { classifyMetaEventTier } from "../../lib/meta-event-classify.js";
import {
  toAdminMetaEvent,
  toAdminMetaPlayer,
  toMetaEventSource,
} from "../../lib/meta-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import type { MetaArchivedDeckInput, MetaDeckCardInput } from "../../repositories/meta.js";
import { createMetaEventPlayer, setMetaPlayerList } from "../../services/meta-event-players.js";
import { reclassifyMetaEvents } from "../../services/meta-reclassify.js";

const os = implement(adminMetaContract).$context<ApiContext>().use(requireAuthedUser);

/** Body field → column for the event PATCH. Only present fields are written. */
const EVENT_FIELDS: FieldMapping<Updateable<MetaEventsTable>> = {
  slug: "slug",
  name: "name",
  eventDate: "eventDate",
  format: "format",
  playerCount: "playerCount",
  organizer: "organizer",
  notes: "notes",
  tier: "tier",
  country: "country",
  location: "location",
};

// Turns a repository's "did the row exist" boolean into the 404 the contract
// declares. The write methods report existence rather than returning the row,
// because none of these responses carry one back.
function assertExisted(existed: boolean, message: string): void {
  if (!existed) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }
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
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        incompleteStandings: input.incompleteStandings,
        noDecks: input.noDecks,
      },
      { limit, offset: (page - 1) * limit },
      { sort: input.sort, direction: input.direction },
    );
    const sources = await context.repos.metaCandidates.sourcesByMetaEventIds(
      rows.map((row) => row.id),
    );
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
    const sources = await context.repos.metaCandidates.sourcesByMetaEventIds([row.id]);
    return toAdminMetaEvent(row, sources);
  }),

  createEvent: os.createEvent.handler(async ({ input, context }): Promise<AdminMetaEvent> => {
    const { meta, deckFormats } = context.repos;

    await assertKnownFormat(deckFormats, input.format);
    assertSlugAvailable(await meta.eventBySlug(input.slug), input.slug, "Event");

    const row = await meta.createEvent({
      slug: input.slug,
      name: input.name,
      eventDate: input.eventDate,
      format: input.format,
      playerCount: input.playerCount ?? null,
      organizer: input.organizer ?? null,
      notes: input.notes ?? null,
      tier: input.tier ?? classifyMetaEventTier({ playerCount: input.playerCount ?? null }),
      country: input.country ?? null,
      location: input.location ?? null,
    });
    return toAdminMetaEvent(row, []);
  }),

  updateEvent: os.updateEvent.handler(async ({ input, context }): Promise<void> => {
    const { meta, deckFormats } = context.repos;
    const { id, ...body } = input;

    if (body.format !== undefined) {
      await assertKnownFormat(deckFormats, body.format);
    }
    if (body.slug !== undefined) {
      const clash = await meta.eventBySlug(body.slug);
      if (clash && clash.id !== id) {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Event "${body.slug}" already exists`);
      }
    }

    const updates = buildPatchUpdates<Updateable<MetaEventsTable>>(body, EVENT_FIELDS);
    assertExisted(await meta.updateEvent(id, updates), "Event not found");
  }),

  deleteEvent: os.deleteEvent.handler(async ({ input, context }): Promise<void> => {
    assertExisted(await context.repos.meta.deleteEvent(input.id), "Event not found");
  }),

  reclassifyEvents: os.reclassifyEvents.handler(({ context }) =>
    reclassifyMetaEvents(context.repos, { transact: context.transact }),
  ),

  eventPlayers: os.eventPlayers.handler(async ({ input, context }) => {
    const { meta } = context.repos;
    assertFound(await meta.eventById(input.id), "Event not found");
    const rows = await meta.adminPlayersForEvent(input.id);
    return { players: rows.map((row) => toAdminMetaPlayer(row)) };
  }),

  createPlayer: os.createPlayer.handler(async ({ input, context }) => {
    const { meta } = context.repos;

    const deck = input.list === null ? null : await toDeckInput(context.repos, input.list);
    const zones = zoneCardIds(deck);

    // Shared with the candidate accept path, so the synthetic owner, the
    // public flag, and the share token are stamped in exactly one place.
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

  updatePlayer: os.updatePlayer.handler(async ({ input, context }): Promise<void> => {
    const { meta } = context.repos;
    const { id, list, ...rest } = input;

    // A moved row's target event must exist, or the FK violation would surface
    // as a 500 instead of the contract's 404.
    if (rest.eventId !== undefined) {
      assertFound(await meta.eventById(rest.eventId), "Event not found");
    }

    // Built before the scalar write so an unknown format is a 400 with nothing
    // half-applied behind it.
    const deck =
      list === undefined || list === null ? null : await toDeckInput(context.repos, list);
    const zones = zoneCardIds(deck);

    const existed = await meta.updatePlayer(id, {
      ...rest,
      ...(zones.legendCardId === null ? {} : { legendCardId: zones.legendCardId }),
      ...(zones.championCardId === null ? {} : { championCardId: zones.championCardId }),
    });
    assertExisted(existed, "Standings row not found");

    if (list === undefined) {
      return;
    }
    if (deck === null) {
      // Clears the reference before deleting the deck: `deck_id` is ON DELETE
      // RESTRICT, so a standings row never disappears with its list.
      assertExisted(await meta.clearPlayerDeck(id), "Standings row not found");
      return;
    }
    // Through the service, not the repo: giving an entry a list is what mints
    // its permalink, and the candidate accept path has to do the same thing.
    const written = await setMetaPlayerList(meta, id, deck);
    assertFound(written, "Standings row not found");
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

    // Hand-entered, so the key stays null: a provider's citation is written by
    // linking that provider's candidate, and one typed in here would either
    // collide with that unique key or outlive the link that owns it.
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
