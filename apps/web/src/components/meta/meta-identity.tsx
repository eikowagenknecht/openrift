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
   * The legend card's slug. Supply it to link the name at the card page, and
   * omit it inside a wrapper that is itself a link — an anchor inside an anchor
   * is invalid, which is why deck tiles pass nothing.
   */
  slug?: string | null;
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
  const named =
    slug === null || slug === undefined || slug === "" ? (
      championText
    ) : (
      <Link to="/cards/$cardSlug" params={{ cardSlug: slug }} className="hover:underline">
        {championText}
      </Link>
    );

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
