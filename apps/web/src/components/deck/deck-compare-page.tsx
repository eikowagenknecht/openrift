import type { Card, DeckListItemResponse, Printing } from "@openrift/shared";
import {
  ZONE_LABELS,
  WellKnown,
  getOrientation,
  imageUrl,
  legendDisplayName,
} from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon, ChevronDownIcon, ClipboardPasteIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";

import { CardMiniRow } from "@/components/cards/card-mini-row";
import { EnergyGlyph, PowerPips } from "@/components/deck/deck-card-row";
import type { PastedCompareSource } from "@/components/deck/deck-compare-paste-dialog";
import { DeckComparePasteDialog } from "@/components/deck/deck-compare-paste-dialog";
import type { DeckIdentity } from "@/components/deck/deck-mini-identity";
import { DeckMiniIdentity } from "@/components/deck/deck-mini-identity";
import { DeckZoneHeader } from "@/components/deck/deck-zone-header";
import { HoveredCardPreview } from "@/components/deck/hovered-card-preview";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Pressable } from "@/components/ui/pressable";
import { Switch } from "@/components/ui/switch";
import { useCards } from "@/hooks/use-cards";
import { decksQueryOptions, deckDetailQueryOptions } from "@/hooks/use-decks";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useUserId } from "@/lib/auth-session";
import type { OwnDeckCard } from "@/lib/deck-compare-sources";
import { collectCompareDeckOptions, ownDeckDiffCards } from "@/lib/deck-compare-sources";
import type { DeckDiffCard } from "@/lib/deck-diff";
import type { SideBySideRow } from "@/lib/deck-side-by-side";
import { alignDeckLists } from "@/lib/deck-side-by-side";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";
import type { LocalDeck } from "@/stores/local-decks-store";
import { isLocalDeckId, useLocalDecksStore } from "@/stores/local-decks-store";

// The comparison between two decks, side by side, older on the left: the page
// behind both "show what changed" inside a variant family (ADR-042) and
// "compare with another deck". Each side is a deck-list row — the same art
// strip, count, name and costs the deck page shows — minus the ownership and
// price columns, which say nothing about a comparison.

/** Which column a picker fills. Doubles as the search-param name. */
type SideKey = "from" | "to";

const CELL_STYLES: Record<SideBySideRow["kind"], { from: string; to: string }> = {
  same: { from: "text-muted-foreground", to: "text-muted-foreground" },
  add: {
    from: "text-muted-foreground/60",
    to: "bg-green-500/10 text-green-700 dark:text-green-400",
  },
  cut: { from: "bg-destructive/10 text-destructive", to: "text-muted-foreground/60" },
  change: {
    from: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
    to: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
  },
};

/**
 * What a row shows about its card, resolved once per row by the page. Both
 * sides stand for the same card, so they share it — including the printing,
 * which is the catalog's default rather than either deck's pinned art (a
 * comparison aggregates a card's printings into one line).
 */
interface RowCatalog {
  card?: Card;
  printing?: Printing;
}

/** Everything the rows read from a hook, lifted to the page — see `CardMiniRow`. */
interface RowDisplay {
  domainColors: Record<string, string>;
  rarityLabels: Record<string, string>;
  domainLabels: Record<string, string>;
}

function SideCell({
  count,
  row,
  catalog,
  display,
  className,
}: {
  count: number;
  row: SideBySideRow;
  catalog: RowCatalog;
  display: RowDisplay;
  className: string;
}) {
  if (count === 0) {
    return <span className={cn("flex min-h-8 items-center px-2", className)}>—</span>;
  }
  const { card, printing } = catalog;
  const displayName = card
    ? legendDisplayName({ name: row.cardName, types: card.types, tags: card.tags })
    : row.cardName;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 rounded px-2 py-1 sm:gap-2", className)}>
      <CardMiniRow
        className="self-stretch"
        imageId={printing?.images.find((image) => image.face === "front")?.imageId}
        landscape={card ? getOrientation(card.types) === "landscape" : false}
        domains={card?.domains}
        domainColors={display.domainColors}
        rarity={printing?.rarity}
        rarityLabels={display.rarityLabels}
        shortCode={printing?.shortCode}
        loading="lazy"
        hideMetaOnMobile
      />

      <span className="w-6 shrink-0 text-right tabular-nums">{count}×</span>

      <span className="min-w-0 flex-1 truncate">{displayName}</span>

      <PowerPips
        power={card?.power ?? null}
        domains={card?.domains ?? []}
        colors={display.domainColors}
        domainLabels={display.domainLabels}
      />

      {card?.energy !== null && card !== undefined && <EnergyGlyph value={card.energy} />}
    </span>
  );
}

function ChangesRow({
  row,
  catalog,
  display,
  onHover,
}: {
  row: SideBySideRow;
  catalog: RowCatalog;
  display: RowDisplay;
  onHover: (cardId: string | null) => void;
}) {
  const styles = CELL_STYLES[row.kind];
  return (
    <div
      className="hover:bg-muted/50 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded text-sm"
      onMouseEnter={() => onHover(row.cardId)}
      onMouseLeave={() => onHover(null)}
    >
      <SideCell
        count={row.from}
        row={row}
        catalog={catalog}
        display={display}
        className={styles.from}
      />
      <ArrowRightIcon
        aria-hidden
        className={cn(
          "size-3 shrink-0",
          row.kind === "same" ? "text-muted-foreground/30" : "text-muted-foreground",
        )}
      />
      <SideCell
        count={row.to}
        row={row}
        catalog={catalog}
        display={display}
        className={styles.to}
      />
    </div>
  );
}

/**
 * One side's deck picker: the deck as it looks everywhere else (fanned art,
 * name, domains, size and date) with the variant family behind a menu, the
 * rest of the user's decks one step further in, and its own way into the deck
 * beside it — so "open" always names which of the two it means. Picking
 * rewrites the URL rather than local state, so a comparison stays linkable.
 *
 * @returns The labelled picker.
 */
function DeckPicker({
  label,
  value,
  identity,
  familyIds,
  otherIds,
  identityById,
  onPick,
  onPaste,
}: {
  label: string;
  /** The picked deck's id, or null for an unset or pasted side. */
  value: string | null;
  /** What the picked side shows; null when nothing is picked yet. */
  identity: DeckIdentity | null;
  /** The anchor deck's variant family, listed first. */
  familyIds: string[];
  /** Everything else the user owns, behind the "More decks" step. */
  otherIds: string[];
  identityById: ReadonlyMap<string, DeckIdentity>;
  onPick: (deckId: string) => void;
  onPaste: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const name = identity?.name ?? "Choose a deck";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {/* A caption, not a form label: the control below is a menu button, which
          `<label for>` can't point at. */}
      <span className="text-sm leading-none font-medium">{label}</span>
      <div className="flex min-w-0 items-stretch gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Pressable
                aria-label={`${label}: ${name}`}
                className="bg-card ring-foreground/10 hover:bg-accent/40 flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-lg pr-2 ring-1 transition-colors"
              />
            }
          >
            {identity ? (
              <DeckMiniIdentity identity={identity} className="min-w-0 flex-1" />
            ) : (
              <span className="text-muted-foreground min-w-0 flex-1 truncate p-2 text-sm">
                {name}
              </span>
            )}
            <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-w-(--available-width)">
            <DropdownMenuRadioGroup value={value ?? ""} onValueChange={onPick}>
              {familyIds.map((deckId) => (
                <PickerRow key={deckId} deckId={deckId} identityById={identityById} />
              ))}
              {/* The family is what you came for; the rest of the decks are a
                  step further in rather than a wall to scroll past. */}
              {showAll &&
                otherIds.map((deckId) => (
                  <PickerRow key={deckId} deckId={deckId} identityById={identityById} />
                ))}
            </DropdownMenuRadioGroup>
            {otherIds.length > 0 && !showAll && (
              <DropdownMenuItem closeOnClick={false} onClick={() => setShowAll(true)}>
                <PlusIcon className="size-4" />
                More decks ({otherIds.length})
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onPaste}>
              <ClipboardPasteIcon className="size-4" />
              Paste a deck code or list…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {value !== null && (
          <Button
            variant="outline"
            className="self-center"
            render={
              <Link to="/decks/$deckId" params={{ deckId: value }} aria-label={`Open ${name}`} />
            }
          >
            Open
          </Button>
        )}
      </div>
    </div>
  );
}

/** @returns One deck's row in a picker menu. */
function PickerRow({
  deckId,
  identityById,
}: {
  deckId: string;
  identityById: ReadonlyMap<string, DeckIdentity>;
}) {
  const identity = identityById.get(deckId);
  if (!identity) {
    return null;
  }
  return (
    <DropdownMenuRadioItem value={deckId} className="py-0 pr-8 pl-0">
      <DeckMiniIdentity identity={identity} className="min-w-0 flex-1 rounded-md" />
    </DropdownMenuRadioItem>
  );
}

/** @returns Total copies across every zone. */
function countCopies(cards: readonly OwnDeckCard[]): number {
  return cards.reduce((total, card) => total + card.quantity, 0);
}

/** @returns The identity a server deck shows in a picker. */
function serverIdentity(item: DeckListItemResponse): DeckIdentity {
  return {
    name: item.deck.name,
    legendCardId: item.legendCardId,
    championCardId: item.championCardId,
    cardCount: item.totalCards,
    updatedAt: item.deck.updatedAt,
  };
}

/**
 * The identity a browser-local deck shows. The list endpoint's legend and
 * champion ids have no local equivalent, so they come off the deck's own rows.
 * @returns The identity.
 */
function localIdentity(deck: LocalDeck): DeckIdentity {
  return {
    name: deck.name,
    legendCardId: deck.cards.find((card) => card.zone === WellKnown.deckZone.LEGEND)?.cardId,
    championCardId: deck.cards.find((card) => card.zone === WellKnown.deckZone.CHAMPION)?.cardId,
    cardCount: countCopies(deck.cards),
    updatedAt: deck.updatedAt,
  };
}

/**
 * One side's card rows. A `local:` id resolves from the browser store (ADR-035,
 * works logged out); a server id goes through the deck-detail query, which the
 * route has already warmed for the ids it was opened with.
 *
 * @returns The rows, or null while the side is unset or still loading.
 */
function useSideRows(deckId: string | null, userId: string | null): readonly OwnDeckCard[] | null {
  const localDecks = useLocalDecksStore((state) => state.decks);
  const isLocal = deckId !== null && isLocalDeckId(deckId);
  const { data } = useQuery({
    ...deckDetailQueryOptions(userId ?? "", deckId ?? ""),
    enabled: deckId !== null && !isLocal && userId !== null,
  });
  if (deckId === null) {
    return null;
  }
  if (isLocal) {
    return localDecks[deckId]?.cards ?? null;
  }
  return data?.cards ?? null;
}

/**
 * The deck comparison page: what one deck holds that another doesn't, card for
 * card.
 * @returns The page element.
 */
export function DeckComparePage({
  fromId,
  toId,
}: {
  /** The left side's deck id, when one is picked. */
  fromId?: string;
  /** The right side's deck id, when one is picked. */
  toId?: string;
}) {
  // What changed is the reason to open the page at all; the cards that stayed
  // are the context you ask for after.
  const [changesOnly, setChangesOnly] = useState(true);
  // A pasted list belongs to the session, not the URL — it is something to look
  // at once, not a deck to link to. Picking a deck for that side clears it.
  const [pastedFrom, setPastedFrom] = useState<PastedCompareSource | null>(null);
  const [pastedTo, setPastedTo] = useState<PastedCompareSource | null>(null);
  const [pasteFor, setPasteFor] = useState<SideKey | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const userId = useUserId();
  const { cardsById } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();
  const { labels } = useEnumOrders();
  const domainColors = useDomainColors();
  const localDecks = useLocalDecksStore((state) => state.decks);
  // Auth-optional (ADR-035): a logged-out visitor still has browser-local decks
  // to compare, so the server list is fetched only when there is a session.
  const { data: serverDecks } = useQuery({
    ...decksQueryOptions(userId ?? ""),
    enabled: userId !== null,
  });

  const display: RowDisplay = {
    domainColors,
    rarityLabels: labels.rarities,
    domainLabels: labels.domains,
  };

  const items = serverDecks ?? [];
  const identityById = new Map<string, DeckIdentity>();
  for (const item of items) {
    identityById.set(item.deck.id, serverIdentity(item));
  }
  for (const deck of Object.values(localDecks)) {
    identityById.set(deck.id, localIdentity(deck));
  }

  // Neither side is in the path, so the deck the menus lead with is whichever
  // one is picked — the right, which is the deck you came from everywhere that
  // links here. Its variant family comes first, newest first; everything else
  // the user owns sits behind "More decks", by name.
  const anchorId = toId ?? fromId ?? null;
  const anchorFamilyId = items.find((item) => item.deck.id === anchorId)?.deck.familyId ?? null;
  const familyIds =
    anchorFamilyId === null
      ? // A standalone deck (or a browser-local one, which has no family at all)
        // leads with itself.
        anchorId !== null && identityById.has(anchorId)
        ? [anchorId]
        : []
      : items
          .filter((item) => item.deck.familyId === anchorFamilyId)
          .toSorted((left, right) => right.deck.updatedAt.localeCompare(left.deck.updatedAt))
          .map((item) => item.deck.id);
  const familySet = new Set(familyIds);
  const otherIds = collectCompareDeckOptions(anchorId ?? "", items, localDecks)
    .filter((option) => !familySet.has(option.id))
    .map((option) => option.id);

  // A side picked as a deck wins over a stale paste; the handlers keep the two
  // from ever being set at once.
  const fromDeckId = pastedFrom ? null : (fromId ?? null);
  const toDeckId = pastedTo ? null : (toId ?? null);
  const fromRows = useSideRows(fromDeckId, userId);
  const toRows = useSideRows(toDeckId, userId);

  const fromCards: DeckDiffCard[] | null = pastedFrom
    ? pastedFrom.cards
    : fromRows
      ? ownDeckDiffCards(fromRows, cardsById).theirs
      : null;
  const toCards: DeckDiffCard[] | null = pastedTo
    ? pastedTo.cards
    : toRows
      ? ownDeckDiffCards(toRows, cardsById).theirs
      : null;

  const pastedIdentity = (pasted: PastedCompareSource): DeckIdentity => ({
    name: "Pasted list",
    cardCount: countCopies(pasted.cards),
  });
  const fromIdentity = pastedFrom
    ? pastedIdentity(pastedFrom)
    : (identityById.get(fromDeckId ?? "") ?? null);
  const toIdentity = pastedTo
    ? pastedIdentity(pastedTo)
    : (identityById.get(toDeckId ?? "") ?? null);

  const zones = fromCards && toCards ? alignDeckLists(fromCards, toCards) : [];
  const rows = zones.flatMap((zone) => zone.rows);
  const sharedCount = rows.reduce((total, row) => total + Math.min(row.from, row.to), 0);
  // Chosen and loaded are different things: a deck picked a moment ago has no
  // rows yet, and the prompt to pick one would read as a step backwards.
  const bothChosen =
    (fromDeckId !== null || pastedFrom !== null) && (toDeckId !== null || pastedTo !== null);
  const bothPicked = fromCards !== null && toCards !== null;
  const isIdentical = bothPicked && rows.every((row) => row.kind === "same");
  const unmatched = [...(pastedFrom?.unmatched ?? []), ...(pastedTo?.unmatched ?? [])];

  const handlePick = (side: SideKey, pickedId: string) => {
    if (side === "from") {
      setPastedFrom(null);
    } else {
      setPastedTo(null);
    }
    void navigate({
      to: "/decks/compare",
      search: {
        from: side === "from" ? pickedId : (fromDeckId ?? undefined),
        to: side === "to" ? pickedId : (toDeckId ?? undefined),
      },
    });
  };

  const handlePasted = (source: PastedCompareSource) => {
    if (pasteFor === "from") {
      setPastedFrom(source);
    } else {
      setPastedTo(source);
    }
    // The pasted side leaves the URL: it can't be linked to, and a stale id
    // there would come back the moment the other side changes.
    void navigate({
      to: "/decks/compare",
      search: {
        from: pasteFor === "from" ? undefined : (fromDeckId ?? undefined),
        to: pasteFor === "to" ? undefined : (toDeckId ?? undefined),
      },
      replace: true,
    });
  };

  const hoveredPrinting =
    hoveredCardId !== null && !isMobile ? (getPreferredPrinting(hoveredCardId) ?? null) : null;
  const hoveredImage = hoveredPrinting?.images.find((image) => image.face === "front") ?? null;
  const hoveredCard =
    hoveredPrinting && hoveredImage
      ? {
          thumbnailUrl: imageUrl(hoveredImage.imageId, "400w"),
          fullUrl: imageUrl(hoveredImage.imageId, "full"),
          landscape: getOrientation(hoveredPrinting.card.types) === "landscape",
        }
      : null;

  return (
    <>
      <PageTopBarSticky maxWidth="5xl">
        <PageTopBar>
          {anchorId === null ? (
            <PageTopBarBack to="/decks" aria-label="Back to your decks" />
          ) : (
            <PageTopBarBack
              to="/decks/$deckId"
              params={{ deckId: anchorId }}
              aria-label="Back to the deck"
            />
          )}
          <PageTopBarTitle>Compare</PageTopBarTitle>
          <PageTopBarActions>
            <Switch id="deck-changes-only" checked={changesOnly} onCheckedChange={setChangesOnly} />
            <Label htmlFor="deck-changes-only" className="font-normal">
              Only what changed
            </Label>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      {/* Full-width and positioned: the hover preview places itself against
          this box, so docking it away from the cursor has to mean the viewport
          edge rather than the edge of the centred column. */}
      <div ref={containerRef} className="relative">
        <div className={cn(PAGE_PADDING_NO_TOP, "mx-auto flex max-w-5xl flex-col gap-5 pt-3")}>
          {/* The pickers sit on the row grid, so each one heads the column it
            fills and the comparison needs no second row of deck names. */}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-2">
            <DeckPicker
              label="From"
              value={fromDeckId}
              identity={fromIdentity}
              familyIds={familyIds}
              otherIds={otherIds}
              identityById={identityById}
              onPick={(picked) => handlePick("from", picked)}
              onPaste={() => setPasteFor("from")}
            />
            {/* Same size and column as the row arrows below, offset past the
              caption line so it centres on the deck cards rather than on the
              column as a whole. */}
            <span className="hidden items-center justify-center self-stretch pt-6 sm:flex">
              <ArrowRightIcon aria-hidden className="text-muted-foreground size-3 shrink-0" />
            </span>
            <DeckPicker
              label="To"
              value={toDeckId}
              identity={toIdentity}
              familyIds={familyIds}
              otherIds={otherIds}
              identityById={identityById}
              onPick={(picked) => handlePick("to", picked)}
              onPaste={() => setPasteFor("to")}
            />
          </div>

          {bothPicked && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {sharedCount} {sharedCount === 1 ? "card is" : "cards are"} the same
            </p>
          )}

          {!bothChosen && (
            <p className="text-muted-foreground text-sm">
              Pick a deck on each side, or paste a deck code or list, to compare them.
            </p>
          )}
          {isIdentical && <p className="text-sm">The two lists match, card for card.</p>}

          {unmatched.length > 0 && (
            <div className="text-muted-foreground flex flex-col gap-1">
              <p className="text-sm">
                Couldn&apos;t match {unmatched.length} {unmatched.length === 1 ? "line" : "lines"}{" "}
                of the pasted list
              </p>
              <ul className="text-2xs flex flex-col gap-0.5">
                {unmatched.map((line, index) => (
                  // Duplicate raw lines are possible, so the index is part of the key.
                  <li key={`${line}-${index}`} className="truncate">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-5">
            {zones.map((zone) => {
              const zoneRows = changesOnly
                ? zone.rows.filter((row) => row.kind !== "same")
                : zone.rows;
              if (zoneRows.length === 0) {
                return null;
              }
              return (
                <section key={zone.zone} className="flex min-w-0 flex-col gap-1">
                  <DeckZoneHeader label={ZONE_LABELS[zone.zone]} />
                  {zoneRows.map((row) => (
                    <ChangesRow
                      key={`${zone.zone}-${row.cardId}`}
                      row={row}
                      catalog={{
                        card: cardsById[row.cardId],
                        printing: getPreferredPrinting(row.cardId),
                      }}
                      display={display}
                      onHover={setHoveredCardId}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        </div>

        <HoveredCardPreview hoveredCard={hoveredCard} origin="main" containerRef={containerRef} />
      </div>

      <DeckComparePasteDialog
        open={pasteFor !== null}
        onOpenChange={(open) => setPasteFor(open ? pasteFor : null)}
        onResolved={handlePasted}
      />
    </>
  );
}
