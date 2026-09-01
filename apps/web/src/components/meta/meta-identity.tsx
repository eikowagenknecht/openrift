import { Link } from "@tanstack/react-router";

import { DomainIcon } from "@/components/deck/domain-icon";
import { splitLegendName } from "@/lib/meta-format";
import { cn } from "@/lib/utils";

/**
 * How the two halves of a legend's name sit together:
 *
 * - `row` — one line, for a byline or a header.
 * - `stacked` — champion over title, for a two-line table cell.
 * - `tile` — the same stack at card weight, for a deck tile or winner card.
 */
type MetaIdentityLayout = "row" | "stacked" | "tile";

const CHAMPION_CLASS: Record<MetaIdentityLayout, string> = {
  row: "font-medium",
  stacked: "font-medium",
  tile: "font-semibold",
};

const TITLE_CLASS: Record<MetaIdentityLayout, string> = {
  row: "text-muted-foreground",
  stacked: "text-muted-foreground text-xs",
  tile: "text-muted-foreground text-xs",
};

function filled(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === "" ? null : value;
}

const RUNE_CLASS: Record<MetaIdentityLayout, string> = {
  row: "size-4",
  stacked: "size-3.5",
  tile: "size-4",
};

export interface MetaIdentityProps {
  /**
   * The legend's display name as the archive payload carries it, already
   * champion-led ("Lux, Lady of Luminosity").
   */
  name: string | null | undefined;
  /**
   * The legend card's slug. Supply it to link the name, and omit it inside a
   * wrapper that is itself a link — an anchor inside an anchor is invalid, which
   * is why deck tiles pass nothing.
   */
  slug?: string | null;
  /**
   * The card ref's `archiveSlug`. Supply it to send the name to the legend's own
   * archive page instead of the catalog.
   *
   * Never composed here from `name` and `slug`: the key needs the champion tag,
   * and this component cannot tell a legend's composed name from a champion
   * unit's printed one. An archived list whose legend zone the source never
   * published is titled by its Chosen Champion, and deriving a key for that
   * produced a link to a page that does not exist. The API composes it once
   * (null for anything with no archive page), and a caller passes it through.
   */
  archiveSlug?: string | null;
  /** Domain slugs for the runes, in the order they should read. */
  domains?: readonly string[];
  layout?: MetaIdentityLayout;
  /**
   * Drops the legend card title, leaving the champion alone. The compact top-8
   * bracket is the only surface allowed this: everywhere else a legend is named
   * by champion and title together, so two legends of the same champion stay
   * apart.
   */
  championOnly?: boolean;
  className?: string;
}

/**
 * A legend as every archive surface names it: the champion, the legend card's
 * own title, and the domain runes.
 *
 * @returns The identity element, or null when there is no legend to name.
 */
export function MetaIdentity({
  name,
  slug,
  archiveSlug,
  domains,
  layout = "row",
  championOnly = false,
  className,
}: MetaIdentityProps) {
  if (name === null || name === undefined || name === "") {
    return null;
  }

  const { champion, title } = splitLegendName(name);
  const showTitle = !championOnly && title !== null;

  const championText = <span className={CHAMPION_CLASS[layout]}>{champion}</span>;
  // Positioned so the name still takes its own clicks inside a stretched-link
  // tile, where an unpositioned anchor sits under the overlay.
  const linkClass = "relative hover:underline";
  const legendKey = filled(archiveSlug);
  const cardSlug = filled(slug);
  let named = championText;
  if (legendKey !== null) {
    named = (
      <Link to="/meta/legends/$slug" params={{ slug: legendKey }} className={linkClass}>
        {championText}
      </Link>
    );
  } else if (cardSlug !== null) {
    named = (
      <Link to="/cards/$cardSlug" params={{ cardSlug }} className={linkClass}>
        {championText}
      </Link>
    );
  }

  const runeRow = domains?.length ? (
    <span className="flex shrink-0 items-center gap-0.5">
      {domains.map((domain) => (
        <DomainIcon key={domain} domain={domain} className={RUNE_CLASS[layout]} />
      ))}
    </span>
  ) : null;

  if (layout === "row") {
    return (
      <span
        data-slot="meta-identity"
        className={cn("flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}
      >
        <span className="min-w-0 truncate">{named}</span>
        {showTitle && (
          <>
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
            <span className={cn("min-w-0 truncate", TITLE_CLASS[layout])}>{title}</span>
          </>
        )}
        {runeRow}
      </span>
    );
  }

  return (
    <span data-slot="meta-identity" className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate">{named}</span>
        {runeRow}
      </span>
      {showTitle && (
        <span className={cn("min-w-0 truncate leading-tight", TITLE_CLASS[layout])}>{title}</span>
      )}
    </span>
  );
}
