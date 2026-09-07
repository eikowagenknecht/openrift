import type { DeckZone, MetaListStatus } from "@openrift/shared/types/enums";

import type { Repos } from "../../../deps.js";
import type { CardNameIndex } from "../../candidates/services/candidate-links.js";
import { resolveCardIdByName } from "../../candidates/services/candidate-links.js";
import { defaultMetaDeckName } from "../lib/meta-event-naming.js";
import type { MetaPlayerOverlayPatch } from "../lib/meta-overlay-apply.js";
import { applyOverlays } from "../lib/meta-overlay-apply.js";
import type { MetaDeckCardInput } from "../repositories/meta-decks.js";
import type { MetaPlayerOverlayRow } from "../repositories/meta-overlays.js";
import { createMetaEventPlayer, setMetaPlayerList } from "./meta-event-players.js";
import type { MetaPromoteResult } from "./meta-promote-shared.js";
import { normalizedName } from "./meta-promote-shared.js";

/**
 * Overlays apply after sources so a correction survives a re-fetch; one
 * anchored to the event resolves onto a matched row (or mints one) and self-records that resolution.
 */
export async function applyPlayerOverlays(
  repos: Repos,
  metaEventId: string,
  format: string,
  result: MetaPromoteResult,
  cardIndex: CardNameIndex,
): Promise<void> {
  const overlays = await repos.metaOverlays.acceptedPlayerOverlays(metaEventId);
  if (overlays.length === 0) {
    return;
  }

  const hasLooseOverlays = overlays.some((overlay) => overlay.metaEventPlayerId === null);
  const names = hasLooseOverlays ? await repos.meta.standingsNamesForEvent(metaEventId) : [];

  const byPlayer = new Map<string, MetaPlayerOverlayRow[]>();
  for (const overlay of overlays) {
    const playerId =
      overlay.metaEventPlayerId ??
      (await resolveOverlayTarget(repos, metaEventId, overlay, names, result));
    if (playerId === null) {
      continue;
    }
    const bucket = byPlayer.get(playerId);
    if (bucket === undefined) {
      byPlayer.set(playerId, [overlay]);
    } else {
      bucket.push(overlay);
    }
  }

  const players = await repos.meta.rawStandingsForEvent(metaEventId);
  for (const player of players) {
    const patches = byPlayer.get(player.id);
    if (patches === undefined || patches.length === 0) {
      continue;
    }
    const base = {
      playerName: player.playerName,
      rank: player.rank,
      rankIsTier: player.rankIsTier,
      wins: player.wins,
      losses: player.losses,
      draws: player.draws,
      matchPoints: player.matchPoints,
      opponentMatchWinPct: player.opponentMatchWinPct,
      gameWinPct: player.gameWinPct,
      opponentGameWinPct: player.opponentGameWinPct,
      entryStatus: player.entryStatus,
      legendCardId: player.legendCardId,
      championCardId: player.championCardId,
    } satisfies Record<string, unknown>;

    const applied = applyOverlays(
      base,
      patches.map((overlay): MetaPlayerOverlayPatch<Partial<typeof base>> => ({
        claimedFields: overlay.claimedFields,
        values: {
          // A name-keyed row must keep a name, so a claimed-empty name falls
          // through to the base; rank and its flag are NOT NULL and do the same.
          playerName:
            player.uvsgamesPlayerId === null
              ? (overlay.playerName ?? undefined)
              : overlay.playerName,
          rank: overlay.rank ?? undefined,
          rankIsTier: overlay.rankIsTier ?? undefined,
          wins: overlay.wins,
          losses: overlay.losses,
          draws: overlay.draws,
          matchPoints: overlay.matchPoints,
          opponentMatchWinPct: overlay.opponentMatchWinPct,
          gameWinPct: overlay.gameWinPct,
          opponentGameWinPct: overlay.opponentGameWinPct,
          entryStatus: overlay.entryStatus,
          legendCardId: overlay.legendCardId,
          championCardId: overlay.championCardId,
        } as Partial<typeof base>,
      })),
    );
    await repos.meta.updatePlayer(player.id, applied);

    const withList = patches.filter((overlay) => overlay.claimedFields.includes("cards"));
    const latest = withList.at(-1);
    if (latest !== undefined) {
      await applyOverlayList(repos, player.id, latest.id, format, cardIndex);
    }
  }
}

/**
 * Matches an event-anchored overlay onto the row whose rendered name it names
 * (rank breaks a tie), or mints a new row; an unplaceable overlay is reported, not silently dropped.
 */
async function resolveOverlayTarget(
  repos: Repos,
  metaEventId: string,
  overlay: MetaPlayerOverlayRow,
  names: { id: string; name: string; rank: number }[],
  result: MetaPromoteResult,
): Promise<string | null> {
  const overlayName = normalizedName(overlay.playerName);
  if (overlayName !== "") {
    const named = names.filter((row) => normalizedName(row.name) === overlayName);
    const matched =
      named.length === 1
        ? named[0]
        : named.find((row) => overlay.rank !== null && row.rank === overlay.rank);
    if (matched !== undefined) {
      await repos.metaOverlays.linkPlayerOverlay(overlay.id, matched.id);
      return matched.id;
    }
  }

  if (overlay.playerName === null || overlay.rank === null) {
    result.errors.push(
      `An accepted standings overlay could not be placed: it names ${
        overlay.playerName ?? "no player"
      } and matches no row. Link it to an entry from the review queue.`,
    );
    return null;
  }

  const created = await createMetaEventPlayer(repos.meta, {
    eventId: metaEventId,
    rank: overlay.rank,
    rankIsTier: overlay.rankIsTier ?? false,
    playerName: overlay.playerName,
    wins: overlay.wins,
    losses: overlay.losses,
    draws: overlay.draws,
    entryStatus: overlay.entryStatus,
    legendCardId: overlay.legendCardId,
    championCardId: overlay.championCardId,
    mintedByOverlayId: overlay.id,
    deck: null,
  });
  if (created === undefined) {
    return null;
  }
  await repos.metaOverlays.linkPlayerOverlay(overlay.id, created.metaEventPlayerId);
  names.push({ id: created.metaEventPlayerId, name: overlay.playerName, rank: overlay.rank });
  result.players++;
  return created.metaEventPlayerId;
}

/** Deletes only rows carrying `mintedByOverlayId`; hand-entered and source-backed rows never qualify. */
export async function dropOrphanMintedPlayers(
  repos: Repos,
  metaEventId: string,
  result: MetaPromoteResult,
): Promise<void> {
  const orphans = await repos.meta.orphanMintedPlayerIds(metaEventId);
  for (const playerId of orphans) {
    await repos.metaOverlays.unanchorPlayerOverlays(playerId, metaEventId);
    await repos.meta.deletePlayer(playerId);
    result.removedPlayers++;
  }
}

/**
 * A submitted list becomes the live deck only once every line resolves; a
 * `cards` claim with no lines detaches the deck instead, since it claims there is none.
 */
async function applyOverlayList(
  repos: Repos,
  metaEventPlayerId: string,
  overlayId: string,
  format: string,
  cardIndex: CardNameIndex,
): Promise<void> {
  const overlay = await repos.metaOverlays.playerOverlayById(overlayId);
  if (overlay === undefined) {
    return;
  }
  if (overlay.cards.length === 0) {
    await repos.meta.clearPlayerDeck(metaEventPlayerId);
    return;
  }
  const cards: MetaDeckCardInput[] = [];
  for (const line of overlay.cards) {
    const cardId = line.cardId ?? resolveCardIdByName(cardIndex, line.cardName);
    if (cardId === null) {
      return;
    }
    cards.push({
      cardId,
      zone: line.zone as DeckZone,
      quantity: line.quantity,
      preferredPrintingId: line.preferredPrintingId,
    });
  }
  const player = await repos.meta.playerById(metaEventPlayerId);
  if (player === undefined) {
    return;
  }
  await setMetaPlayerList(repos.meta, metaEventPlayerId, {
    name: player.deckName ?? defaultMetaDeckName(player.legendName, player.playerName, ""),
    format,
    formatConfig: null,
    cards,
    listStatus: (overlay.listStatus ?? "full") as Exclude<MetaListStatus, "none">,
  });
}
