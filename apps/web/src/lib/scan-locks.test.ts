import type { ArtTrack } from "@openrift/shared/scan/accept";
import { describe, expect, it } from "vitest";

import type { LockedCard } from "./scan-locks";
import { LOCK_HISTORY_LIMIT, appendLock, lockFromTrack, resolvePrintingIn } from "./scan-locks";

function track(overrides: Partial<ArtTrack> = {}): ArtTrack {
  return {
    artKey: "art-a",
    key: "OGN-001-en",
    label: "Lux",
    firstSeen: 0,
    sightings: 3,
    runLength: 3,
    runWeight: 3,
    lockedThisRun: true,
    lastFrame: 8,
    lockedAt: 4.5,
    framesToLock: 3,
    firstFrame: 4,
    printingResolved: true,
    runStartFrame: 4,
    runStartSeconds: 2,
    maxRunLength: 3,
    ...overrides,
  };
}

function lock(overrides: Partial<LockedCard> = {}): LockedCard {
  return {
    key: "OGN-001-en",
    artKey: "art-a",
    label: "Lux",
    resolved: false,
    at: 0,
    lockSeconds: 1,
    framesToLock: 3,
    inliers: 40,
    ...overrides,
  };
}

describe("lockFromTrack", () => {
  it("times a live lock from the run it belongs to", () => {
    const built = lockFromTrack({ track: track(), tapped: false, totalMs: 90, inliers: 40, at: 7 });
    expect(built.lockSeconds).toBe(2.5);
    expect(built.framesToLock).toBe(3);
  });

  it("carries the track's identity and the frame's inliers", () => {
    const built = lockFromTrack({ track: track(), tapped: false, totalMs: 90, inliers: 40, at: 7 });
    expect(built).toMatchObject({
      key: "OGN-001-en",
      artKey: "art-a",
      label: "Lux",
      resolved: true,
      at: 7,
      inliers: 40,
    });
  });

  it("times a tapped lock by how long the tap took to process", () => {
    const built = lockFromTrack({ track: track(), tapped: true, totalMs: 250, inliers: 12, at: 7 });
    expect(built.lockSeconds).toBe(0.25);
    expect(built.framesToLock).toBe(1);
  });

  it("reads no run time from a track that never recorded a lock instant", () => {
    const built = lockFromTrack({
      track: track({ lockedAt: null }),
      tapped: false,
      totalMs: 90,
      inliers: 40,
      at: 7,
    });
    expect(built.lockSeconds).toBe(0);
  });

  it("counts no frames when the track never recorded them", () => {
    const built = lockFromTrack({
      track: track({ framesToLock: null }),
      tapped: false,
      totalMs: 90,
      inliers: 40,
      at: 7,
    });
    expect(built.framesToLock).toBe(0);
  });
});

describe("appendLock", () => {
  it("puts the newest lock first", () => {
    const locks = appendLock([lock({ key: "old" })], lock({ key: "new" }));
    expect(locks.map((entry) => entry.key)).toEqual(["new", "old"]);
  });

  it("keeps the history bounded", () => {
    let locks: LockedCard[] = [];
    for (let index = 0; index < LOCK_HISTORY_LIMIT + 5; index++) {
      locks = appendLock(locks, lock({ key: `k-${index}` }));
    }
    expect(locks).toHaveLength(LOCK_HISTORY_LIMIT);
    expect(locks[0]?.key).toBe(`k-${LOCK_HISTORY_LIMIT + 4}`);
  });

  it("leaves the list it was given alone", () => {
    const before = [lock({ key: "old" })];
    appendLock(before, lock({ key: "new" }));
    expect(before).toHaveLength(1);
  });
});

describe("resolvePrintingIn", () => {
  const update = { artKey: "art-a", key: "OGN-001-en-foil", label: "Lux (Foil)", resolved: true };

  it("refreshes the newest entry for that artwork", () => {
    const locks = [lock({ key: "OGN-001-en" }), lock({ key: "OGN-001-en", at: 1 })];
    const refreshed = resolvePrintingIn(locks, update);
    expect(refreshed?.[0]).toMatchObject({
      key: "OGN-001-en-foil",
      label: "Lux (Foil)",
      resolved: true,
    });
    expect(refreshed?.[1]?.key).toBe("OGN-001-en");
  });

  it("has nothing to do when the artwork is not listed", () => {
    expect(resolvePrintingIn([lock({ artKey: "art-b" })], update)).toBeNull();
  });

  it("has nothing to do when the listed printing already matches", () => {
    expect(resolvePrintingIn([lock({ key: "OGN-001-en-foil" })], update)).toBeNull();
  });

  it("leaves the list it was given alone", () => {
    const before = [lock()];
    resolvePrintingIn(before, update);
    expect(before[0]?.key).toBe("OGN-001-en");
  });
});
