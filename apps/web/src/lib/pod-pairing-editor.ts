import type { PodRoundResponse } from "@openrift/shared";

/** A pod in the manual editor: just the seated player ids (size is derived from length). */
interface EditorPod {
  playerIds: string[];
}

/** The editable partition: the round's pods plus the players sitting out (byes). */
export interface EditorState {
  pods: EditorPod[];
  byes: string[];
}

/** Where a dragged player is being dropped: into a specific pod, a brand-new pod, or the bye zone. */
export type MoveTarget = { kind: "pod"; index: number } | { kind: "newPod" } | { kind: "bye" };

/** The payload sent to the replace-pairing endpoint, with empty pods dropped. */
export interface PairingPayload {
  pods: { size: 2 | 3 | 4; playerIds: string[] }[];
  byes: string[];
}

/**
 * Which sizes a pod may have in the editor: FFA pods (3/4), Swiss matches (2
 * players), or 2v2 team matches (2 units, where each dragged chip is a whole
 * team and the ids in the state are team ids).
 */
export type EditorMode = "pod" | "swiss" | "team";

export interface PartitionValidation {
  /** True when the partition can be saved. */
  ok: boolean;
  /** Per-pod validity (false = wrong size), aligned with `state.pods`. */
  podValid: boolean[];
  /** Human-readable reasons the partition cannot be saved (empty when ok). */
  errors: string[];
}

/**
 * Seed the editor from the open round's current pods and byes.
 * @returns The initial editable partition.
 */
export function seedFromRound(round: PodRoundResponse): EditorState {
  return {
    pods: round.pods.map((pod) => ({ playerIds: pod.members.map((member) => member.playerId) })),
    byes: round.byes.map((bye) => bye.playerId),
  };
}

/**
 * Every player currently in the round (across pods and byes) — what a valid edit must cover.
 * @returns The flat list of player ids in the partition.
 */
export function participantIds(state: EditorState): string[] {
  return [...state.pods.flatMap((pod) => pod.playerIds), ...state.byes];
}

/**
 * Move a player to a pod, a brand-new pod, or the bye zone, removing them from
 * wherever they were. A `newPod` target appends a pod seated with just this
 * player (so byed players can form a table the round no longer has). A no-op
 * move (already at the target) returns an equivalent new state. Pure.
 *
 * @param state The current partition.
 * @param playerId The player being moved.
 * @param target The destination pod index, the new-pod zone, or the bye zone.
 * @returns The new partition.
 */
export function movePlayer(state: EditorState, playerId: string, target: MoveTarget): EditorState {
  const pods = state.pods.map((pod) => ({
    playerIds: pod.playerIds.filter((id) => id !== playerId),
  }));
  const byes = state.byes.filter((id) => id !== playerId);
  if (target.kind === "bye") {
    byes.push(playerId);
  } else if (target.kind === "newPod") {
    pods.push({ playerIds: [playerId] });
  } else if (pods[target.index]) {
    pods[target.index].playerIds.push(playerId);
  }
  return { pods, byes };
}

/**
 * Validate the partition for saving: every non-empty pod must have a size the
 * mode allows (3/4 for FFA pods, exactly 2 for Swiss matches), and the pods plus
 * byes must cover exactly the round's players, each once. Empty pods are ignored
 * here (they are dropped on save).
 *
 * @param state The current partition.
 * @param expectedPlayerIds The players the round must still contain.
 * @param mode The pairing style being edited; defaults to FFA pods.
 * @returns The validation result with per-pod validity and human-readable errors.
 */
export function validatePartition(
  state: EditorState,
  expectedPlayerIds: readonly string[],
  mode: EditorMode = "pod",
): PartitionValidation {
  const errors: string[] = [];
  const sizeOk = (size: number): boolean =>
    mode === "swiss" || mode === "team" ? size === 2 : size === 3 || size === 4;
  const podValid = state.pods.map((pod) => {
    const size = pod.playerIds.length;
    return size === 0 || sizeOk(size);
  });
  state.pods.forEach((pod, index) => {
    const size = pod.playerIds.length;
    if (size !== 0 && !sizeOk(size)) {
      errors.push(
        mode === "team"
          ? `Match ${index + 1} has ${size} team${size === 1 ? "" : "s"}. Matches must have exactly 2.`
          : mode === "swiss"
            ? `Match ${index + 1} has ${size} players. Matches must have exactly 2.`
            : `Pod ${index + 1} has ${size} players. Pods must have 3 or 4.`,
      );
    }
  });

  const seated = participantIds(state);
  const seatedSet = new Set(seated);
  const unit = mode === "team" ? "team" : "player";
  if (seatedSet.size !== seated.length) {
    errors.push(`A ${unit} appears in more than one ${mode === "pod" ? "pod" : "match"} or bye.`);
  }
  const expected = new Set(expectedPlayerIds);
  if (seatedSet.size !== expected.size || [...expected].some((id) => !seatedSet.has(id))) {
    errors.push(
      `Every ${unit} in the round must be in a ${mode === "pod" ? "pod" : "match"} or sitting out.`,
    );
  }

  return { ok: errors.length === 0, podValid, errors };
}

/**
 * Build the save payload, dropping empty pods. Assumes the state is valid (call
 * {@link validatePartition} first); an out-of-range pod is coerced by length and
 * the server re-validates anyway.
 *
 * @param state The current partition.
 * @returns The pods (empties removed) and byes for the replace-pairing call.
 */
export function toPayload(state: EditorState): PairingPayload {
  return {
    pods: state.pods
      .filter((pod) => pod.playerIds.length > 0)
      .map((pod) => ({ size: pod.playerIds.length as 2 | 3 | 4, playerIds: pod.playerIds })),
    byes: state.byes,
  };
}
