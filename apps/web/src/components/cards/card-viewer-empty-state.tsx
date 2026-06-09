import { SearchXIcon, WifiOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Shared empty/error state for the card viewers (grid and table). Shows a
 * connectivity error with a retry when nothing could be loaded
 * (`totalItems === 0`), or a no-results hint when the active filters excluded
 * every card. The caller provides the outer container.
 * @returns The centered empty-state content.
 */
export function CardViewerEmptyState({ totalItems }: { totalItems: number }) {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 text-center">
      {totalItems === 0 ? (
        <>
          <WifiOffIcon className="size-10 opacity-50" />
          <p>Couldn&apos;t load cards</p>
          <p className="text-xs">The server may be unreachable.</p>
          <Button
            type="button"
            variant="link-muted"
            className="mt-1 h-auto px-0 text-sm"
            onClick={() => globalThis.location.reload()}
          >
            Retry
          </Button>
        </>
      ) : (
        <>
          <SearchXIcon className="size-10 opacity-50" />
          <p>No cards found</p>
          <p className="text-xs">Try adjusting your filters.</p>
        </>
      )}
    </div>
  );
}
