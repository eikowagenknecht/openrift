import type { DeckLink, LinkHost } from "@openrift/shared";
import { legendDisplayName, resolveLinkHost } from "@openrift/shared";
import { ExternalLinkIcon, PlayIcon } from "lucide-react";
import { Suspense } from "react";

import { MarkdownText } from "@/components/markdown-text";
import { Button } from "@/components/ui/button";
import { Pressable } from "@/components/ui/pressable";
import { useFullCatalog } from "@/hooks/use-cards";
import { useHydrated } from "@/hooks/use-hydrated";
import type { CardOpenTarget, HoverHandler } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { catalogCardToDeckBuilderCard } from "@/lib/deck-builder-card";
import { cn } from "@/lib/utils";

interface DeckDescriptionProps {
  text: string;
  className?: string;
  onHoverCard?: HoverHandler;
  onCardClick?: (card: CardOpenTarget) => void;
}

/** The same span `expandCardLinks` rewrites, so nothing loads the catalogue for a description without one. */
const CARD_REFERENCE = /\[\[[^[\]\n]{1,80}\]\]/u;

const CARD_LINK_CLASS =
  "text-foreground decoration-muted-foreground/60 hover:decoration-foreground inline font-medium underline decoration-dotted underline-offset-2";

/** The catalog is client-only, so before hydration every reference renders as the plain-text fallback (no layout shift, same inline span). */
export function DeckDescription({
  text,
  className,
  onHoverCard,
  onCardClick,
}: DeckDescriptionProps) {
  const hydrated = useHydrated();
  const plain = (
    <MarkdownText
      text={text}
      headings
      className={className}
      renderCardLink={(_name, children) => <span className={CARD_LINK_CLASS}>{children}</span>}
    />
  );
  if (!hydrated || !CARD_REFERENCE.test(text)) {
    return plain;
  }
  return (
    <Suspense fallback={plain}>
      <ResolvedDeckDescription
        text={text}
        className={className}
        onHoverCard={onHoverCard}
        onCardClick={onCardClick}
      />
    </Suspense>
  );
}

/** A reference can name any card, including one a subset-serving page (the share and archive deck pages) never carries, so this reads the whole catalogue. */
function ResolvedDeckDescription({
  text,
  className,
  onHoverCard,
  onCardClick,
}: DeckDescriptionProps) {
  const { printingsByCardId } = useFullCatalog();

  const cardByName = new Map<string, DeckBuilderCard>();
  for (const [cardId, printings] of printingsByCardId) {
    const card = printings[0]?.card;
    if (card) {
      const builderCard = catalogCardToDeckBuilderCard(cardId, card);
      cardByName.set(card.name.toLowerCase(), builderCard);
      // Legends also resolve by their colloquial display name ("Azir, Emperor
      // of the Sands"): the editor's autocomplete inserts that form.
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

/** Hosts are allowlisted; a link with an unrecognized host is dropped. */
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
