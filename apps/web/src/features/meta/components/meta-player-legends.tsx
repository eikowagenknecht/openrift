import { imageUrl } from "@openrift/shared/image-url";

import { Heading } from "@/components/heading";
import { Card } from "@/components/ui/card";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { MetaIdentity } from "@/features/meta/components/meta-identity";
import type { MetaPlayerLegendEntry } from "@/features/meta/lib/meta-player-page";

function countLabel(value: number, singular: string, plural: string): string {
  return `${value.toLocaleString("en-US")} ${value === 1 ? singular : plural}`;
}

function LegendTile({ entry }: { entry: MetaPlayerLegendEntry }) {
  const { legend } = entry;

  return (
    <Card size="sm" className="flex-row items-center gap-3 px-3">
      {legend.imageId !== null && (
        // Wrapped: an <img> as the card's own first child takes the primitive's
        // full-bleed treatment, which is for a cover image, not a portrait.
        <span className="shrink-0">
          <ImgWithFallback
            src={imageUrl(legend.imageId, "240w")}
            alt=""
            aria-hidden="true"
            loading="lazy"
            draggable={false}
            fallback={null}
            className="aspect-card w-11 rounded-md object-cover"
          />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <MetaIdentity
          name={legend.name}
          slug={legend.slug}
          archiveSlug={legend.archiveSlug}
          domains={legend.domains}
          layout="stacked"
          className="text-sm"
        />
        <p className="text-muted-foreground text-xs tabular-nums">
          {countLabel(entry.finishes, "finish", "finishes")}
          {entry.wins > 0 && (
            <>
              {" · "}
              <span className="text-border-accent font-medium">
                {countLabel(entry.wins, "win", "wins")}
              </span>
            </>
          )}
        </p>
      </div>
    </Card>
  );
}

export function MetaPlayerLegends({
  entries,
  withoutLegend,
}: {
  entries: readonly MetaPlayerLegendEntry[];
  withoutLegend: number;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Heading>Legends played</Heading>
        {withoutLegend > 0 && (
          <p className="text-muted-foreground text-xs">
            {countLabel(withoutLegend, "finish has", "finishes have")} no legend on file
          </p>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {entries.map((entry) => (
          <li key={entry.legend.cardId}>
            <LegendTile entry={entry} />
          </li>
        ))}
      </ul>
    </section>
  );
}
