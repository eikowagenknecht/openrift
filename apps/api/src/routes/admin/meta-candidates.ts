import { ERROR_CODES } from "@openrift/shared";
import type { MetaCandidatePlayer } from "@openrift/shared";
import { adminMetaCandidatesContract } from "@openrift/shared/contracts/admin/meta";
import { normalizeNameForIdentity } from "@openrift/shared/utils";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import type { MetaPlayerDiff } from "../../lib/meta-candidate-diff.js";
import {
  collapseCardEntries,
  diffMetaEvent,
  diffMetaPlayer,
  resolveMetaPlayerCards,
} from "../../lib/meta-candidate-diff.js";
import {
  toMetaCandidateDetail,
  toMetaCandidatePlayer,
  toMetaCandidateQueueRow,
  toMetaCandidateSource,
  unresolvedCardNames,
} from "../../lib/meta-candidate-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { CandidateMetaPlayerRow } from "../../repositories/meta-candidates.js";
import { MAX_EVENT_MATCH_DAY_DELTA } from "../../services/meta-match-suggestions.js";
import { recordAdminEvent } from "../../services/record-admin-event.js";

const os = implement(adminMetaCandidatesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Unresolved rows are dropped, and rows that landed on the same card and zone
 * are summed — the accept path folds them the same way before writing
 * `deck_cards`, so without the collapse an accepted list would keep reading as
 * changed against the row it just wrote.
 */
function resolvedEntries(player: CandidateMetaPlayerRow) {
  return collapseCardEntries(
    (player.cards ?? [])
      .filter((card) => card.cardId !== null)
      .map((card) => ({ cardId: card.cardId as string, zone: card.zone, quantity: card.quantity })),
  );
}

/**
 * One lookup per distinct submitter, not a join: a provider's rows carry no
 * submitter at all, and an event's roster holds a handful of contributors at
 * most. Absent entries mean the account is gone.
 */
async function resolveSubmitterNames(
  users: ApiContext["repos"]["users"],
  players: readonly CandidateMetaPlayerRow[],
): Promise<Map<string, string | null>> {
  const ids = [
    ...new Set(
      players.map((player) => player.submittedByUserId).filter((id): id is string => id !== null),
    ),
  ];
  const rows = await Promise.all(ids.map((id) => users.findById(id)));
  return new Map(rows.filter((row) => row !== undefined).map((row) => [row.id, row.name] as const));
}

/**
 * Tells the multi-source overwrite refusal apart from the other 409 the accept
 * can produce (no free slug for a new event's name). Both arrive as
 * `AppError(409, CONFLICT)` and the UI owes them opposite responses: a slug
 * collision is a dead end, while an unconfirmed overwrite is answered by
 * retrying with `overwriteAll`. The two cannot both happen to one candidate —
 * a slug is only minted on the unlinked path, and only a linked candidate can
 * overwrite another source — so the link is what separates them. Returns the
 * refusal to re-label, or null to rethrow the original.
 */
async function overwriteRefusal(
  repos: ApiContext["repos"],
  candidateEventId: string,
  error: unknown,
): Promise<AppError | null> {
  if (!(error instanceof AppError)) {
    return null;
  }
  if (error.status !== 409 || error.code !== ERROR_CODES.CONFLICT) {
    return null;
  }
  const candidate = await repos.metaCandidates.eventById(candidateEventId);
  if (candidate === undefined || candidate.metaEventId === null) {
    return null;
  }
  return error;
}

function assertExisted(existed: boolean, message: string): void {
  if (!existed) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }
}

/**
 * The meta archive's candidate ingest and review queue, on the same
 * `/api/admin/v1/meta` prefix the Hono `requireAdmin` middleware gates. The
 * upload endpoint needs no extra auth work: an `x-api-key` from the maintainer's
 * tooling resolves to an admin session through better-auth, so the prefix check
 * already covers script callers.
 *
 * The queue and the detail view both compute their diffs here rather than
 * storing them: `checked_at` records that a human looked at a row, not that the
 * row matched live, and conflating the two would hide a live edit made after
 * the review.
 *
 * Admin events are recorded only for the upload, the one action a
 * non-interactive caller performs.
 */
export const adminMetaCandidatesRouter = {
  upload: os.upload.handler(async ({ input, context }) => {
    const provider = input.provider.trim();
    const result = await context.services.ingestMetaCandidates(
      context.transact,
      provider,
      input.events,
    );

    // Counts only — the detail arrays are unbounded.
    await recordAdminEvent(context.repos, context.userId, {
      action: "meta-candidates.upload",
      entityType: "upload",
      entityId: provider,
      entityLabel: provider,
      newValues: {
        newEvents: result.newEvents,
        updatedEvents: result.updatedEvents,
        unchangedEvents: result.unchangedEvents,
        newPlayers: result.newPlayers,
        updatedPlayers: result.updatedPlayers,
        removedPlayers: result.removedPlayers,
        unchangedPlayers: result.unchangedPlayers,
        ignoredSkipped: result.ignoredSkipped,
        errors: result.errors.length,
      },
    });

    return result;
  }),

  list: os.list.handler(async ({ context }) => {
    const { metaCandidates } = context.repos;

    const [events, players] = await Promise.all([
      metaCandidates.listEvents(),
      metaCandidates.allPlayers(),
    ]);

    const linkedIds = events
      .map((event) => event.metaEventId)
      .filter((id): id is string => id !== null);
    const liveEvents = await metaCandidates.liveEventsByIds(linkedIds);
    const liveById = new Map(liveEvents.map((row) => [row.id, row]));
    const playersByEvent = Map.groupBy(players, (player) => player.candidateEventId);
    // Counted off the queue itself, so a row's source count agrees with the
    // columns its review screen will show.
    const siblingsByLiveEvent = Map.groupBy(events, (event) => event.metaEventId);

    return {
      candidates: events.map((event) => {
        const own = playersByEvent.get(event.id) ?? [];
        const live = event.metaEventId === null ? undefined : liveById.get(event.metaEventId);
        return toMetaCandidateQueueRow(event, {
          playerRowCount: own.length,
          unacceptedPlayerCount: own.filter((player) => player.metaEventPlayerId === null).length,
          unresolvedCardCount: own.reduce(
            (total, player) => total + unresolvedCardNames(player.cards).length,
            0,
          ),
          linkedSourceCount:
            event.metaEventId === null
              ? 0
              : (siblingsByLiveEvent.get(event.metaEventId)?.length ?? 0),
          hasDiff: live !== undefined && diffMetaEvent(live, event).length > 0,
          metaEventSlug: live?.slug ?? null,
        });
      }),
    };
  }),

  detail: os.detail.handler(async ({ input, context }) => {
    const { meta, metaCandidates, deckFormats, users } = context.repos;

    const event = await metaCandidates.eventById(input.id);
    if (event === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate event not found");
    }

    // Every candidate describing the same live event, this one included, so the
    // review screen renders one column per source from a single request.
    const siblings =
      event.metaEventId === null
        ? [event]
        : await metaCandidates.eventsByMetaEventId(event.metaEventId);
    const parentById = new Map(siblings.map((row) => [row.id, row]));

    // User submissions hang off the live event directly, so they join the
    // roster while belonging to no source column.
    const [sourcePlayers, submitted] = await Promise.all([
      metaCandidates.playersByCandidateEventIds(siblings.map((row) => row.id)),
      event.metaEventId === null
        ? Promise.resolve<CandidateMetaPlayerRow[]>([])
        : metaCandidates.playersByMetaEventIds([event.metaEventId]),
    ]);
    const allPlayers = [...sourcePlayers, ...submitted];
    const livePlayerIds = allPlayers
      .map((player) => player.metaEventPlayerId)
      .filter((id): id is string => id !== null);

    const [livePlayers, format] = await Promise.all([
      meta.livePlayersByIds(livePlayerIds),
      deckFormats.getBySlug(event.format),
    ]);
    const liveDeckCards = await metaCandidates.liveDeckCards(
      livePlayers.map((row) => row.deckId).filter((id): id is string => id !== null),
    );

    // The sources' own live events plus whichever events their linked rows
    // currently sit under. Those usually coincide; when they don't, the row was
    // re-parented and accepting it would move it, which the diff has to say.
    const eventIds = new Set(livePlayers.map((row) => row.metaEventId));
    for (const sibling of siblings) {
      if (sibling.metaEventId !== null) {
        eventIds.add(sibling.metaEventId);
      }
    }
    const liveEvents = await metaCandidates.liveEventsByIds([...eventIds]);
    const liveEventNames = new Map(liveEvents.map((row) => [row.id, row.name]));

    const live = liveEvents.find((row) => row.id === event.metaEventId);
    const livePlayerById = new Map(livePlayers.map((row) => [row.id, row]));
    const liveCardsByDeck = Map.groupBy(liveDeckCards, (row) => row.deckId);

    // One lookup for every card the response names: the candidates' own rows
    // and whatever only the live side still holds (a removed card).
    const cardIds = new Set<string>();
    for (const player of allPlayers) {
      for (const card of player.cards ?? []) {
        if (card.cardId !== null) {
          cardIds.add(card.cardId);
        }
      }
      const resolved = resolveMetaPlayerCards(player);
      for (const id of [resolved.legendCardId, resolved.championCardId]) {
        if (id !== null) {
          cardIds.add(id);
        }
      }
    }
    for (const row of liveDeckCards) {
      cardIds.add(row.cardId);
    }
    const [cardNames, submitterNames] = await Promise.all([
      metaCandidates.cardNamesByIds([...cardIds]),
      resolveSubmitterNames(users, allPlayers),
    ]);

    function targetEventId(player: CandidateMetaPlayerRow): string | null {
      if (player.metaEventId !== null) {
        return player.metaEventId;
      }
      const parent =
        player.candidateEventId === null ? undefined : parentById.get(player.candidateEventId);
      return parent?.metaEventId ?? null;
    }

    function presentPlayer(player: CandidateMetaPlayerRow): MetaCandidatePlayer {
      const livePlayer =
        player.metaEventPlayerId === null
          ? undefined
          : livePlayerById.get(player.metaEventPlayerId);
      let diff: MetaPlayerDiff | null = null;
      if (livePlayer !== undefined) {
        const resolved = resolveMetaPlayerCards(player);
        diff = diffMetaPlayer(
          {
            event: livePlayer.metaEventId,
            playerName: livePlayer.playerName,
            rank: livePlayer.rank,
            rankIsTier: livePlayer.rankIsTier,
            wins: livePlayer.wins,
            losses: livePlayer.losses,
            draws: livePlayer.draws,
            legendCardId: livePlayer.legendCardId,
            championCardId: livePlayer.championCardId,
            listStatus: livePlayer.listStatus,
            cards: livePlayer.deckId === null ? [] : (liveCardsByDeck.get(livePlayer.deckId) ?? []),
          },
          {
            // Accepting re-parents the live row onto the source's own event, so
            // a mismatch here is a move the reviewer has to see.
            event: targetEventId(player),
            playerName: player.playerName,
            rank: player.rank,
            rankIsTier: player.rankIsTier,
            wins: player.wins,
            losses: player.losses,
            draws: player.draws,
            legendCardId: resolved.legendCardId,
            championCardId: resolved.championCardId,
            // A source publishing standings only is not proposing to strip a
            // list another source contributed, so the live values stand in.
            listStatus: player.cards === null ? livePlayer.listStatus : player.listStatus,
            cards:
              player.cards === null
                ? livePlayer.deckId === null
                  ? []
                  : (liveCardsByDeck.get(livePlayer.deckId) ?? [])
                : resolvedEntries(player),
          },
        );
      }
      return toMetaCandidatePlayer(player, {
        diff,
        deckId: livePlayer?.deckId ?? null,
        shareToken: livePlayer?.shareToken ?? null,
        cardNames,
        eventNames: liveEventNames,
        submittedByName:
          player.submittedByUserId === null
            ? null
            : (submitterNames.get(player.submittedByUserId) ?? null),
      });
    }

    const playersByParent = Map.groupBy(sourcePlayers, (player) => player.candidateEventId);

    return toMetaCandidateDetail(event, {
      diff: live === undefined ? null : diffMetaEvent(live, event),
      formatKnown: format !== undefined,
      metaEventSlug: live?.slug ?? null,
      players: (playersByParent.get(event.id) ?? []).map((player) => presentPlayer(player)),
      sources: siblings.map((sibling) =>
        toMetaCandidateSource(
          sibling,
          (playersByParent.get(sibling.id) ?? []).map((player) => presentPlayer(player)),
        ),
      ),
      submittedPlayers: submitted.map((player) => presentPlayer(player)),
    });
  }),

  rematch: os.rematch.handler(({ context }) =>
    context.services.rematchMetaCandidates(context.repos),
  ),

  // The alias-fix flow in one call: record "this source name means that card"
  // in card_name_aliases (shared with the card pipeline, so the fix applies to
  // every future upload from any source), then rematch so the unblocked rows
  // update immediately.
  resolveName: os.resolveName.handler(async ({ input, context }) => {
    const { catalog, catalogMutations } = context.repos;

    // The matcher keys on the normalized form, so a name made only of
    // punctuation or spacing would store an alias no upload can ever hit.
    const normName = normalizeNameForIdentity(input.name);
    if (normName === "") {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "That name normalizes to nothing matchable. Use the name as the source spells it.",
      );
    }

    const [card] = await catalog.cardsByIds([input.cardId]);
    if (card === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card not found");
    }

    await catalogMutations.createNameAliases(normName, input.cardId);
    return context.services.rematchMetaCandidates(context.repos);
  }),

  acceptEvent: os.acceptEvent.handler(async ({ input, context, errors }) => {
    try {
      return await context.services.acceptCandidateEvent(context.repos, input.id, {
        overwriteAll: input.overwriteAll,
      });
    } catch (error) {
      const refusal = await overwriteRefusal(context.repos, input.id, error);
      if (refusal !== null) {
        throw errors.OVERWRITE_NOT_CONFIRMED({ message: refusal.message });
      }
      throw error;
    }
  }),

  acceptEventWithPlayers: os.acceptEventWithPlayers.handler(async ({ input, context, errors }) => {
    try {
      return await context.services.acceptCandidateEventWithPlayers(context.repos, input.id, {
        overwriteAll: input.overwriteAll,
        allowUnresolvedLegend: input.allowUnresolvedLegend,
        resolvedByUserId: context.userId,
      });
    } catch (error) {
      const refusal = await overwriteRefusal(context.repos, input.id, error);
      if (refusal !== null) {
        throw errors.OVERWRITE_NOT_CONFIRMED({ message: refusal.message });
      }
      throw error;
    }
  }),

  acceptPlayer: os.acceptPlayer.handler(({ input, context }) =>
    context.services.acceptCandidatePlayer(context.repos, input.id, {
      allowUnresolvedLegend: input.allowUnresolvedLegend,
      resolvedByUserId: context.userId,
    }),
  ),

  checkEvent: os.checkEvent.handler(async ({ input, context }): Promise<void> => {
    const existed = await context.repos.metaCandidates.setEventCheckedAt(
      input.id,
      input.checked ? new Date() : null,
    );
    assertExisted(existed, "Candidate event not found");
  }),

  checkPlayer: os.checkPlayer.handler(async ({ input, context }): Promise<void> => {
    const existed = await context.repos.metaCandidates.setPlayerCheckedAt(
      input.id,
      input.checked ? new Date() : null,
    );
    assertExisted(existed, "Candidate player not found");
  }),

  ignoreEvent: os.ignoreEvent.handler(async ({ input, context }): Promise<void> => {
    const { metaCandidates } = context.repos;
    const event = await metaCandidates.eventById(input.id);
    if (event === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate event not found");
    }
    // Writes the ignore key and keeps the staged row. The queue reads join
    // against the ignore table, so the event drops out of view now and every
    // later upload skips it — while its link survives, which is what makes an
    // un-ignore resolve back to the same live event instead of a duplicate.
    await metaCandidates.ignoreEvent(event.provider, event.externalId);
  }),

  ignorePlayer: os.ignorePlayer.handler(async ({ input, context }): Promise<void> => {
    const { metaCandidates } = context.repos;
    const player = await metaCandidates.playerById(input.id);
    if (player === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate player not found");
    }
    // A user submission hangs off the live event and has no source event to key
    // an ignore on (the key is `(provider, event external id, external id)`), so
    // rejecting one is a ledger resolution, not an ignore entry. The verb this
    // points at is `adminMetaSubmissionsContract.resolve`, which also tells the
    // contributor what happened — an ignore entry would tell them nothing.
    if (player.candidateEventId === null) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "A user submission has no source event to ignore. Resolve its submission instead.",
      );
    }
    const parent = await metaCandidates.eventById(player.candidateEventId);
    if (parent === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate event not found");
    }
    // The key names the source's event, not the candidate row it hangs off:
    // player ids restart per event, so ignoring "1" here must not also silence
    // entry "1" of every other event this provider pushes.
    await metaCandidates.ignorePlayer(parent.provider, {
      eventExternalId: parent.externalId,
      externalId: player.externalId,
    });
  }),

  listIgnored: os.listIgnored.handler(async ({ context }) => {
    const { events, players } = await context.repos.metaCandidates.listIgnored();
    const toRow = (row: { provider: string; externalId: string; createdAt: Date }) => ({
      provider: row.provider,
      externalId: row.externalId,
      createdAt: row.createdAt.toISOString(),
    });
    return {
      events: events.map((row) => toRow(row)),
      players: players.map((row) => ({ ...toRow(row), eventExternalId: row.eventExternalId })),
    };
  }),

  unignoreEvent: os.unignoreEvent.handler(async ({ input, context }): Promise<void> => {
    const removed = await context.repos.metaCandidates.unignoreEvent(
      input.provider,
      input.externalId,
    );
    assertExisted(removed, "Ignore entry not found");
  }),

  unignorePlayer: os.unignorePlayer.handler(async ({ input, context }): Promise<void> => {
    const removed = await context.repos.metaCandidates.unignorePlayer(input.provider, {
      eventExternalId: input.eventExternalId,
      externalId: input.externalId,
    });
    assertExisted(removed, "Ignore entry not found");
  }),

  // The link services own the whole rule set: a link writes this provider's
  // citation, a relink moves it, an unlink removes it and takes back the
  // contributor credit that link earned. None of them writes a field value.

  linkCandidateEvent: os.linkCandidateEvent.handler(({ input, context }) =>
    context.services.linkCandidateEvent(context.repos, input.id, input.metaEventId),
  ),

  relinkCandidateEvent: os.relinkCandidateEvent.handler(({ input, context }) =>
    context.services.relinkCandidateEvent(context.repos, input.id, input.metaEventId),
  ),

  unlinkCandidateEvent: os.unlinkCandidateEvent.handler(({ input, context }) =>
    context.services.unlinkCandidateEvent(context.repos, input.id),
  ),

  linkCandidatePlayer: os.linkCandidatePlayer.handler(({ input, context }) =>
    context.services.linkCandidatePlayer(context.repos, input.id, input.metaEventPlayerId),
  ),

  relinkCandidatePlayer: os.relinkCandidatePlayer.handler(({ input, context }) =>
    context.services.relinkCandidatePlayer(context.repos, input.id, input.metaEventPlayerId),
  ),

  unlinkCandidatePlayer: os.unlinkCandidatePlayer.handler(({ input, context }) =>
    context.services.unlinkCandidatePlayer(context.repos, input.id),
  ),

  // The reviewing admin is passed along because a player accept settles any
  // submission ledger row behind it, and that row records who resolved it.

  acceptMetaEventField: os.acceptMetaEventField.handler(({ input, context }) =>
    context.services.acceptMetaEventField(context.repos, {
      candidateEventId: input.id,
      field: input.field,
    }),
  ),

  acceptMetaPlayerField: os.acceptMetaPlayerField.handler(({ input, context }) =>
    context.services.acceptMetaPlayerField(
      context.repos,
      { candidatePlayerId: input.id, field: input.field },
      { resolvedByUserId: context.userId },
    ),
  ),

  acceptMetaDeckList: os.acceptMetaDeckList.handler(({ input, context }) =>
    context.services.acceptMetaDeckList(context.repos, input.id, {
      resolvedByUserId: context.userId,
    }),
  ),

  // Suggestions are hints, never actions: an empty list is a normal answer
  // (already linked, or nothing close enough), so neither of these 404s on a
  // missing candidate.

  eventMatchSuggestions: os.eventMatchSuggestions.handler(async ({ input, context }) => ({
    suggestions: await context.services.suggestMetaEventMatches(context.repos, input.id),
    windowDays: MAX_EVENT_MATCH_DAY_DELTA,
  })),

  playerMatchSuggestions: os.playerMatchSuggestions.handler(async ({ input, context }) => ({
    suggestions: await context.services.suggestMetaPlayerMatches(context.repos, input.id),
  })),
};
