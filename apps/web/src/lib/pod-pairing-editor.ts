import type { PodRoundResponse } from "@openrift/shared";

/** A pod in the manual editor: just the seated player ids (size is derived from length). */
interface EditorPod {
  playerIds: string[];
}

export interface EditorState {
  pods: EditorPod[];
  byes: string[];
}

export type MoveTarget = { kind: "pod"; index: number } | { kind: "newPod" } | { kind: "bye" };

/** The payload sent to the replace-pairing endpoint, with empty pods dropped. */
export interface PairingPayload {
  pods: { size: 2 | 3 | 4; playerIds: string[] }[];
  byes: string[];
}

export type EditorMode = "pod" | "swiss" | "team";

export interface PartitionValidation {
  ok: boolean;
  podValid: boolean[];
  errors: string[];
}

export function seedFromRound(round: PodRoundResponse): EditorState {
  return {
    pods: round.pods.map((pod) => ({ playerIds: pod.members.map((member) => member.playerId) })),
    byes: round.byes.map((bye) => bye.playerId),
  };
}

export function participantIds(state: EditorState): string[] {
  return [...state.pods.flatMap((pod) => pod.playerIds), ...state.byes];
}

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

// Empty pods are ignored here; they are dropped on save in toPayload.
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

// Assumes the state is valid (call validatePartition first); an out-of-range
// pod is coerced by length and the server re-validates anyway.
export function toPayload(state: EditorState): PairingPayload {
  return {
    pods: state.pods
      .filter((pod) => pod.playerIds.length > 0)
      .map((pod) => ({ size: pod.playerIds.length as 2 | 3 | 4, playerIds: pod.playerIds })),
    byes: state.byes,
  };
}
