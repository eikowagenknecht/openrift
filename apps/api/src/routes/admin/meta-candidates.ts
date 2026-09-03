import type {
  MetaEventDrift,
  MetaOverlayQueueRow,
  MetaOverlayReviewResult,
} from "@openrift/shared";
import { adminMetaCandidatesContract } from "@openrift/shared/contracts/admin/meta";
import { META_EVENT_OVERLAY_FIELDS } from "@openrift/shared/types";
import { stringifyUnknown } from "@openrift/shared/utils";
import { implement } from "@orpc/server";

import { assertExisted } from "../../lib/assertions.js";
import { PLAYLOLTCG_PROVIDER } from "../../lib/playloltcg-catalog.js";
import { UVSGAMES_PROVIDER } from "../../lib/uvsgames-catalog.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type {
  MetaEventOverlayRow,
  MetaOverlayCardRow,
  MetaPlayerOverlayRow,
} from "../../repositories/meta-overlays.js";
import { ingestMetaOverlays, splitSourcePlayerKey } from "../../services/ingest-meta-overlays.js";
import {
  MAX_EVENT_MATCH_DAY_DELTA,
  suggestMetaEventMatches,
  suggestMetaPlayerMatches,
} from "../../services/meta-match-suggestions.js";
import {
  acceptMetaEventOverlay,
  acceptMetaPlayerOverlay,
  linkMetaPlayerOverlay,
  listMetaUploadsForEvent,
  moveMetaEventOverlay,
  rejectMetaOverlay,
  releaseEventOverlayField,
  releaseMetaPlayerOverlayField,
  revertMetaUpload,
  writeEventOverlayFields,
  writeMetaPlayerOverlayFields,
} from "../../services/meta-overlay-review.js";
import { sourceEventFacts } from "../../services/meta-promote.js";
import { recordAdminEvent } from "../../services/record-admin-event.js";

/**
 * The overlay queue, the drift view, and the push endpoint (ADR-014 revision 3),
 * on the same `/api/admin/v1/meta` prefix the Hono `requireAdmin` middleware
 * gates. The upload endpoint needs no extra auth work: an `x-api-key` from the
 * maintainer's tooling resolves to an admin session through better-auth, so
 * the prefix check already covers script callers.
 *
 * Reviewing is two jobs. The queue settles what people proposed; drift shows
 * where the sources and the live row disagree, and its remedies are a source
 * priority or an overlay. Neither screen writes a field directly, which is what
 * keeps "who owns this value" answerable from the data rather than from
 * whichever handler last ran.
 *
 * Admin events are recorded only for the upload, the one action a
 * non-interactive caller performs.
 */

const os = implement(adminMetaCandidatesContract).$context<ApiContext>().use(requireAuthedUser);

/** Providers with a crawler, and therefore a mirror promotion can read. */
const CRAWLED_PROVIDERS = new Set([UVSGAMES_PROVIDER, PLAYLOLTCG_PROVIDER]);

/**
 * Which linked source the live value came from.
 *
 * The last source to publish it, because promotion applies them in priority
 * order and the highest priority wins. Null when no source published it, which
 * is what a hand-entered value looks like.
 */
function winningSource(
  sources: readonly { label: string; provider: string | null }[],
  bySource: readonly (string | null)[],
  live: string | null,
): string | null {
  for (let index = bySource.length - 1; index >= 0; index--) {
    if (bySource[index] !== null && bySource[index] === live) {
      return sources[index]?.provider ?? sources[index]?.label ?? null;
    }
  }
  return null;
}

function display(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return stringifyUnknown(value);
}

/**
 * The claimed fields of one overlay, each paired with what live holds.
 *
 * `from` is read off the live row rather than recomputed, so the reviewer sees
 * the change they are actually approving rather than what promotion would
 * produce in isolation.
 */
function eventChanges(
  overlay: MetaEventOverlayRow,
  live: Record<string, unknown> | null,
): MetaOverlayQueueRow["changes"] {
  const values = overlay as unknown as Record<string, unknown>;
  return overlay.claimedFields.map((field) => ({
    field,
    from: display(live?.[field] ?? null),
    to: display(values[field] ?? null),
  }));
}

const CARD_ID_FIELDS = ["legendCardId", "championCardId"] as const;

function playerChanges(
  overlay: MetaPlayerOverlayRow,
  live: Record<string, unknown> | null,
  cardNames: ReadonlyMap<string, string>,
): MetaOverlayQueueRow["changes"] {
  const values = overlay as unknown as Record<string, unknown>;
  const show = (field: string, value: unknown): string | null => {
    const text = display(value);
    if (text === null || !(CARD_ID_FIELDS as readonly string[]).includes(field)) {
      return text;
    }
    return cardNames.get(text) ?? text;
  };
  return overlay.claimedFields
    .filter((field) => field !== "cards")
    .map((field) => ({
      field,
      from: show(field, live?.[field] ?? null),
      to: show(field, values[field] ?? null),
    }));
}

function cardIdsInChanges(rows: readonly (object | null | undefined)[]): string[] {
  return rows.flatMap((row) =>
    row === null || row === undefined
      ? []
      : CARD_ID_FIELDS.map((field) => (row as Record<string, unknown>)[field]).filter(
          (id): id is string => typeof id === "string",
        ),
  );
}

function playerSourceIds(overlay: MetaPlayerOverlayRow): {
  sourceEventExternalId: string | null;
  sourcePlayerExternalId: string | null;
} {
  const split = splitSourcePlayerKey(overlay.sourcePlayerKey);
  return {
    sourceEventExternalId: split.eventExternalId,
    sourcePlayerExternalId: split.playerExternalId,
  };
}

function toCardRows(cards: readonly MetaOverlayCardRow[]): MetaOverlayQueueRow["cards"] {
  return cards.map((card) => ({
    lineNumber: card.lineNumber,
    zone: card.zone,
    quantity: card.quantity,
    cardName: card.cardName,
    cardId: card.cardId,
  }));
}

export const adminMetaCandidatesRouter = os.router({
  upload: os.upload.handler(async ({ input, context }) => {
    const result = await ingestMetaOverlays(
      context.repos,
      input.provider,
      input.events,
      context.userId,
    );

    // Counts only — the detail arrays are unbounded.
    await recordAdminEvent(context.repos, context.userId, {
      action: "meta-overlays.upload",
      entityType: "upload",
      entityId: result.provider,
      entityLabel: result.provider,
      newValues: {
        newEvents: result.newEvents,
        updatedEvents: result.updatedEvents,
        unchangedEvents: result.unchangedEvents,
        newPlayers: result.newPlayers,
        updatedPlayers: result.updatedPlayers,
        unchangedPlayers: result.unchangedPlayers,
        ignoredSkipped: result.ignoredSkipped,
        errors: result.errors.length,
      },
    });

    return result;
  }),

  list: os.list.handler(async ({ context }) => {
    const { metaOverlays, meta, catalog } = context.repos;
    const [events, players] = await Promise.all([
      metaOverlays.pendingEventOverlays(),
      metaOverlays.pendingPlayerOverlays(),
    ]);
    const [cardsByOverlay, liveEvents, livePlayers] = await Promise.all([
      metaOverlays.cardsByOverlayIds(players.map((row: MetaPlayerOverlayRow) => row.id)),
      meta.eventsByIds(
        events
          .map((row: MetaEventOverlayRow) => row.metaEventId)
          .filter((id): id is string => id !== null),
      ),
      meta.livePlayersByIds(
        players
          .map((row: MetaPlayerOverlayRow) => row.metaEventPlayerId)
          .filter((id): id is string => id !== null),
      ),
    ]);
    const liveEventsById = new Map(liveEvents.map((row) => [row.id, row]));
    const livePlayersById = new Map(livePlayers.map((row) => [row.id, row]));
    const cardNames = await catalog.cardNamesByIds([
      ...new Set(cardIdsInChanges([...players, ...livePlayers])),
    ]);

    const eventRows: MetaOverlayQueueRow[] = events.map((overlay) => {
      const live =
        overlay.metaEventId === null ? null : (liveEventsById.get(overlay.metaEventId) ?? null);
      return {
        id: overlay.id,
        kind: "event",
        status: overlay.status,
        provider: overlay.provider,
        sourceEventExternalId: overlay.externalId,
        sourcePlayerExternalId: null,
        metaEventId: overlay.metaEventId,
        metaEventPlayerId: null,
        metaEventName: live?.name ?? null,
        proposedName: overlay.name,
        playerName: null,
        submittedBy: overlay.submittedByUserId,
        submissionNote: overlay.submissionNote,
        changes: eventChanges(overlay, (live ?? null) as Record<string, unknown> | null),
        cards: [],
        unresolvedNames: [],
        createdAt: overlay.createdAt.toISOString(),
      };
    });

    const playerRows: MetaOverlayQueueRow[] = [];
    for (const overlay of players) {
      const live =
        overlay.metaEventPlayerId === null
          ? null
          : (livePlayersById.get(overlay.metaEventPlayerId) ?? null);
      const cards = cardsByOverlay.get(overlay.id) ?? [];
      playerRows.push({
        id: overlay.id,
        kind: "player",
        status: overlay.status,
        provider: overlay.provider,
        ...playerSourceIds(overlay),
        metaEventId: overlay.metaEventId,
        metaEventPlayerId: overlay.metaEventPlayerId,
        metaEventName: null,
        proposedName: null,
        playerName: overlay.playerName ?? live?.playerName ?? null,
        submittedBy: overlay.submittedByUserId,
        submissionNote: overlay.submissionNote,
        changes: playerChanges(
          overlay,
          (live ?? null) as Record<string, unknown> | null,
          cardNames,
        ),
        cards: toCardRows(cards),
        unresolvedNames: [
          ...new Set(
            cards
              .filter((card: MetaOverlayCardRow) => card.cardId === null)
              .map((card: MetaOverlayCardRow) => card.cardName),
          ),
        ],
        createdAt: overlay.createdAt.toISOString(),
      });
    }

    return {
      overlays: [...eventRows, ...playerRows].toSorted(
        (a: MetaOverlayQueueRow, b: MetaOverlayQueueRow) => a.createdAt.localeCompare(b.createdAt),
      ),
    };
  }),

  detail: os.detail.handler(async ({ input, context, errors }) => {
    const { metaOverlays, meta, catalog } = context.repos;
    const eventOverlay = await metaOverlays.eventOverlayById(input.id);
    if (eventOverlay !== undefined) {
      const live =
        eventOverlay.metaEventId === null ? null : await meta.eventById(eventOverlay.metaEventId);
      return {
        id: eventOverlay.id,
        kind: "event" as const,
        status: eventOverlay.status,
        provider: eventOverlay.provider,
        sourceEventExternalId: eventOverlay.externalId,
        sourcePlayerExternalId: null,
        metaEventId: eventOverlay.metaEventId,
        metaEventPlayerId: null,
        metaEventName: live?.name ?? null,
        proposedName: eventOverlay.name,
        playerName: null,
        submittedBy: eventOverlay.submittedByUserId,
        submissionNote: eventOverlay.submissionNote,
        changes: eventChanges(eventOverlay, (live ?? null) as Record<string, unknown> | null),
        cards: [],
        unresolvedNames: [],
        createdAt: eventOverlay.createdAt.toISOString(),
      };
    }

    const playerOverlay = await metaOverlays.playerOverlayById(input.id);
    if (playerOverlay === undefined) {
      throw errors.NOT_FOUND();
    }
    const live =
      playerOverlay.metaEventPlayerId === null
        ? null
        : await meta.playerById(playerOverlay.metaEventPlayerId);
    const cardNames = await catalog.cardNamesByIds([
      ...new Set(cardIdsInChanges([playerOverlay, live])),
    ]);
    return {
      id: playerOverlay.id,
      kind: "player" as const,
      status: playerOverlay.status,
      provider: playerOverlay.provider,
      ...playerSourceIds(playerOverlay),
      metaEventId: playerOverlay.metaEventId,
      metaEventPlayerId: playerOverlay.metaEventPlayerId,
      metaEventName: null,
      proposedName: null,
      playerName: playerOverlay.playerName ?? live?.playerName ?? null,
      submittedBy: playerOverlay.submittedByUserId,
      submissionNote: playerOverlay.submissionNote,
      changes: playerChanges(
        playerOverlay,
        (live ?? null) as Record<string, unknown> | null,
        cardNames,
      ),
      cards: toCardRows(playerOverlay.cards),
      unresolvedNames: [
        ...new Set(
          playerOverlay.cards.filter((card) => card.cardId === null).map((card) => card.cardName),
        ),
      ],
      createdAt: playerOverlay.createdAt.toISOString(),
    };
  }),

  /**
   * What each linked mirror says about one event, beside what live shows.
   *
   * A field an accepted overlay claims is marked rather than compared: the
   * sources no longer decide it, so showing it as a conflict would invite the
   * reviewer to fix something that is already settled.
   */
  drift: os.drift.handler(async ({ input, context, errors }): Promise<MetaEventDrift> => {
    const { meta, metaOverlays } = context.repos;
    const live = await meta.eventById(input.id);
    if (live === undefined) {
      throw errors.NOT_FOUND();
    }
    const linked = await meta.sourcesForEvent(input.id);
    const sources = linked.toSorted((a, b) => a.priority - b.priority);
    const overlays = await metaOverlays.acceptedEventOverlays(input.id);
    const claimed = new Set(overlays.flatMap((overlay) => overlay.claimedFields));

    // Promotion's own view of each source, not the raw mirror columns: a drift
    // table built from the mirror would disagree with the promote that follows
    // it, because the mapping and classification happen on the way through.
    const perSource: (Awaited<ReturnType<typeof sourceEventFacts>> | null)[] = [];
    for (const source of sources) {
      perSource.push(
        source.provider === null || source.externalId === null
          ? null
          : await sourceEventFacts(context.repos, source.provider, source.externalId),
      );
    }

    const liveValues = live as unknown as Record<string, unknown>;
    return {
      metaEventId: input.id,
      sources: sources.map((source) => ({
        id: source.id,
        provider: source.provider,
        externalId: source.externalId,
        label: source.label,
        priority: source.priority,
        hasMirror: source.provider !== null && CRAWLED_PROVIDERS.has(source.provider),
      })),
      fields: META_EVENT_OVERLAY_FIELDS.map((field) => {
        const liveValue = display(liveValues[field] ?? null);
        const bySource = perSource.map((facts) => ({
          value: display(facts?.values[field] ?? null),
          raw: facts?.raw[field] ?? null,
        }));
        return {
          field,
          live: liveValue,
          bySource,
          claimedByOverlay: claimed.has(field),
          wonBy: claimed.has(field)
            ? null
            : winningSource(
                sources,
                bySource.map((cell) => cell.value),
                liveValue,
              ),
        };
      }),
    };
  }),

  writeEventOverlayFields: os.writeEventOverlayFields.handler(
    ({ input, context }): Promise<MetaOverlayReviewResult> =>
      writeEventOverlayFields(context.repos, input.id, input.edits, context.userId),
  ),

  releaseEventOverlayField: os.releaseEventOverlayField.handler(
    ({ input, context }): Promise<MetaOverlayReviewResult> =>
      releaseEventOverlayField(context.repos, input.id, input.field),
  ),

  writePlayerOverlayFields: os.writePlayerOverlayFields.handler(
    ({ input, context }): Promise<MetaOverlayReviewResult> =>
      writeMetaPlayerOverlayFields(
        context.repos,
        input.id,
        { fields: input.fields, list: input.list },
        context.userId,
      ),
  ),

  releasePlayerOverlayField: os.releasePlayerOverlayField.handler(
    ({ input, context }): Promise<MetaOverlayReviewResult> =>
      releaseMetaPlayerOverlayField(context.repos, input.id, input.field),
  ),

  setSourcePriority: os.setSourcePriority.handler(async ({ input, context }): Promise<void> => {
    assertExisted(
      await context.repos.meta.setEventSourcePriority(input.id, input.priority),
      "Source not found",
    );
  }),

  /**
   * Files a card name against a card, then re-resolves every overlay line
   * holding it. The alias is what makes the fix stick for the next fetch too.
   */
  resolveName: os.resolveName.handler(async ({ input, context }) => {
    const updated = await context.repos.metaOverlays.resolveCardName(input.name, input.cardId);
    return { updated };
  }),

  acceptEventOverlay: os.acceptEventOverlay.handler(
    ({ input, context }): Promise<MetaOverlayReviewResult> =>
      acceptMetaEventOverlay(context.repos, input.id, input.metaEventId),
  ),

  moveEventOverlay: os.moveEventOverlay.handler(
    ({ input, context }): Promise<MetaOverlayReviewResult> =>
      moveMetaEventOverlay(context.repos, input.id, input.metaEventId),
  ),

  acceptPlayerOverlay: os.acceptPlayerOverlay.handler(
    ({ input, context }): Promise<MetaOverlayReviewResult> =>
      acceptMetaPlayerOverlay(context.repos, input.id),
  ),

  linkPlayerOverlay: os.linkPlayerOverlay.handler(
    ({ input, context }): Promise<MetaOverlayReviewResult> =>
      linkMetaPlayerOverlay(context.repos, input.id, input.metaEventPlayerId),
  ),

  rejectOverlay: os.rejectOverlay.handler(({ input, context }): Promise<MetaOverlayReviewResult> =>
    rejectMetaOverlay(context.repos, { kind: input.kind, id: input.id }),
  ),

  eventUploads: os.eventUploads.handler(async ({ input, context }) => ({
    uploads: await listMetaUploadsForEvent(context.repos, input.id),
  })),

  revertUpload: os.revertUpload.handler(({ input, context }) =>
    revertMetaUpload(context.repos, input.provider, input.externalId),
  ),

  ignoreEvent: os.ignoreEvent.handler(async ({ input, context }): Promise<void> => {
    await context.repos.metaOverlays.ignoreEvent(input.provider, input.externalId);
  }),

  ignorePlayer: os.ignorePlayer.handler(async ({ input, context }): Promise<void> => {
    await context.repos.metaOverlays.ignorePlayer(input.provider, {
      eventExternalId: input.eventExternalId,
      externalId: input.externalId,
    });
  }),

  listIgnored: os.listIgnored.handler(async ({ context }) => {
    const { events, players } = await context.repos.metaOverlays.listIgnored();
    return {
      events: events.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      players: players.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    };
  }),

  unignoreEvent: os.unignoreEvent.handler(async ({ input, context }): Promise<void> => {
    assertExisted(
      await context.repos.metaOverlays.unignoreEvent(input.provider, input.externalId),
      "Not on the ignore list",
    );
  }),

  unignorePlayer: os.unignorePlayer.handler(async ({ input, context }): Promise<void> => {
    assertExisted(
      await context.repos.metaOverlays.unignorePlayer(input.provider, {
        eventExternalId: input.eventExternalId,
        externalId: input.externalId,
      }),
      "Not on the ignore list",
    );
  }),

  eventMatchSuggestions: os.eventMatchSuggestions.handler(async ({ input, context }) => ({
    suggestions: await suggestMetaEventMatches(context.repos, input.id),
    windowDays: MAX_EVENT_MATCH_DAY_DELTA,
  })),

  playerMatchSuggestions: os.playerMatchSuggestions.handler(async ({ input, context }) => ({
    suggestions: await suggestMetaPlayerMatches(context.repos, input.id),
  })),
});
