import type { Card, DeckListItemResponse, Printing } from "@openrift/shared";
import { ZONE_LABELS, getOrientation, legendDisplayName } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { CardMiniRow } from "@/components/cards/card-mini-row";
import { EnergyGlyph, PowerPips } from "@/components/deck/deck-card-row";
import { DeckMiniIdentity } from "@/components/deck/deck-mini-identity";
import { DeckZoneHeader } from "@/components/deck/deck-zone-header";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Pressable } from "@/components/ui/pressable";
import { Switch } from "@/components/ui/switch";
import { useCards } from "@/hooks/use-cards";
import { deckDetailQueryOptions, useDecks } from "@/hooks/use-decks";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useRequiredUserId } from "@/lib/auth-session";
import { deckDiffCardsFrom } from "@/lib/deck-diff";
import type { SideBySideRow } from "@/lib/deck-side-by-side";
import { alignDeckLists } from "@/lib/deck-side-by-side";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

// The full comparison between two members of a variant family (ADR-042): both
// lists side by side, older on the left, so what a version did to its
// predecessor reads as one pass down the page. Each side is a deck-list row —
// the same art strip, count, name and costs the deck page shows — minus the
// ownership and price columns, which say nothing about a comparison.

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

/** @returns The deck's name, or a placeholder while the list is still loading. */
function deckName(members: readonly DeckListItemResponse[], deckId: string): string {
  return members.find((member) => member.deck.id === deckId)?.deck.name ?? "Deck";
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
}: {
  row: SideBySideRow;
  catalog: RowCatalog;
  display: RowDisplay;
}) {
  const styles = CELL_STYLES[row.kind];
  return (
    <div className="hover:bg-muted/50 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded text-sm">
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
 * name, format line) with the family behind a menu, and its own way into the
 * deck beside it — so "open" always names which of the two it means. Choosing
 * rewrites the URL rather than local state, so a comparison stays linkable.
 *
 * @returns The labelled picker.
 */
function DeckPicker({
  label,
  value,
  members,
  onChange,
}: {
  label: string;
  value: string;
  members: readonly DeckListItemResponse[];
  onChange: (deckId: string) => void;
}) {
  const selected = members.find((member) => member.deck.id === value);
  const name = selected?.deck.name ?? "Deck";
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
            {selected ? (
              <DeckMiniIdentity item={selected} className="min-w-0 flex-1" />
            ) : (
              <span className="text-muted-foreground min-w-0 flex-1 truncate p-2 text-sm">
                {name}
              </span>
            )}
            <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-w-(--available-width)">
            <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
              {members.map((member) => (
                <DropdownMenuRadioItem
                  key={member.deck.id}
                  value={member.deck.id}
                  className="py-0 pr-8 pl-0"
                >
                  <DeckMiniIdentity item={member} className="min-w-0 flex-1 rounded-md" />
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          className="self-center"
          render={
            <Link to="/decks/$deckId" params={{ deckId: value }} aria-label={`Open ${name}`} />
          }
        >
          Open
        </Button>
      </div>
    </div>
  );
}

/**
 * The changes page: what one variant did to another, card for card.
 * @returns The page element.
 */
export function DeckChangesPage({
  deckId,
  fromId,
}: {
  /** The newer side, and the deck whose family the page belongs to. */
  deckId: string;
  /** The older side. */
  fromId: string;
}) {
  // What changed is the reason to open the page at all; the cards that stayed
  // are the context you ask for after.
  const [changesOnly, setChangesOnly] = useState(true);
  const userId = useRequiredUserId();
  const navigate = useNavigate();
  const { cardsById } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();
  const { labels } = useEnumOrders();
  const domainColors = useDomainColors();
  const { data: items } = useDecks();

  const display: RowDisplay = {
    domainColors,
    rarityLabels: labels.rarities,
    domainLabels: labels.domains,
  };

  const current = items.find((item) => item.deck.id === deckId);
  const familyId = current?.deck.familyId ?? null;
  const family = items
    .filter((item) =>
      familyId === null ? item.deck.id === deckId : item.deck.familyId === familyId,
    )
    .toSorted((left, right) => right.deck.updatedAt.localeCompare(left.deck.updatedAt));
  // A link kept from before one side left the family still has to name both
  // decks, so the compared deck joins the pickers even when it isn't a member.
  const outsider = family.some((member) => member.deck.id === fromId)
    ? undefined
    : items.find((item) => item.deck.id === fromId);
  const members = outsider ? [...family, outsider] : family;

  const { data: toDetail } = useQuery(deckDetailQueryOptions(userId, deckId));
  const { data: fromDetail } = useQuery(deckDetailQueryOptions(userId, fromId));

  const zones =
    fromDetail && toDetail
      ? alignDeckLists(
          deckDiffCardsFrom(fromDetail.cards, cardsById),
          deckDiffCardsFrom(toDetail.cards, cardsById),
        )
      : [];
  const rows = zones.flatMap((zone) => zone.rows);
  const sharedCount = rows.reduce((total, row) => total + Math.min(row.from, row.to), 0);
  const isIdentical = rows.every((row) => row.kind === "same");

  const toName = deckName(members, deckId);

  const handleFromChange = (next: string) => {
    void navigate({ to: "/decks/$deckId/changes", params: { deckId }, search: { from: next } });
  };
  const handleToChange = (next: string) => {
    void navigate({
      to: "/decks/$deckId/changes",
      params: { deckId: next },
      search: { from: fromId },
    });
  };

  return (
    <>
      <PageTopBarSticky maxWidth="5xl">
        <PageTopBar>
          <PageTopBarBack
            to="/decks/$deckId"
            params={{ deckId }}
            aria-label={`Back to ${toName}`}
          />
          <PageTopBarTitle>Changes</PageTopBarTitle>
          <PageTopBarActions>
            <Switch id="deck-changes-only" checked={changesOnly} onCheckedChange={setChangesOnly} />
            <Label htmlFor="deck-changes-only" className="font-normal">
              Only what changed
            </Label>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_PADDING_NO_TOP, "mx-auto flex max-w-5xl flex-col gap-5 pt-3")}>
        {/* The pickers sit on the row grid, so each one heads the column it
            fills and the comparison needs no second row of deck names. */}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-2">
          <DeckPicker label="From" value={fromId} members={members} onChange={handleFromChange} />
          {/* Same size and column as the row arrows below, offset past the
              caption line so it centres on the deck cards rather than on the
              column as a whole. */}
          <span className="hidden items-center justify-center self-stretch pt-6 sm:flex">
            <ArrowRightIcon aria-hidden className="text-muted-foreground size-3 shrink-0" />
          </span>
          <DeckPicker label="To" value={deckId} members={members} onChange={handleToChange} />
        </div>

        <p className="text-muted-foreground text-sm tabular-nums">
          {sharedCount} {sharedCount === 1 ? "card is" : "cards are"} the same
        </p>

        {fromId === deckId && (
          <p className="text-muted-foreground text-sm">Pick two different versions to compare.</p>
        )}
        {isIdentical && fromId !== deckId && (
          <p className="text-sm">The two lists match, card for card.</p>
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
                  />
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
