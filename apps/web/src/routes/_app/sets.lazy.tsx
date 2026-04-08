import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { LayersIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/sets")({
  component: SetsPage,
  pendingComponent: SetsPending,
});

function SetsPage() {
  const { data } = useSuspenseQuery(publicSetListQueryOptions);

  return (
    <div className={PAGE_PADDING}>
      <h1 className="mb-4 text-2xl font-bold">Card Sets</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.sets.map((set) => (
          <Link
            key={set.id}
            to="/sets/$setSlug"
            params={{ setSlug: set.slug }}
            className="border-border bg-card hover:bg-accent flex items-center gap-3 rounded-lg border p-4 transition-colors"
          >
            <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
              <LayersIcon className="text-muted-foreground size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{set.name}</h2>
              <p className="text-muted-foreground text-sm">
                {set.cardCount} {set.cardCount === 1 ? "card" : "cards"}, {set.printingCount}{" "}
                {set.printingCount === 1 ? "printing" : "printings"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SetsPending() {
  return (
    <div className={PAGE_PADDING}>
      <Skeleton className="mb-4 h-8 w-32" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
