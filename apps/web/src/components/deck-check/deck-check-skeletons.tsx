import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder rows for a deck-check list while it loads: the entrant list, the
 * player's "my tournament decks", and the group member view all share the
 * bordered `EntryRow` / `PlayerDeckRow` shape, so the skeleton mirrors it
 * instead of leaving a bare "Loading…" in the corner.
 * @returns A stack of `count` row placeholders.
 */
export function DeckCheckListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_unused, index) => (
        <div key={index} className="flex items-center gap-3 rounded-md border p-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Placeholder zone grids for a deck-check card list (the player deck page and
 * the judge checker): a zone heading over a responsive card-cell grid, sized
 * to the surface's rendered `cellWidth`.
 * @returns The zone-grid placeholders.
 */
export function DeckCheckCardZonesSkeleton({
  cellWidth = 150,
  zones = [1, 8, 4],
}: {
  cellWidth?: number;
  zones?: number[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {zones.map((cells, zoneIndex) => (
        <div key={zoneIndex} className="flex min-w-0 flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(min(${cellWidth}px, 100%), 1fr))`,
            }}
          >
            {Array.from({ length: cells }, (_unused, cellIndex) => (
              <Skeleton key={cellIndex} className="aspect-card rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The bordered event-summary card placeholder shown on the claim and submit
 * landing pages while the event facts load.
 * @returns The info-card placeholder.
 */
export function DeckCheckInfoCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-4">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}
