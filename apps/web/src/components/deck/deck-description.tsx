import type { DeckLink, LinkHost } from "@openrift/shared";
import { legendDisplayName, resolveLinkHost } from "@openrift/shared";
import { ExternalLinkIcon, PlayIcon } from "lucide-react";

import { MarkdownText } from "@/components/markdown-text";
import { Button } from "@/components/ui/button";
import { Pressable } from "@/components/ui/pressable";
import { useCards } from "@/hooks/use-cards";
import { useHydrated } from "@/hooks/use-hydrated";
import type { CardOpenTarget, HoverHandler } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { catalogCardToDeckBuilderCard } from "@/lib/deck-builder-card";
import { cn } from "@/lib/utils";

interface DeckDescriptionProps {
  text: string;
  className?: string;
  onHoverCard?: HoverHandler;
  /** Opens the card detail; card links fall back to plain text without it. */
  onCardClick?: (card: CardOpenTarget) => void;
}

/** The inline look of a resolved card reference inside the description. */
const CARD_LINK_CLASS =
  "text-foreground decoration-muted-foreground/60 hover:decoration-foreground inline font-medium underline decoration-dotted underline-offset-2";

/**
 * A deck description with `[[Card Name]]` references resolved against the
 * catalog: hovering raises the host's floating card preview, clicking opens
 * the card detail. Unresolved names render as plain emphasized text. The
 * catalog is client-only, so before hydration every reference renders as the
 * plain-text fallback (no layout shift — same inline span).
 * @returns The rendered description.
 */
export function DeckDescription({
  text,
  className,
  onHoverCard,
  onCardClick,
}: DeckDescriptionProps) {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <MarkdownText
        text={text}
        headings
        className={className}
        renderCardLink={(_name, children) => <span className={CARD_LINK_CLASS}>{children}</span>}
      />
    );
  }
  return (
    <ResolvedDeckDescription
      text={text}
      className={className}
      onHoverCard={onHoverCard}
      onCardClick={onCardClick}
    />
  );
}

/**
 * Client half of {@link DeckDescription}; owns the catalog subscription.
 * @returns The rendered description with resolved card links.
 */
function ResolvedDeckDescription({
  text,
  className,
  onHoverCard,
  onCardClick,
}: DeckDescriptionProps) {
  const { printingsByCardId } = useCards();

  const cardByName = new Map<string, DeckBuilderCard>();
  for (const [cardId, printings] of printingsByCardId) {
    const card = printings[0]?.card;
    if (card) {
      const builderCard = catalogCardToDeckBuilderCard(cardId, card);
      cardByName.set(card.name.toLowerCase(), builderCard);
      // Legends also resolve by their colloquial display name ("Azir, Emperor
      // of the Sands"), which is what the editor's autocomplete inserts.
      cardByName.set(legendDisplayName(card).toLowerCase(), builderCard);
    }
  }

  return (
    <MarkdownText
      text={text}
      headings
      className={className}
      renderCardLink={(name, children) => {
        const card = cardByName.get(name.toLowerCase());
        if (!card) {
          return <span className={CARD_LINK_CLASS}>{children}</span>;
        }
        return (
          <Pressable
            className={cn(CARD_LINK_CLASS, "focus-visible:ring-offset-1")}
            onClick={onCardClick ? () => onCardClick(card) : undefined}
            onMouseEnter={onHoverCard ? () => onHoverCard(card.cardId, null) : undefined}
            onMouseLeave={onHoverCard ? () => onHoverCard(null) : undefined}
            onFocus={onHoverCard ? () => onHoverCard(card.cardId, null) : undefined}
            onBlur={onHoverCard ? () => onHoverCard(null) : undefined}
          >
            {children}
          </Pressable>
        );
      }}
    />
  );
}

/**
 * A deck's outbound links, rendered as chips next to the description on the
 * deck and share pages. A link with no title of its own is named after the
 * site it points at. Hosts are allowlisted, so one that no longer resolves
 * (written before the list changed) is dropped rather than shown bare.
 * @returns The chip row, or null when nothing resolves.
 */
export function DeckLinkChips({ links }: { links: readonly DeckLink[] }) {
  const resolved = links
    .map((link) => ({ link, host: resolveLinkHost(link.url) }))
    .filter((entry): entry is { link: DeckLink; host: LinkHost } => entry.host !== null);
  if (resolved.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {resolved.map(({ link, host }) => (
        <Button
          key={link.url}
          variant="outline"
          size="sm"
          className="w-fit"
          // oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label -- text label is inside the Button children
          render={<a href={link.url} target="_blank" rel="noreferrer" />}
        >
          {host.kind === "video" ? (
            <PlayIcon className="size-4" />
          ) : (
            <ExternalLinkIcon className="size-4" />
          )}
          {link.title ?? host.label}
        </Button>
      ))}
    </div>
  );
}
