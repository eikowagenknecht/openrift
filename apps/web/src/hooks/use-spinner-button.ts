import { useState } from "react";

// Keeps the spinner spinning until the async action completes AND the current
// CSS animation cycle finishes, avoiding abrupt mid-spin stops.
export function useSpinnerButton(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const trigger = async () => {
    setBusy(true);
    setSpinning(true);
    await action();
    setBusy(false);
  };

  const onAnimationIteration = () => {
    if (!busy) {
      setSpinning(false);
    }
  };

  return { spinning, trigger, onAnimationIteration };
}
