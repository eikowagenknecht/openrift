import type { Selectable } from "kysely";

import type { MetaEventPlayersTable } from "../../../db/tables/meta.js";
import type { Repos } from "../../../deps.js";
import type { CardNameIndex } from "../../candidates/services/candidate-links.js";
import { resolveCardIdByName } from "../../candidates/services/candidate-links.js";
import { resolvedStandingName } from "../lib/meta-event-naming.js";
import type { MetaArchivedDeckInput, MetaStoredPlayerDeck } from "../repositories/meta-decks.js";
import { mergeDeckCards, sameDeckCards } from "../repositories/meta-decks.js";
import type { MetaPlayerLinkRow } from "../repositories/meta-player-links.js";
import type { MetaEventPlayerPatch, MetaEventPlayerUpdate } from "../repositories/meta-players.js";
import type { MetaEventSourceRow } from "../repositories/meta-sources.js";
import { createMetaEventPlayer, setMetaPlayerList } from "./meta-event-players.js";
import { buildDeck, loadDeckLines } from "./meta-promote-decks.js";
import type {
  MetaPromotedEventFacts,
  MetaPromoteResult,
  SourceFacts,
  StandingFacts,
} from "./meta-promote-shared.js";
import { legacyIdentityOf } from "./meta-promote-shared.js";

/** One standings row after folding, with the live row it already resolves to. */
interface MergedStanding {
  standing: StandingFacts;
  existing: Selectable<MetaEventPlayersTable> | null;
}

/**
 * Folds two mirrors' standings for one player; the later source wins each
 * field it publishes, but identity, legacyIdentity, and the deck stay pinned.
 */
function foldStanding(under: StandingFacts, over: StandingFacts): StandingFacts {
  const uvsgamesPlayerId = over.uvsgamesPlayerId ?? under.uvsgamesPlayerId;
  const withDeck = over.sourceDeckId === null ? under : over;
  return {
    identity: under.identity,
    legacyIdentity: under.legacyIdentity,
    uvsgamesPlayerId,
    playerName: uvsgamesPlayerId === null ? (over.playerName ?? under.playerName) : null,
    rank: over.rank,
    rankIsTier: over.rankIsTier,
    wins: over.wins ?? under.wins,
    losses: over.losses ?? under.losses,
    draws: over.draws ?? under.draws,
    matchPoints: over.matchPoints ?? under.matchPoints,
    opponentMatchWinPct: over.opponentMatchWinPct ?? under.opponentMatchWinPct,
    gameWinPct: over.gameWinPct ?? under.gameWinPct,
    opponentGameWinPct: over.opponentGameWinPct ?? under.opponentGameWinPct,
    entryStatus: over.entryStatus ?? under.entryStatus,
    legendName: over.legendName ?? under.legendName,
    sourceDeckId: withDeck.sourceDeckId,
    provider: withDeck.provider,
  };
}

/**
 * Every source's standings, collapsed to one entry per player: a standing's
 * own identity and a confirmed cross-mirror link both key to the same live row.
 */
function foldStandings(
  collected: readonly SourceFacts[],
  existing: readonly Selectable<MetaEventPlayersTable>[],
  links: readonly MetaPlayerLinkRow[],
): Map<string, MergedStanding> {
  const linkedRows = new Map(
    links
      .filter((link) => link.metaEventPlayerId !== null)
      .map((link) => [`${link.provider}:${link.sourceIdentity}`, link.metaEventPlayerId as string]),
  );
  // Both maps read every live row, not only the ones a source identity is
  // stored on: a link may name a hand-entered row, which has none.
  const byIdentity = new Map(
    existing
      .filter((row) => row.sourceIdentity !== null)
      .map((row) => [row.sourceIdentity as string, row]),
  );
  const byRowId = new Map(existing.map((row) => [row.id, row]));

  const merged = new Map<string, MergedStanding>();
  for (const source of collected) {
    for (const standing of source.standings) {
      const rowId =
        linkedRows.get(`${standing.provider}:${standing.identity}`) ??
        byIdentity.get(standing.identity)?.id;
      const liveRow = rowId === undefined ? null : (byRowId.get(rowId) ?? null);
      const key = rowId === undefined ? `s:${standing.identity}` : `p:${rowId}`;
      const held = merged.get(key);
      merged.set(key, {
        // A linked standing takes the live row's own identity: the key a later
        // promote resolves it by.
        standing:
          held === undefined
            ? { ...standing, identity: liveRow?.sourceIdentity ?? standing.identity }
            : foldStanding(held.standing, standing),
        existing: liveRow,
      });
    }
  }
  return merged;
}

/**
 * Matches existing rows by stored source identity and updates them; new
 * standings insert. Nothing is deleted, since that would drop an attached deck's permalink.
 */
export async function promoteStandings(
  repos: Repos,
  metaEventId: string,
  live: MetaPromotedEventFacts,
  sources: readonly MetaEventSourceRow[],
  collected: readonly SourceFacts[],
  result: MetaPromoteResult,
  cardIndex: CardNameIndex,
): Promise<void> {
  const existing = await repos.meta.rawStandingsForEvent(metaEventId);
  const byLegacy = new Map(
    existing
      .filter((row) => row.sourceIdentity === null)
      .map((row) => [legacyIdentityOf(row.uvsgamesPlayerId, row.playerName), row]),
  );
  const links = await repos.metaPlayerLinks.forEvent(metaEventId);
  const merged = foldStandings(collected, existing, links);
  if (merged.size === 0) {
    return;
  }

  const standings = [...merged.values()];
  const providers = new Set(standings.map((entry) => entry.standing.provider));
  const deckLines = await loadDeckLines(repos, sources, providers);
  // A row the source keys by user id stores no name of its own, so the deck's
  // default name has to reach for the same display name the read surfaces join.
  const displayNames = await repos.uvsgamesEvents.playerDisplayNames(
    standings.flatMap((entry) =>
      entry.standing.uvsgamesPlayerId === null ? [] : [entry.standing.uvsgamesPlayerId],
    ),
  );
  const deckStates = await repos.meta.deckStatesForEvent(metaEventId);
  const unresolved = new Set<string>();
  const mergedLines = new Set<string>();
  const updates: MetaEventPlayerUpdate[] = [];
  const deckWrites: { playerId: string; deck: MetaArchivedDeckInput }[] = [];

  for (const { standing, existing: resolved } of standings) {
    const legendCardId =
      standing.legendName === null ? null : resolveCardIdByName(cardIndex, standing.legendName);
    if (standing.legendName !== null && legendCardId === null) {
      unresolved.add(standing.legendName);
    }

    // A legacy row can be claimed by one standing per pass; two providers sharing
    // a legacy identity must not both stamp it, or the loser duplicates next promote.
    let existingRow = resolved;
    if (existingRow === null) {
      existingRow = byLegacy.get(standing.legacyIdentity) ?? null;
      if (existingRow !== null) {
        byLegacy.delete(standing.legacyIdentity);
      }
    }
    const deck = buildDeck(
      standing,
      resolvedStandingName(standing, displayNames),
      legendCardId,
      live.format,
      live.name,
      deckLines,
      cardIndex,
      unresolved,
      mergedLines,
    );

    if (existingRow === null) {
      const created = await createMetaEventPlayer(repos.meta, {
        eventId: metaEventId,
        rank: standing.rank,
        rankIsTier: standing.rankIsTier,
        playerName: standing.playerName,
        uvsgamesPlayerId: standing.uvsgamesPlayerId,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        matchPoints: standing.matchPoints,
        opponentMatchWinPct: standing.opponentMatchWinPct,
        gameWinPct: standing.gameWinPct,
        opponentGameWinPct: standing.opponentGameWinPct,
        entryStatus: standing.entryStatus,
        legendCardId,
        championCardId: null,
        sourceIdentity: standing.identity,
        deck,
      });
      if (created !== undefined) {
        result.players++;
        if (created.deckId !== null) {
          result.decks++;
        }
      }
      continue;
    }

    const patch = {
      rank: standing.rank,
      rankIsTier: standing.rankIsTier,
      playerName: standing.playerName,
      uvsgamesPlayerId: standing.uvsgamesPlayerId,
      wins: standing.wins,
      losses: standing.losses,
      draws: standing.draws,
      matchPoints: standing.matchPoints,
      opponentMatchWinPct: standing.opponentMatchWinPct,
      gameWinPct: standing.gameWinPct,
      opponentGameWinPct: standing.opponentGameWinPct,
      entryStatus: standing.entryStatus,
      legendCardId,
      sourceIdentity: standing.identity,
    } satisfies MetaEventPlayerPatch;
    if (!samePlayerColumns(existingRow, patch)) {
      updates.push({ id: existingRow.id, ...patch });
    }
    result.players++;
    if (deck !== null) {
      // The maintainer may have renamed the archived deck; a re-promote of the
      // same list must not take that back.
      if (!sameStoredDeck(deckStates.get(existingRow.id), deck)) {
        deckWrites.push({ playerId: existingRow.id, deck });
      }
      result.decks++;
    }
  }

  await repos.meta.updatePlayers(updates);
  for (const write of deckWrites) {
    await setMetaPlayerList(repos.meta, write.playerId, write.deck, { preserveName: true });
  }

  result.unresolvedNames = [...unresolved];
  result.mergedLines = [...mergedLines];
}

function samePlayerColumns(row: MetaEventPlayerPatch, patch: MetaEventPlayerPatch): boolean {
  for (const key of Object.keys(patch) as (keyof MetaEventPlayerPatch)[]) {
    if (row[key] !== patch[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Whether `setPlayerDeck` would write nothing for this list. Mirrors that
 * method's own comparison under `preserveName`, and has to keep mirroring it.
 */
function sameStoredDeck(
  stored: MetaStoredPlayerDeck | undefined,
  deck: MetaArchivedDeckInput,
): boolean {
  return (
    stored !== undefined &&
    stored.format === deck.format &&
    stored.listStatus === deck.listStatus &&
    sameDeckCards(stored.cards, mergeDeckCards(deck.cards))
  );
}
