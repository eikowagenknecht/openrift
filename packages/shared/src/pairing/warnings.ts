import type { PairingPlayer, Pod } from "./types.js";

/**
 * One fairness concern the organizer should see on a proposed pairing. Warnings
 * are advisory: they never block a pairing, they only surface a problem the
 * penalty function already accounts for so a human can decide whether to live
 * with it (e.g. an unavoidable rematch in a tight field).
 */
export type PairingWarning =
  | {
      kind: "rematch";
      /** Index into the round's pods array. */
      podIndex: number;
      playerIds: [string, string];
      /** How many times this pair has met before (>= 1). */
      meetings: number;
    }
  | {
      kind: "largeSpread";
      podIndex: number;
      /** Highest-minus-lowest score in the pod. */
      spread: number;
    }
  | {
      kind: "repeatedThreePod";
      podIndex: number;
      playerId: string;
      /** How many 3-player pods this player has already been in (>= 1). */
      priorThreePods: number;
    }
  | {
      kind: "repeatBye";
      playerId: string;
      /** How many byes this player has already taken (>= 1). */
      priorByes: number;
    }
  | {
      kind: "sameRegion";
      podIndex: number;
      playerIds: [string, string];
      /** The region tag slug both players share. */
      region: string;
    }
  | {
      kind: "fixedSeatDisplaced";
      podIndex: number;
      playerId: string;
      /** The table the player is normally seated at. */
      fixedTable: number;
      /** The table their pod actually plays at this round. */
      assignedTable: number;
    };

/**
 * The pod score spread (max - min) at which a `largeSpread` warning fires. Kept
 * in step with the penalty function's first imbalance surcharge tier in
 * `evaluate.ts` (`spread >= 6`).
 */
export const SPREAD_WARNING_THRESHOLD = 6;

/**
 * Derive the advisory warnings for a whole-round pairing. Pure; reads only the
 * snapshot, so the same helper runs server-side and live in the manual editor.
 *
 * - `rematch`: each in-pod pair that has met before, with the meeting count.
 * - `largeSpread`: a pod whose score spread reaches {@link SPREAD_WARNING_THRESHOLD}.
 * - `repeatedThreePod`: each player seated in a 3-pod who has already been in one.
 * - `repeatBye`: each byed player who has already taken a bye.
 * - `sameRegion`: each in-pod pair sharing a region (region-aware events only).
 * - `fixedSeatDisplaced`: each fixed-seat player whose pod plays at a different
 *   table this round (only when `tableNumbers` is provided), so the organizer
 *   can announce the move.
 *
 * @param pods The pods making up the round.
 * @param players The player snapshots referenced by the pods and byes.
 * @param byePlayerIds Players sitting this round out (taking a bye).
 * @param tableNumbers Table number per pod, parallel to `pods` (from
 *   `assignTableNumbers` or the stored pod numbers). Omit to skip seat checks.
 * @returns The flat list of warnings, empty when the pairing is clean.
 */
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

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const meetings = members[i].opponents.get(members[j].id) ?? 0;
        if (meetings > 0) {
          warnings.push({
            kind: "rematch",
            podIndex,
            playerIds: [members[i].id, members[j].id],
            meetings,
          });
        }
        const region = members[i].region ?? null;
        if (region !== null && region === members[j].region) {
          warnings.push({
            kind: "sameRegion",
            podIndex,
            playerIds: [members[i].id, members[j].id],
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
