import { Link } from "@tanstack/react-router";

import { DomainIcon } from "@/features/decks/components/domain-icon";
import { splitLegendName } from "@/features/meta/lib/meta-format";
import { cn } from "@/lib/utils";

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
  name: string | null | undefined;
  slug?: string | null;
  archiveSlug?: string | null;
  domains?: readonly string[];
  layout?: MetaIdentityLayout;
  championOnly?: boolean;
  className?: string;
}

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
