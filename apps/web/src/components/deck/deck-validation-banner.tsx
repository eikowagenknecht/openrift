import { CheckIcon, CircleAlertIcon } from "lucide-react";

import { useDeckBuilderStore } from "@/stores/deck-builder-store";

export function DeckValidationBanner() {
  const violations = useDeckBuilderStore((state) => state.violations);
  const format = useDeckBuilderStore((state) => state.format);

  if (format === "freeform") {
    return (
      <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
        <CheckIcon className="size-4 shrink-0" />
        <p className="font-medium">Freeform — no restrictions</p>
      </div>
    );
  }

  if (violations.length === 0) {
    return (
      <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
        <CheckIcon className="size-4 shrink-0" />
        <p className="font-medium">Valid Standard deck</p>
      </div>
    );
  }

  // Show the most actionable issue
  const firstViolation = violations[0];

  return (
    <div className="bg-muted/50 mx-3 mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
      <CircleAlertIcon className="text-muted-foreground size-4 shrink-0" />
      <p className="flex-1">{firstViolation.message}</p>
      {violations.length > 1 && (
        <span className="text-muted-foreground text-xs">+{violations.length - 1} more</span>
      )}
    </div>
  );
}
