/**
 * Android can hand over a camera buffer rotated relative to the display. The
 * compensation is adopted once two consecutive verified winners agree on a
 * rotation.
 */

export const ROTATION_STREAK_TO_ADOPT = 2;

export interface RotationTracker {
  turns: () => number;
  note: (rotation: number) => number | null;
  reset: () => void;
}

export function createRotationTracker(streakToAdopt = ROTATION_STREAK_TO_ADOPT): RotationTracker {
  let turns = 0;
  let streak = { rotation: 0, count: 0 };
  // One adoption per proof: stays disarmed until an upright winner confirms
  // it, or a landscape-reference card (battlefields) would spin it forever.
  let armed = true;

  return {
    turns() {
      return turns;
    },
    note(rotation) {
      if (rotation === 0) {
        streak = { rotation: 0, count: 0 };
        // An upright winner is proof the current compensation is correct;
        // re-arm so a later card placed differently can adopt again.
        armed = true;
        return null;
      }
      streak =
        streak.rotation === rotation
          ? { rotation, count: streak.count + 1 }
          : { rotation, count: 1 };
      if (streak.count < streakToAdopt || !armed) {
        return null;
      }
      turns = (turns + rotation) % 4;
      streak = { rotation: 0, count: 0 };
      armed = false;
      return turns;
    },
    reset() {
      turns = 0;
      streak = { rotation: 0, count: 0 };
      armed = true;
    },
  };
}
