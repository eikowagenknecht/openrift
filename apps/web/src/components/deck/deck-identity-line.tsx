import type { Card } from "@openrift/shared";
import { deckIdentityLabels } from "@openrift/shared";

import { cn } from "@/lib/utils";

/**
 * The Legend/champion subtitle shared by the deck tile and the deck list row,
 * with the deck's format tags appended.
 *
 * In constructed the Legend's champion tag always matches the champion unit, so
 * the plain pairing repeats the champion on both halves ("Mel, Soul's
 * Reflection / Mel, Newly Awakened"). This names it once up front, in the
 * foreground colour, and leaves the two epithets muted behind it — the same
 * arrangement the deck hero uses.
 *
 * @returns The subtitle line, or null when there is nothing to name.
 */
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
