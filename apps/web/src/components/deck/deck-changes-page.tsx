import type { DeckSummaryResponse } from "@openrift/shared";
import { ZONE_LABELS, formatDay } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";

import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCards } from "@/hooks/use-cards";
import { deckDetailQueryOptions, useDecks } from "@/hooks/use-decks";
import { useRequiredUserId } from "@/lib/auth-session";
import { deckDiffCardsFrom } from "@/lib/deck-diff";
import type { SideBySideRow } from "@/lib/deck-side-by-side";
import { alignDeckLists } from "@/lib/deck-side-by-side";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

// The full comparison between two members of a variant family (ADR-042): both
// lists side by side, older on the left, so what a version did to its
// predecessor reads as one pass down the page.

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

/** @returns The deck's name, or a placeholder while the list is still loading. */
function deckName(members: readonly DeckSummaryResponse[], deckId: string): string {
  return members.find((member) => member.id === deckId)?.name ?? "Deck";
}

function SideCell({ count, name, className }: { count: number; name: string; className: string }) {
  if (count === 0) {
    return <span className={cn("px-1.5 py-0.5", className)}>—</span>;
  }
  return (
    <span className={cn("flex min-w-0 items-baseline gap-1.5 rounded px-1.5 py-0.5", className)}>
      <span className="font-mono tabular-nums">{count}</span>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

function ChangesRow({ row }: { row: SideBySideRow }) {
  const styles = CELL_STYLES[row.kind];
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-2">
      <SideCell count={row.from} name={row.cardName} className={styles.from} />
      <ArrowRightIcon
        aria-hidden
        className={cn(
          "size-3 shrink-0 self-center",
          row.kind === "same" ? "text-muted-foreground/30" : "text-muted-foreground",
        )}
      />
      <SideCell count={row.to} name={row.cardName} className={styles.to} />
    </div>
  );
}

/**
 * One family member picker. Both sides pick from the same list, and choosing
 * rewrites the URL rather than local state, so a comparison stays linkable.
 *
 * @returns The labelled select.
 */
function MemberSelect({
  id,
  label,
  value,
  members,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  members: readonly DeckSummaryResponse[];
  onChange: (deckId: string) => void;
}) {
  const items = members.map((member) => ({ value: member.id, label: member.name }));
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select items={items} value={value} onValueChange={(next) => onChange(next ?? value)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
  const [changesOnly, setChangesOnly] = useState(false);
  const userId = useRequiredUserId();
  const navigate = useNavigate();
  const { cardsById } = useCards();
  const { data: items } = useDecks();

  const current = items.find((item) => item.deck.id === deckId);
  const familyId = current?.deck.familyId ?? null;
  const family = items
    .filter((item) =>
      familyId === null ? item.deck.id === deckId : item.deck.familyId === familyId,
    )
    .map((item) => item.deck)
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  // A link kept from before one side left the family still has to name both
  // decks, so the compared deck joins the pickers even when it isn't a member.
  const outsider = family.some((member) => member.id === fromId)
    ? undefined
    : items.find((item) => item.deck.id === fromId)?.deck;
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
  const addCount = rows.reduce((total, row) => total + Math.max(0, row.to - row.from), 0);
  const cutCount = rows.reduce((total, row) => total + Math.max(0, row.from - row.to), 0);
  const sharedCount = rows.reduce((total, row) => total + Math.min(row.from, row.to), 0);
  const isIdentical = rows.every((row) => row.kind === "same");

  const fromName = deckName(members, fromId);
  const toName = deckName(members, deckId);
  const fromUpdated = members.find((member) => member.id === fromId)?.updatedAt;
  const toUpdated = members.find((member) => member.id === deckId)?.updatedAt;

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
            <PageTopBarButton render={<Link to="/decks/$deckId" params={{ deckId }} />}>
              Open deck
            </PageTopBarButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_PADDING_NO_TOP, "mx-auto flex max-w-5xl flex-col gap-5 pt-3")}>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
          <MemberSelect
            id="deck-changes-from"
            label="From"
            value={fromId}
            members={members}
            onChange={handleFromChange}
          />
          <ArrowRightIcon
            aria-hidden
            className="text-muted-foreground hidden size-4 shrink-0 sm:block sm:pb-2.5"
          />
          <MemberSelect
            id="deck-changes-to"
            label="To"
            value={deckId}
            members={members}
            onChange={handleToChange}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm tabular-nums">
            {sharedCount} cards shared · +{addCount} · −{cutCount}
            {fromUpdated && toUpdated ? (
              <>
                {" · "}
                {formatDay(fromUpdated)} → {formatDay(toUpdated)}
              </>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <Switch id="deck-changes-only" checked={changesOnly} onCheckedChange={setChangesOnly} />
            <Label htmlFor="deck-changes-only" className="font-normal">
              Only what changed
            </Label>
          </div>
        </div>

        {fromId === deckId && (
          <p className="text-muted-foreground text-sm">Pick two different versions to compare.</p>
        )}
        {isIdentical && fromId !== deckId && (
          <p className="text-sm">The two lists match, card for card.</p>
        )}

        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-2 border-b pb-1 font-medium">
            <span className="min-w-0 truncate px-1.5">{fromName}</span>
            <span className="size-3" aria-hidden />
            <span className="min-w-0 truncate px-1.5">{toName}</span>
          </div>
          {zones.map((zone) => {
            const zoneRows = changesOnly
              ? zone.rows.filter((row) => row.kind !== "same")
              : zone.rows;
            if (zoneRows.length === 0) {
              return null;
            }
            return (
              <section key={zone.zone} className="flex min-w-0 flex-col gap-1">
                <div className="text-muted-foreground flex items-baseline gap-2 px-1.5">
                  <span className="text-2xs font-semibold tracking-widest uppercase">
                    {ZONE_LABELS[zone.zone]}
                  </span>
                  <span className="text-2xs tabular-nums">
                    {zone.fromCount} → {zone.toCount}
                  </span>
                </div>
                {zoneRows.map((row) => (
                  <ChangesRow key={`${zone.zone}-${row.cardId}`} row={row} />
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
