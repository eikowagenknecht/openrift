import type { PairingPlayer, Pod } from "./types.js";

/** Warnings are advisory: they never block a pairing, only surface what the penalty function already accounts for. */
export type PairingWarning =
  | {
      kind: "rematch";
      podIndex: number;
      playerIds: [string, string];
      meetings: number;
    }
  | {
      kind: "largeSpread";
      podIndex: number;
      spread: number;
    }
  | {
      kind: "repeatedThreePod";
      podIndex: number;
      playerId: string;
      priorThreePods: number;
    }
  | {
      kind: "repeatBye";
      playerId: string;
      priorByes: number;
    }
  | {
      kind: "sameRegion";
      podIndex: number;
      playerIds: [string, string];
      region: string;
    }
  | {
      kind: "fixedSeatDisplaced";
      podIndex: number;
      playerId: string;
      fixedTable: number;
      assignedTable: number;
    };

export const SPREAD_WARNING_THRESHOLD = 6;

export function computePairingWarnings(
  pods: Pod[],
  players: PairingPlayer[],
  byePlayerIds: readonly string[] = [],
  tableNumbers?: readonly number[],
): PairingWarning[] {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const warnings: PairingWarning[] = [];

  pods.forEach((pod, podIndex) => {
    const members = pod.playerIds
      .map((id) => playersById.get(id))
      .filter((member): member is PairingPlayer => member !== undefined);

    for (const [i, memberA] of members.entries()) {
      for (const memberB of members.slice(i + 1)) {
        const meetings = memberA.opponents.get(memberB.id) ?? 0;
        if (meetings > 0) {
          warnings.push({
            kind: "rematch",
            podIndex,
            playerIds: [memberA.id, memberB.id],
            meetings,
          });
        }
        const region = memberA.region ?? null;
        if (region !== null && region === memberB.region) {
          warnings.push({
            kind: "sameRegion",
            podIndex,
            playerIds: [memberA.id, memberB.id],
            region,
          });
        }
      }
    }

    if (members.length > 0) {
      const scores = members.map((member) => member.score);
      const spread = Math.max(...scores) - Math.min(...scores);
      if (spread >= SPREAD_WARNING_THRESHOLD) {
        warnings.push({ kind: "largeSpread", podIndex, spread });
      }
    }

    const assignedTable = tableNumbers?.[podIndex];
    if (assignedTable !== undefined) {
      for (const member of members) {
        const fixedTable = member.fixedTable ?? null;
        if (fixedTable !== null && fixedTable !== assignedTable) {
          warnings.push({
            kind: "fixedSeatDisplaced",
            podIndex,
            playerId: member.id,
            fixedTable,
            assignedTable,
          });
        }
      }
    }

    if (pod.size === 3) {
      for (const member of members) {
        if (member.pods3 >= 1) {
          warnings.push({
            kind: "repeatedThreePod",
            podIndex,
            playerId: member.id,
            priorThreePods: member.pods3,
          });
        }
      }
    }
  });

  for (const playerId of byePlayerIds) {
    const player = playersById.get(playerId);
    if (player && player.byes >= 1) {
      warnings.push({ kind: "repeatBye", playerId, priorByes: player.byes });
    }
  }

  return warnings;
}
