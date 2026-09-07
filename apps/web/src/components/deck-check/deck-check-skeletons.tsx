import { Skeleton } from "@/components/ui/skeleton";

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

export function DeckCheckInfoCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-4">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}
