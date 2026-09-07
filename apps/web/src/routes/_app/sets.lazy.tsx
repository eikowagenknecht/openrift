import { imageUrl } from "@openrift/shared/image-url";
import { formatReleasePeriod } from "@openrift/shared/set-release";
import type { SetListEntry } from "@openrift/shared/types/api/catalog";
import { WellKnown } from "@openrift/shared/well-known";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { CalendarIcon, LayersIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { CardLink } from "@/components/ui/card-link";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { Skeleton } from "@/components/ui/skeleton";
import { publicSetListQueryOptions } from "@/features/cards/hooks/use-public-sets";
import { CARD_BORDER_RADIUS } from "@/features/cards/lib/card-grid-constants";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/sets")({
  component: SetsPage,
  pendingComponent: SetsPending,
});

// Sorted by language code (not viewer preference) so server and client render identically.
function releaseLabels(set: SetListEntry): string[] {
  return Object.keys(set.releases)
    .toSorted()
    .map((language) => `${language} ${formatReleasePeriod(set.releases[language])}`);
}

function HeroSetCard({ set }: { set: SetListEntry }) {
  return (
    <CardLink
      render={<Link to="/sets/$setSlug" params={{ setSlug: set.slug }} />}
      className="flex-row gap-0 py-0"
    >
      <div className="relative w-28 shrink-0 sm:w-36">
        {set.coverImageId ? (
          <>
            <div className="aspect-card bg-muted" />
            {/* fallback null: the spacer above already matches the no-cover tile. */}
            <ImgWithFallback
              src={imageUrl(set.coverImageId, "400w")}
              srcSet={`${imageUrl(set.coverImageId, "400w")} 400w, ${imageUrl(set.coverImageId, "full")} 800w`}
              sizes="144px"
              alt={set.name}
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
              style={{ borderRadius: `${CARD_BORDER_RADIUS} 0 0 ${CARD_BORDER_RADIUS}` }}
              fallback={null}
            />
          </>
        ) : (
          <div className="aspect-card bg-muted" />
        )}
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-1 p-4">
        <Heading className="truncate">{set.name}</Heading>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5">
            <LayersIcon className="size-3.5" />
            {set.cardCount} {set.cardCount === 1 ? "card" : "cards"}, {set.printingCount}{" "}
            {set.printingCount === 1 ? "printing" : "printings"}
          </span>
          {releaseLabels(set).map((label, index) => (
            <span key={label} className="flex items-center gap-1.5">
              {index === 0 && <CalendarIcon className="size-3.5" />}
              {label}
            </span>
          ))}
        </div>
      </div>
    </CardLink>
  );
}

// grid-cols-1 matters: without it the implicit column is content-sized and
// wider than a phone viewport, clipping the row's date and title.
const SET_GRID = "grid grid-cols-1 gap-4 min-[1920px]:grid-cols-4 sm:grid-cols-2 xl:grid-cols-3";

function SetsPage() {
  const { data } = useSuspenseQuery(publicSetListQueryOptions);

  const mainSets = data.sets.filter((s) => s.setType === WellKnown.setType.MAIN);
  const supplementalSets = data.sets.filter((s) => s.setType !== WellKnown.setType.MAIN);

  return (
    <div className={PAGE_PADDING}>
      <Heading level={1} className="mb-4">
        Card Sets
      </Heading>
      <div className={SET_GRID}>
        {mainSets.map((set) => (
          <HeroSetCard key={set.id} set={set} />
        ))}
      </div>
      {supplementalSets.length > 0 && (
        <>
          <Heading className="mt-8 mb-4">Supplemental Sets</Heading>
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
      <div className={SET_GRID}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
