import type { PodRoundResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  movePlayer,
  participantIds,
  seedFromRound,
  toPayload,
  validatePartition,
} from "./pod-pairing-editor";
import type { EditorState } from "./pod-pairing-editor";

function round(): PodRoundResponse {
  const member = (playerId: string) => ({
    playerId,
    displayName: playerId,
    gamePoints: null,
    placement: null,
    points: null,
  });
  return {
    id: "r1",
    roundNumber: 1,
    status: "reporting",
    pairingStrategy: "local-search",
    penaltyTotal: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    finalizedAt: null,
    pods: [
      {
        id: "p1",
        podNumber: 1,
        size: 4,
        resultStatus: "pending",
        penalty: null,
        members: ["a", "b", "c", "d"].map((id) => member(id)),
      },
      {
        id: "p2",
        podNumber: 2,
        size: 3,
        resultStatus: "pending",
        penalty: null,
        members: ["e", "f", "g"].map((id) => member(id)),
      },
    ],
    byes: [{ playerId: "h", displayName: "h" }],
  };
}

describe("seedFromRound", () => {
  it("reads pods and byes from a round", () => {
    const state = seedFromRound(round());
    expect(state.pods).toEqual([
      { playerIds: ["a", "b", "c", "d"] },
      { playerIds: ["e", "f", "g"] },
    ]);
    expect(state.byes).toEqual(["h"]);
  });
});

describe("participantIds", () => {
  it("lists everyone across pods and byes", () => {
    expect(participantIds(seedFromRound(round())).toSorted()).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
    ]);
  });
});

describe("movePlayer", () => {
  it("moves a player between pods, removing them from the source", () => {
    const next = movePlayer(seedFromRound(round()), "a", { kind: "pod", index: 1 });
    expect(next.pods[0].playerIds).toEqual(["b", "c", "d"]);
    expect(next.pods[1].playerIds).toEqual(["e", "f", "g", "a"]);
  });

  it("moves a player into the bye zone", () => {
    const next = movePlayer(seedFromRound(round()), "e", { kind: "bye" });
    expect(next.pods[1].playerIds).toEqual(["f", "g"]);
    expect(next.byes).toEqual(["h", "e"]);
  });

  it("moves a byed player back into a pod", () => {
    const next = movePlayer(seedFromRound(round()), "h", { kind: "pod", index: 1 });
    expect(next.byes).toEqual([]);
    expect(next.pods[1].playerIds).toEqual(["e", "f", "g", "h"]);
  });

  it("moves a player into a brand-new pod", () => {
    const next = movePlayer(seedFromRound(round()), "a", { kind: "newPod" });
    expect(next.pods[0].playerIds).toEqual(["b", "c", "d"]);
    expect(next.pods[2].playerIds).toEqual(["a"]);
  });

  it("pairs two byed players into a new pod neither existing pod could take", () => {
    // The bug scenario: every existing table is full, two players sit in Byes.
    let state = movePlayer(seedFromRound(round()), "h", { kind: "newPod" });
    state = movePlayer(state, "e", { kind: "pod", index: 2 });
    expect(state.pods[2].playerIds).toEqual(["h", "e"]);
    expect(state.byes).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const state = seedFromRound(round());
    movePlayer(state, "a", { kind: "bye" });
    expect(state.pods[0].playerIds).toEqual(["a", "b", "c", "d"]);
    expect(state.byes).toEqual(["h"]);
  });
});

describe("validatePartition", () => {
  const expected = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("accepts a 4+3 split with one bye", () => {
    const result = validatePartition(seedFromRound(round()), expected);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a pod of an invalid size", () => {
    // Move e into pod 0 -> pod0 has 5, pod1 has 2.
    const state = movePlayer(seedFromRound(round()), "e", { kind: "pod", index: 0 });
    const result = validatePartition(state, expected);
    expect(result.ok).toBe(false);
    expect(result.podValid).toEqual([false, false]);
    expect(result.errors.some((message) => message.includes("3 or 4"))).toBe(true);
  });

  it("accepts an emptied pod (it is dropped on save)", () => {
    // Bye all of pod 1 -> pod1 empty, pod0 stays 4, four byes.
    let state: EditorState = seedFromRound(round());
    for (const id of ["e", "f", "g"]) {
      state = movePlayer(state, id, { kind: "bye" });
    }
    const result = validatePartition(state, expected);
    expect(result.ok).toBe(true);
  });

  it("rejects when a player went missing", () => {
    const state: EditorState = { pods: [{ playerIds: ["a", "b", "c"] }], byes: [] };
    const result = validatePartition(state, expected);
    expect(result.ok).toBe(false);
  });
});

describe("validatePartition (swiss)", () => {
  const expected = ["a", "b", "c", "d"];

  it("accepts an all-matches split", () => {
    const state: EditorState = {
      pods: [{ playerIds: ["a", "b"] }, { playerIds: ["c", "d"] }],
      byes: [],
    };
    const result = validatePartition(state, expected, "swiss");
    expect(result.ok).toBe(true);
    expect(result.podValid).toEqual([true, true]);
  });

  it("rejects a 3-player match with swiss copy", () => {
    const state: EditorState = {
      pods: [{ playerIds: ["a", "b", "c"] }, { playerIds: ["d"] }],
      byes: [],
    };
    const result = validatePartition(state, expected, "swiss");
    expect(result.ok).toBe(false);
    expect(result.podValid).toEqual([false, false]);
    expect(result.errors.some((message) => message.includes("exactly 2"))).toBe(true);
  });

  it("accepts a match plus byes and an emptied match", () => {
    const state: EditorState = {
      pods: [{ playerIds: ["a", "b"] }, { playerIds: [] }],
      byes: ["c", "d"],
    };
    const result = validatePartition(state, expected, "swiss");
    expect(result.ok).toBe(true);
  });

  it("accepts and saves a new match formed from two byed players", () => {
    // Regression: after a mid-round drop removed a table, its survivor and the
    // round's original bye were stuck in Byes with no table to join.
    let state: EditorState = {
      pods: [{ playerIds: ["a", "b"] }],
      byes: ["c", "d"],
    };
    state = movePlayer(state, "c", { kind: "newPod" });
    state = movePlayer(state, "d", { kind: "pod", index: 1 });
    const result = validatePartition(state, expected, "swiss");
    expect(result.ok).toBe(true);
    expect(toPayload(state).pods).toEqual([
      { size: 2, playerIds: ["a", "b"] },
      { size: 2, playerIds: ["c", "d"] },
    ]);
  });

  it("still rejects a 2-pod in the default pod mode", () => {
    const state: EditorState = {
      pods: [{ playerIds: ["a", "b"] }],
      byes: ["c", "d"],
    };
    const result = validatePartition(state, expected);
    expect(result.ok).toBe(false);
  });
});

describe("toPayload", () => {
  it("drops empty pods and derives sizes", () => {
    let state: EditorState = seedFromRound(round());
    for (const id of ["e", "f", "g"]) {
      state = movePlayer(state, id, { kind: "bye" });
    }
    const payload = toPayload(state);
    expect(payload.pods).toEqual([{ size: 4, playerIds: ["a", "b", "c", "d"] }]);
    expect(payload.byes.toSorted()).toEqual(["e", "f", "g", "h"]);
  });
});
