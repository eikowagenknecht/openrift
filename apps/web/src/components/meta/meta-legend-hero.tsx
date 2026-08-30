import type { MetaLegendDetailResponse } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { DomainIcon } from "@/components/deck/domain-icon";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { deckGlowStyle } from "@/lib/domain";
import { splitLegendName } from "@/lib/meta-format";
import type { MetaLegendCounts } from "@/lib/meta-legend-page";

function FactCounters({ counts }: { counts: MetaLegendCounts }) {
  return (
    <div className="flex flex-wrap gap-x-9 gap-y-3">
      <Counter value={counts.eventWins} label="event wins" />
      <Counter value={counts.finishes} label="archived finishes" />
      <Counter value={counts.decklists} label="decklists" />
    </div>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <p className="flex flex-col gap-0.5">
      <span className="font-heading text-2xl leading-none font-bold tabular-nums">
        {/* Pinned grouping: the page is server-rendered, and a server on another
            default locale would send "1.247" into a browser rendering "1,247". */}
        {value.toLocaleString("en-US")}
      </span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </p>
  );
}

/**
 * The legend's splash beside its record. The crop is pulled toward the top third,
 * which is where the character sits on every Riftbound legend, and fades into the
 * card from the text side so the counters stay readable over it.
 */
function LegendArt({ imageId, alt }: { imageId: string | null; alt: string }) {
  if (imageId === null) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 overflow-hidden sm:w-2/5">
      <ImgWithFallback
        src={imageUrl(imageId, "400w")}
        alt={alt}
        draggable={false}
        className="h-full w-full object-cover"
        style={{ objectPosition: "50% 18%" }}
        fallback={null}
      />
      <div className="from-card via-card/85 absolute inset-0 bg-linear-to-r to-transparent to-70%" />
      <div className="from-card absolute inset-0 bg-linear-to-t from-0% to-transparent to-35% sm:hidden" />
    </div>
  );
}

/**
 * The legend page's header: who the legend is, what the archive holds for them,
 * and the artwork the rest of the page is about.
 *
 * The champion's name links at the card page, which is the one place on this
 * page that leaves the archive.
 */
export function MetaLegendHero({
  legend,
  counts,
}: {
  legend: MetaLegendDetailResponse["legend"];
  counts: MetaLegendCounts;
}) {
  const domainColors = useDomainColors();
  const { champion, title } = splitLegendName(legend.name);

  return (
    <section className="bg-card ring-foreground/10 relative overflow-hidden rounded-xl ring-1">
      <div
        aria-hidden
        className="absolute inset-0"
        style={deckGlowStyle(legend.domains, domainColors)}
      />
      <LegendArt imageId={legend.imageId} alt={champion} />

      <div className="relative flex flex-col gap-3 p-5 pr-[45%] sm:pr-[38%]">
        <div className="flex flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="font-heading text-2xl font-bold">
              <Link
                to="/cards/$cardSlug"
                params={{ cardSlug: legend.slug }}
                className="hover:underline"
              >
                {champion}
              </Link>
            </h1>
            {legend.domains.length > 0 && (
              <span className="flex shrink-0 items-center gap-1">
                {legend.domains.map((domain) => (
                  <DomainIcon key={domain} domain={domain} className="size-5" />
                ))}
              </span>
            )}
          </div>
          {title !== null && <p className="text-muted-foreground text-sm">{title} · Legend</p>}
        </div>

        <FactCounters counts={counts} />

        <p className="text-muted-foreground text-xs">
          Every {champion} result on record: tournament finishes, the players behind them, and the
          lists they registered.
        </p>
      </div>
    </section>
  );
}
