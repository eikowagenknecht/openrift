import { SearchXIcon, WifiOffIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/** Shows a connectivity error when nothing loaded, or a no-results hint when filters excluded everything. */
export function CardViewerEmptyState({
  totalItems,
  noResultsDescription,
}: {
  totalItems: number;
  noResultsDescription?: ReactNode;
}) {
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
      description={noResultsDescription ?? "Try adjusting your filters."}
    />
  );
}
