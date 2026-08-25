import { ERROR_CODES } from "@openrift/shared";
import type { AdminMetaEvent } from "@openrift/shared";
import { adminMetaContract } from "@openrift/shared/contracts/admin/meta";
import { implement } from "@orpc/server";
import type { Updateable } from "kysely";

import type { MetaEventsTable } from "../../db/index.js";
import { AppError } from "../../errors.js";
import { assertFound, assertSlugAvailable } from "../../lib/assertions.js";
import { assertKnownFormat, validateFormatConfig } from "../../lib/deck-format-validation.js";
import { toAdminMetaDeck, toAdminMetaEvent, toMetaEventSource } from "../../lib/meta-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import type { MetaDeckCardInput } from "../../repositories/meta.js";
import { createArchivedDeck, updateArchivedDeck } from "../../services/create-archived-deck.js";

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

/**
 * Meta archive curation, mounted under `/api/admin/v1/meta`. The Hono
 * `requireAdmin` middleware on that prefix is the only role check — no
 * handler here re-derives it, and the archive is deliberately not a grantable
 * admin section.
 *
 * Archived decks are created here rather than through the deck builder, so
 * this is the single place that stamps the synthetic owner and the public
 * flag. Both live in the repo's transaction; nothing in this file can mint a
 * deck under a different owner.
 */
export const adminMetaRouter = {
  listEvents: os.listEvents.handler(async ({ context }) => {
    const rows = await context.repos.meta.listEvents();
    return { events: rows.map((row) => toAdminMetaEvent(row)) };
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
    });
    return toAdminMetaEvent(row);
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

  eventDecks: os.eventDecks.handler(async ({ input, context }) => {
    const { meta } = context.repos;
    assertFound(await meta.eventById(input.id), "Event not found");
    const rows = await meta.adminDecksForEvent(input.id);
    return { decks: rows.map((row) => toAdminMetaDeck(row)) };
  }),

  createDeck: os.createDeck.handler(async ({ input, context }) => {
    const { meta, deckFormats, customTags } = context.repos;

    await assertKnownFormat(deckFormats, input.format);
    const formatConfig = await validateFormatConfig(customTags, input.format, input.formatConfig);

    // Shared with the candidate accept path, so the synthetic owner, the
    // public flag, and the share token are stamped in exactly one place.
    const result = await createArchivedDeck(meta, {
      eventId: input.eventId,
      name: input.name,
      format: input.format,
      formatConfig,
      cards: toCardInputs(input.cards),
      playerName: input.playerName,
      finishTier: input.finishTier,
      record: input.record ?? null,
      listStatus: input.listStatus,
    });

    assertFound(result, "Event not found");
    return result;
  }),

  updateDeck: os.updateDeck.handler(async ({ input, context }): Promise<void> => {
    const { meta } = context.repos;
    const { id, cards, ...rest } = input;

    // A moved deck's target event must exist, or the FK violation would
    // surface as a 500 instead of the contract's 404.
    if (rest.eventId !== undefined) {
      assertFound(await meta.eventById(rest.eventId), "Event not found");
    }

    // Through the service, not the repo: filling in a previously unknown list
    // is what mints the deck's permalink, and the candidate accept path has to
    // do the same thing.
    const updated = await updateArchivedDeck(meta, id, {
      ...rest,
      ...(cards === undefined ? {} : { cards: toCardInputs(cards) }),
    });
    assertExisted(updated, "Archived deck not found");
  }),

  deleteDeck: os.deleteDeck.handler(async ({ input, context }): Promise<void> => {
    assertExisted(await context.repos.meta.deleteDeck(input.id), "Archived deck not found");
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
