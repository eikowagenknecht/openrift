import { SearchXIcon, WifiOffIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Shared empty/error state for the card viewers (grid and table). Shows a
 * connectivity error with a retry when nothing could be loaded
 * (`totalItems === 0`), or a no-results hint when the active filters excluded
 * every card. The caller provides the outer container.
 * @returns The centered empty-state content.
 */
export function CardViewerEmptyState({ totalItems }: { totalItems: number }) {
  if (totalItems === 0) {
    return (
      <EmptyState
        className="flex-1"
        icon={WifiOffIcon}
        title="Couldn't load cards"
        description="The server may be unreachable."
      >
        <Button type="button" variant="ghost" onClick={() => globalThis.location.reload()}>
          Retry
        </Button>
      </EmptyState>
    );
  }
  return (
    <EmptyState
      className="flex-1"
      icon={SearchXIcon}
      title="No cards found"
      description="Try adjusting your filters."
    />
  );
}
