import type { Card } from "@openrift/shared/types/catalog";
import { deckIdentityLabels } from "@openrift/shared/utils";

import { cn } from "@/lib/utils";

export function DeckIdentityLine({
  legendCard,
  championCard,
  tagSummary,
  className,
}: {
  legendCard?: Pick<Card, "name" | "types" | "tags">;
  championCard?: Pick<Card, "name">;
  tagSummary?: string | null;
  className?: string;
}) {
  const identity = deckIdentityLabels(legendCard, championCard);
  const pair = [identity.legend, identity.champion].filter(Boolean).join(" / ");
  if (pair === "" && !tagSummary) {
    return null;
  }
  return (
    <p className={cn("text-muted-foreground truncate text-xs", className)}>
      {identity.character !== undefined && (
        <>
          <span className="text-foreground/80 font-medium">{identity.character}</span>{" "}
        </>
      )}
      {pair}
      {pair !== "" && tagSummary ? " · " : ""}
      {tagSummary}
    </p>
  );
}
