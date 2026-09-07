import { adminMetaCandidatesContract } from "@openrift/shared/contracts/admin/meta";
import type {
  MetaEventDrift,
  MetaOverlayQueueRow,
  MetaOverlayReviewResult,
  MetaOverlayRowMatch,
} from "@openrift/shared/types/api/meta";
import { META_CATALOG_PROVIDERS, META_EVENT_OVERLAY_FIELDS } from "@openrift/shared/types/enums";
import { stringifyUnknown } from "@openrift/shared/utils";
import { implement } from "@orpc/server";

import type { Repos } from "../../../deps.js";
import { assertExisted } from "../../../lib/assertions.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { recordAdminEvent } from "../../system/services/record-admin-event.js";
import type {
  MetaEventOverlayRow,
  MetaOverlayCardRow,
  MetaPlayerOverlayRow,
} from "../repositories/meta-overlays.js";
import type {
  AdminMetaPlayerRow,
  LiveMetaPlayerRow,
  MetaEventWithCounts,
} from "../repositories/meta.js";
import { ingestMetaOverlays, splitSourcePlayerKey } from "../services/ingest-meta-overlays.js";
import {
  linkMetaCrossSourcePlayers,
  metaCrossSourceReview,
  setMetaEventSourceContributes,
  unlinkMetaCrossSourcePlayer,
} from "../services/meta-cross-source.js";
import {
  MAX_EVENT_MATCH_DAY_DELTA,
  rankPlayerMatches,
  suggestMetaEventMatches,
  suggestMetaPlayerMatches,
  summarizePlayerMatch,
  UNSCORED_PLAYER_MATCH,
} from "../services/meta-match-suggestions.js";
import {
  acceptMetaEventOverlay,
  acceptMetaPlayerOverlay,
  acceptMetaPlayerOverlays,
  linkMetaPlayerOverlay,
  listMetaUploadsForEvent,
  moveMetaEventOverlay,
  rejectMetaOverlay,
  releaseEventOverlayField,
  releaseMetaPlayerOverlayField,
  revertMetaUpload,
  writeEventOverlayFields,
  writeMetaPlayerOverlayFields,
} from "../services/meta-overlay-review.js";
import { sourceEventFacts } from "../services/meta-promote.js";

/**
 * Queue, drift, and upload endpoints on `/api/admin/v1/meta`, gated by Hono's `requireAdmin` middleware.
 * An `x-api-key` header resolves to an admin session via better-auth, so the prefix check covers script callers too.
 * Only the upload endpoint records an admin event.
 */

const os = implement(adminMetaCandidatesContract).$context<ApiContext>().use(requireAuthedUser);

const CRAWLED_PROVIDERS: ReadonlySet<string> = new Set(META_CATALOG_PROVIDERS);

/**
 * `bySource` is ordered by priority, highest last; the last matching entry wins.
 * Returns null when no source published the live value.
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
 * `from` is read off the live row; do not recompute it via promotion.
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

function unresolvedNames(cards: readonly MetaOverlayCardRow[]): string[] {
  return [...new Set(cards.filter((card) => card.cardId === null).map((card) => card.cardName))];
}

function eventQueueRow(
  overlay: MetaEventOverlayRow,
  live: MetaEventWithCounts | null,
): MetaOverlayQueueRow {
  return {
    id: overlay.id,
    kind: "event",
    status: overlay.status,
    provider: overlay.provider,
    sourceEventExternalId: overlay.externalId,
    sourcePlayerExternalId: null,
    eventOverlayId: null,
    metaEventId: overlay.metaEventId,
    metaEventPlayerId: null,
    metaEventName: live?.name ?? null,
    metaEventSlug: live?.slug ?? null,
    eventDate: live?.eventDate ?? overlay.eventDate,
    eventFormat: live?.format ?? overlay.format,
    proposedName: overlay.name,
    playerName: null,
    rank: null,
    rankIsTier: null,
    match: null,
    submittedBy: overlay.submittedByUserId,
    submissionNote: overlay.submissionNote,
    changes: eventChanges(overlay, (live ?? null) as Record<string, unknown> | null),
    cards: [],
    unresolvedNames: [],
    createdAt: overlay.createdAt.toISOString(),
  };
}

function playerMatch(
  overlay: MetaPlayerOverlayRow,
  live: LiveMetaPlayerRow | null,
  standings: readonly AdminMetaPlayerRow[] | undefined,
): MetaOverlayRowMatch {
  const playerName = overlay.playerName ?? live?.playerName ?? null;
  const rank = overlay.rank ?? live?.rank ?? null;
  if (standings === undefined || playerName === null || rank === null) {
    return live === null ? UNSCORED_PLAYER_MATCH : summarizePlayerMatch([], live);
  }
  return summarizePlayerMatch(
    rankPlayerMatches({ playerName, rank }, standings, overlay.metaEventPlayerId),
    live,
  );
}

async function queueRows(
  repos: Repos,
  events: readonly MetaEventOverlayRow[],
  players: readonly MetaPlayerOverlayRow[],
  cardsByOverlay: ReadonlyMap<string, MetaOverlayCardRow[]>,
): Promise<MetaOverlayQueueRow[]> {
  const { metaOverlays, meta, catalog } = repos;

  const livePlayers = await meta.livePlayersByIds(
    players.map((row) => row.metaEventPlayerId).filter((id): id is string => id !== null),
  );
  const livePlayersById = new Map(livePlayers.map((row) => [row.id, row]));

  const parentIds = new Set(
    players
      .filter((row) => row.metaEventId === null && row.metaEventPlayerId === null)
      .map((row) => row.eventOverlayId)
      .filter((id): id is string => id !== null),
  );
  const parents = new Map(
    await Promise.all(
      [...parentIds].map(
        async (id) => [id, (await metaOverlays.eventOverlayById(id)) ?? null] as const,
      ),
    ),
  );

  const eventIdFor = (overlay: MetaPlayerOverlayRow): string | null => {
    if (overlay.metaEventId !== null) {
      return overlay.metaEventId;
    }
    if (overlay.metaEventPlayerId !== null) {
      return livePlayersById.get(overlay.metaEventPlayerId)?.metaEventId ?? null;
    }
    if (overlay.eventOverlayId !== null) {
      return parents.get(overlay.eventOverlayId)?.metaEventId ?? null;
    }
    return null;
  };
  const playerEventIds = players.map((overlay) => eventIdFor(overlay));

  const eventIds = new Set([
    ...events.map((row) => row.metaEventId).filter((id): id is string => id !== null),
    ...playerEventIds.filter((id): id is string => id !== null),
  ]);
  const [liveEvents, cardNames] = await Promise.all([
    meta.eventsByIds([...eventIds]),
    catalog.cardNamesByIds([...new Set(cardIdsInChanges([...players, ...livePlayers]))]),
  ]);
  const liveEventsById = new Map(liveEvents.map((row) => [row.id, row]));

  const standingsEventIds = [...new Set(playerEventIds.filter((id): id is string => id !== null))];
  const standingsByEvent = new Map(
    await Promise.all(
      standingsEventIds.map(async (id) => [id, await meta.adminPlayersForEvent(id)] as const),
    ),
  );

  const eventRows = events.map((overlay) =>
    eventQueueRow(
      overlay,
      overlay.metaEventId === null ? null : (liveEventsById.get(overlay.metaEventId) ?? null),
    ),
  );

  const playerRows = players.map((overlay): MetaOverlayQueueRow => {
    const live =
      overlay.metaEventPlayerId === null
        ? null
        : (livePlayersById.get(overlay.metaEventPlayerId) ?? null);
    const metaEventId = eventIdFor(overlay);
    const liveEvent = metaEventId === null ? null : (liveEventsById.get(metaEventId) ?? null);
    const cards = cardsByOverlay.get(overlay.id) ?? [];
    return {
      id: overlay.id,
      kind: "player",
      status: overlay.status,
      provider: overlay.provider,
      ...playerSourceIds(overlay),
      eventOverlayId: overlay.eventOverlayId,
      metaEventId,
      metaEventPlayerId: overlay.metaEventPlayerId,
      metaEventName: liveEvent?.name ?? null,
      metaEventSlug: liveEvent?.slug ?? null,
      eventDate: liveEvent?.eventDate ?? null,
      eventFormat: liveEvent?.format ?? null,
      proposedName: null,
      playerName: overlay.playerName ?? live?.playerName ?? null,
      rank: overlay.rank ?? live?.rank ?? null,
      rankIsTier: overlay.rankIsTier ?? live?.rankIsTier ?? null,
      match: playerMatch(
        overlay,
        live,
        metaEventId === null ? undefined : standingsByEvent.get(metaEventId),
      ),
      submittedBy: overlay.submittedByUserId,
      submissionNote: overlay.submissionNote,
      changes: playerChanges(overlay, (live ?? null) as Record<string, unknown> | null, cardNames),
      cards: toCardRows(cards),
      unresolvedNames: unresolvedNames(cards),
      createdAt: overlay.createdAt.toISOString(),
    };
  });

  return [...eventRows, ...playerRows];
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
    const { metaOverlays } = context.repos;
    const [events, players] = await Promise.all([
      metaOverlays.pendingEventOverlays(),
      metaOverlays.pendingPlayerOverlays(),
    ]);
    const cardsByOverlay = await metaOverlays.cardsByOverlayIds(
      players.map((row: MetaPlayerOverlayRow) => row.id),
    );
    const overlays = await queueRows(context.repos, events, players, cardsByOverlay);
    return {
      overlays: overlays.toSorted((a: MetaOverlayQueueRow, b: MetaOverlayQueueRow) =>
        a.createdAt.localeCompare(b.createdAt),
      ),
    };
  }),

  detail: os.detail.handler(async ({ input, context, errors }) => {
    const { metaOverlays } = context.repos;
    const eventOverlay = await metaOverlays.eventOverlayById(input.id);
    if (eventOverlay !== undefined) {
      const [row] = await queueRows(context.repos, [eventOverlay], [], new Map());
      if (row === undefined) {
        throw errors.NOT_FOUND();
      }
      return row;
    }

    const playerOverlay = await metaOverlays.playerOverlayById(input.id);
    if (playerOverlay === undefined) {
      throw errors.NOT_FOUND();
    }
    const [row] = await queueRows(
      context.repos,
      [],
      [playerOverlay],
      new Map([[playerOverlay.id, playerOverlay.cards]]),
    );
    if (row === undefined) {
      throw errors.NOT_FOUND();
    }
    return row;
  }),

  /**
   * What each linked mirror says about one event, beside what live shows.
   * A field an accepted overlay claims is marked, not shown as a conflict.
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

    // Uses sourceEventFacts, not raw mirror columns: must match what promotion computes.
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
      acceptMetaPlayerOverlay(context.repos, input.id, {
        metaEventPlayerId: input.metaEventPlayerId,
        fields: input.fields,
        reviewedByUserId: context.userId,
      }),
  ),
  acceptPlayerOverlays: os.acceptPlayerOverlays.handler(({ input, context }) =>
    acceptMetaPlayerOverlays(context.repos, input.items, context.userId),
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

  crossSourceReview: os.crossSourceReview.handler(async ({ input, context, errors }) => {
    if ((await context.repos.meta.eventById(input.id)) === undefined) {
      throw errors.NOT_FOUND();
    }
    return await metaCrossSourceReview(context.repos, input.id);
  }),

  linkCrossSourcePlayers: os.linkCrossSourcePlayers.handler(
    async ({ input, context }): Promise<void> => {
      await linkMetaCrossSourcePlayers(context.repos, input.id, input.links);
    },
  ),

  unlinkCrossSourcePlayer: os.unlinkCrossSourcePlayer.handler(
    async ({ input, context }): Promise<void> => {
      await unlinkMetaCrossSourcePlayer(
        context.repos,
        input.id,
        input.provider,
        input.sourceIdentity,
      );
    },
  ),

  setSourceContributes: os.setSourceContributes.handler(
    async ({ input, context }): Promise<void> => {
      await setMetaEventSourceContributes(context.repos, input.id, input.contributes);
    },
  ),
});
