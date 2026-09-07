import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { buildSpotlightSequence, chooseRandomId, spotlightStepDelay } from "@/lib/match-helpers";
import { useMatchTrackerStore } from "@/stores/match-tracker-store";

export function useFirstPlayerSpotlight() {
  const playerIds = useMatchTrackerStore(useShallow((state) => state.players.map((p) => p.id)));
  const setFirstPlayer = useMatchTrackerStore((state) => state.setFirstPlayer);
  const setSpotlightPlayer = useMatchTrackerStore((state) => state.setSpotlightPlayer);
  const [isRolling, setIsRolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      setSpotlightPlayer(null);
    },
    [setSpotlightPlayer],
  );

  function roll() {
    if (isRolling || playerIds.length === 0) {
      return;
    }
    const winnerId = chooseRandomId(playerIds);
    if (winnerId === null) {
      return;
    }
    const sequence = buildSpotlightSequence(playerIds, winnerId);
    setIsRolling(true);
    setFirstPlayer(null);

    let step = 0;
    const advance = () => {
      setSpotlightPlayer(sequence[step] ?? null);
      const delay = spotlightStepDelay(step, sequence.length);
      step += 1;
      timerRef.current =
        step < sequence.length
          ? setTimeout(advance, delay)
          : setTimeout(() => {
              setSpotlightPlayer(null);
              setFirstPlayer(winnerId);
              setIsRolling(false);
              timerRef.current = null;
            }, delay);
    };
    advance();
  }

  return { isRolling, roll };
}
