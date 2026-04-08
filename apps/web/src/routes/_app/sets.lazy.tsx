import type { SetListEntry } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import { getCardImageSrcSet, getCardImageUrl } from "@/lib/images";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/sets")({
  component: SetsPage,
  pendingComponent: SetsPending,
});

const CARD_BORDER_RADIUS = "5% / 3.6%";

function SetCard({ set }: { set: SetListEntry }) {
  const thumbnailUrl = set.coverImageUrl ? getCardImageUrl(set.coverImageUrl, "thumbnail") : null;
  const srcSet = set.coverImageUrl ? getCardImageSrcSet(set.coverImageUrl) : undefined;

  return (
    <Link to="/sets/$setSlug" params={{ setSlug: set.slug }} className="group relative block p-1.5">
      <div
        className="group-hover:ring-primary/60 relative overflow-hidden group-hover:ring-2 after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:border after:border-[var(--border-opaque)]"
        style={{ borderRadius: CARD_BORDER_RADIUS }}
      >
        {thumbnailUrl ? (
          <>
            <div className="aspect-card bg-muted/40" />
            <img
              src={thumbnailUrl}
              srcSet={srcSet}
              sizes="(min-width: 1920px) 12.5vw, (min-width: 1600px) 14vw, (min-width: 1280px) 16vw, (min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
              alt={set.name}
              loading="lazy"
              className="absolute inset-0 w-full object-cover"
            />
          </>
        ) : (
          <div className="aspect-card bg-muted/40 flex items-center justify-center">
            <span className="text-muted-foreground text-sm">{set.name}</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 pt-8 pb-3">
          <h2 className="truncate text-sm font-semibold text-white drop-shadow-sm">{set.name}</h2>
          <p className="text-xs text-white/70">
            {set.cardCount} {set.cardCount === 1 ? "card" : "cards"}, {set.printingCount}{" "}
            {set.printingCount === 1 ? "printing" : "printings"}
          </p>
        </div>
      </div>
    </Link>
  );
}

function SetsPage() {
  const { data } = useSuspenseQuery(publicSetListQueryOptions);

  return (
    <div className={PAGE_PADDING}>
      <h1 className="mb-4 text-2xl font-bold">Card Sets</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {data.sets.map((set) => (
          <SetCard key={set.id} set={set} />
        ))}
      </div>
    </div>
  );
}

function SetsPending() {
  return (
    <div className={PAGE_PADDING}>
      <Skeleton className="mb-4 h-8 w-32" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="p-1.5">
            <Skeleton className="aspect-card w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
