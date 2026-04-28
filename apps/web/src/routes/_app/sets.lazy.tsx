import type { SetListEntry } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { CalendarIcon, LayersIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/sets")({
  component: SetsPage,
  pendingComponent: SetsPending,
});

const CARD_BORDER_RADIUS = "5% / 3.6%";

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function HeroSetCard({ set }: { set: SetListEntry }) {
  return (
    <Link
      to="/sets/$setSlug"
      params={{ setSlug: set.slug }}
      className="border-border bg-card hover:bg-accent group flex overflow-hidden rounded-xl border transition-colors"
    >
      <div className="relative w-28 shrink-0 sm:w-36">
        {set.coverImageId ? (
          <>
            <div className="aspect-card bg-muted/40" />
            <img
              src={imageUrl(set.coverImageId, "400w")}
              srcSet={`${imageUrl(set.coverImageId, "400w")} 400w, ${imageUrl(set.coverImageId, "full")} 800w`}
              sizes="144px"
              alt={set.name}
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
              style={{ borderRadius: `${CARD_BORDER_RADIUS} 0 0 ${CARD_BORDER_RADIUS}` }}
            />
          </>
        ) : (
          <div className="aspect-card bg-muted/40" />
        )}
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-1 p-4">
        <h2 className="truncate text-lg font-semibold">{set.name}</h2>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5">
            <LayersIcon className="size-3.5" />
            {set.cardCount} {set.cardCount === 1 ? "card" : "cards"}, {set.printingCount}{" "}
            {set.printingCount === 1 ? "printing" : "printings"}
          </span>
          {set.releasedAt && (
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="size-3.5" />
              {formatDate(set.releasedAt)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

const SET_GRID = "grid gap-4 min-[1920px]:grid-cols-4 sm:grid-cols-2 xl:grid-cols-3";

function SetsPage() {
  const { data } = useSuspenseQuery(publicSetListQueryOptions);

  const mainSets = data.sets.filter((s) => s.setType === "main");
  const supplementalSets = data.sets.filter((s) => s.setType !== "main");

  return (
    <div className={PAGE_PADDING}>
      <h1 className="mb-4 text-2xl font-bold">Card Sets</h1>
      <div className={SET_GRID}>
        {mainSets.map((set) => (
          <HeroSetCard key={set.id} set={set} />
        ))}
      </div>
      {supplementalSets.length > 0 && (
        <>
          <h2 className="mt-8 mb-4 text-lg font-semibold">Supplemental Sets</h2>
          <div className={SET_GRID}>
            {supplementalSets.map((set) => (
              <HeroSetCard key={set.id} set={set} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SetsPending() {
  return (
    <div className={PAGE_PADDING}>
      <Skeleton className="mb-4 h-8 w-32" />
      <div className="grid gap-4 min-[1920px]:grid-cols-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
