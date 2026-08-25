import type { DeckZone, VariantLabelEnumLabels, VariantLabelPrinting } from "@openrift/shared";
import {
  WellKnown,
  formatPrintingVariantLabelParts,
  getOrientation,
  legendDisplayName,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, BoxIcon, HandHeartIcon, PackageSearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardMiniRow } from "@/components/cards/card-mini-row";
import { MoveDialog } from "@/components/collection/move-dialog";
import { DECK_LIST_SECTION_CLASS } from "@/components/deck/deck-overview-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PickerGroup, PickerList, PickerRow } from "@/components/ui/picker-list";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCollections } from "@/hooks/use-collections";
import { useMoveCopies } from "@/hooks/use-copies";
import { useDeckBox } from "@/hooks/use-deck-box";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import type { CardOpenTarget, HoverHandler } from "@/lib/card-row-interactions";
import { cardHoverProps, rowActivateProps, rowControlClick } from "@/lib/card-row-interactions";
import type { DeckBoxCard, DeckBoxCopy, DeckBoxSlot } from "@/lib/deck-box";
import { toBoxCardFromDeck } from "@/lib/deck-box";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import type { DeckCardGroup, DeckOverviewGroup } from "@/lib/deck-card-group";
import { GROUPED_ZONES } from "@/lib/deck-card-sort";
import { ZONE_LABELS } from "@/lib/deck-zone-labels";
import { getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Zone render order, minus Overflow: cards parked there don't travel with the
 * deck, so the box never asks for them.
 */
const BOX_ZONE_ORDER: readonly DeckZone[] = [
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
];

/**
 * The lookup tables every box row renders with. Resolved once for the tab and
 * threaded down: both hooks behind them rebuild their maps on every call, so a
 * row reading them itself would hand each row a fresh object.
 */
interface BoxRowLabels extends VariantLabelEnumLabels {
  rarities: Record<string, string>;
  conditions: Record<string, string>;
  domainColors: Record<string, string>;
}

interface DeckBoxTabProps {
  deckId: string;
  cards: DeckBuilderCard[];
  /** The collection the deck is stored in. The tab only renders with one set. */
  homeCollectionId: string;
  homeCollectionName: string;
  /** Opens the missing-cards dialog, which owns buying and wishlists. */
  onViewMissing?: () => void;
  /**
   * The overview's own ordering and sub-grouping, passed in rather than read
   * here so the box lists a zone exactly the way the deck list does — same
   * sort, same axis, same direction, from the same toolbar.
   */
  sortCards: (zoneCards: DeckBuilderCard[]) => DeckBuilderCard[];
  groupCards: (zoneCards: DeckBuilderCard[]) => DeckCardGroup[];
  /** The active grouping axis — type groups keep their icons. */
  groupBy: DeckOverviewGroup;
  /**
   * Opens the card's detail, as every other card list on the page does. Both
   * this and `onHoverCard` are told the row's own copy, so the detail and the
   * floating preview show the printing about to be pulled rather than the
   * deck's preferred one.
   */
  onCardClick?: (card: CardOpenTarget) => void;
  onHoverCard?: HoverHandler;
}

/**
 * The deck's box, as one list in the deck's own order: every copy the deck
 * calls for is a row you tick off as it goes in, whether it is in the box
 * already, waiting on a shelf, out on loan, or not owned at all. Copies in the
 * box that no deck there calls for trail the list, offering to move out.
 *
 * Moving a copy is the only state there is — the plan reads the live copies
 * feed, so the list updates itself.
 * @returns The Box tab.
 */
export function DeckBoxTab({
  deckId,
  cards,
  homeCollectionId,
  homeCollectionName,
  onViewMissing,
  sortCards,
  groupCards,
  groupBy,
  onCardClick,
  onHoverCard,
}: DeckBoxTabProps) {
  // Copies picked by hand, kept for as long as the tab is open. They are a
  // preference for this pull run, not something worth persisting.
  const [pinnedCopyIds, setPinnedCopyIds] = useState<ReadonlySet<string>>(new Set());
  // Where each copy came from, remembered while the tab stays open so taking a
  // card back out returns it to its shelf. Once that memory is gone (a reload,
  // another session) the move dialog asks where it should go instead.
  const [originById, setOriginById] = useState<ReadonlyMap<string, string>>(new Map());
  const [movingOut, setMovingOut] = useState<string[] | null>(null);
  const plan = useDeckBox(deckId, cards, homeCollectionId, pinnedCopyIds);
  const moveCopies = useMoveCopies();
  const { data: collections } = useCollections();
  const { labels: enumLabels } = useEnumOrders();
  const domainColors = useDomainColors();
  const labels: BoxRowLabels = {
    rarities: enumLabels.rarities,
    finishes: enumLabels.finishes,
    artVariants: enumLabels.artVariants,
    cardSizes: enumLabels.cardSizes,
    conditions: enumLabels.conditions,
    domainColors,
  };

  if (!plan) {
    return <p className="text-muted-foreground py-6 text-sm">Loading your copies…</p>;
  }

  const slotsByCardKey = Map.groupBy(plan.slots, (slot) => slot.cardKey);
  const pullable = plan.slots.filter((slot) => slot.state === "available");

  /**
   * Moves copies into the box. A batch says so with an undoable toast; a single
   * tick stays quiet, because the row's tick going green is the feedback and
   * unticking it is the undo — twenty toasts for twenty ticks is noise.
   */
  const move = (slots: readonly DeckBoxSlot[], announce = true) => {
    const moved = slots.flatMap((slot) => (slot.copy ? [slot.copy] : []));
    const copyIds = moved.map((copy) => copy.copyId);
    const origins = new Map([
      ...originById,
      ...moved.map((copy): [string, string] => [copy.copyId, copy.collectionId]),
    ]);
    setOriginById(origins);
    moveCopies.mutate(
      { copyIds, toCollectionId: homeCollectionId },
      {
        onSuccess: () => {
          if (!announce) {
            return;
          }
          toast.success(
            `Moved ${copyIds.length} ${copyIds.length === 1 ? "card" : "cards"} into ${homeCollectionName}`,
            {
              action: {
                label: "Undo",
                onClick: () => {
                  // Every copy goes back where it was, not all of them into
                  // whichever collection happened to be moved from last.
                  const byOrigin = Map.groupBy(copyIds, (copyId) => origins.get(copyId) ?? "");
                  for (const [collectionId, ids] of byOrigin) {
                    if (collectionId !== "") {
                      moveCopies.mutate({ copyIds: ids, toCollectionId: collectionId });
                    }
                  }
                },
              },
            },
          );
        },
      },
    );
  };

  /** Takes one copy back out of the box, to where it came from if that's known. */
  const takeOut = (copyId: string) => {
    const origin = originById.get(copyId);
    if (origin === undefined) {
      setMovingOut([copyId]);
      return;
    }
    moveCopies.mutate({ copyIds: [copyId], toCollectionId: origin });
  };

  const swap = (fromCopyId: string, toCopyId: string) => {
    const next = new Set(pinnedCopyIds);
    next.delete(fromCopyId);
    next.add(toCopyId);
    setPinnedCopyIds(next);
  };

  const complete = plan.neededTotal > 0 && plan.inBoxTotal === plan.neededTotal;

  const rowsFor = (card: DeckBuilderCard) => {
    const boxCard = toBoxCardFromDeck(card);
    const siblings = plan.siblingPrintingsByCardId.get(card.cardId) ?? [];
    return (slotsByCardKey.get(getDeckCardKey(card)) ?? []).map((slot) => (
      <SlotRow
        key={slot.key}
        card={boxCard}
        slot={slot}
        labels={labels}
        siblings={siblings}
        disabled={moveCopies.isPending}
        onTick={() => move([slot], false)}
        onTakeOut={() => slot.copy && takeOut(slot.copy.copyId)}
        onSwap={swap}
        onHoverCard={onHoverCard}
        onOpen={
          onCardClick
            ? () =>
                onCardClick({
                  cardId: card.cardId,
                  preferredPrintingId: slot.copy?.printingId ?? card.preferredPrintingId,
                  zone: card.zone,
                })
            : undefined
        }
      />
    ));
  };

  const zones = BOX_ZONE_ORDER.map((zone) => ({
    zone,
    cards: cards.filter((card) => card.zone === zone),
  })).filter((entry) => entry.cards.length > 0);

  return (
    // The overview column already spaces and pads its children, so this only
    // sets the rhythm between the box's own sections.
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BoxIcon className="text-muted-foreground size-4" />
          <span className="font-medium">
            <span className="tabular-nums">
              {plan.inBoxTotal} / {plan.neededTotal}
            </span>{" "}
            in{" "}
            <Link
              to="/collections/$collectionId"
              params={{ collectionId: homeCollectionId }}
              className="underline-offset-2 hover:underline"
            >
              {homeCollectionName}
            </Link>
          </span>
          {complete && (
            <Badge variant="muted" className="text-green-600 dark:text-green-500">
              Ready to play
            </Badge>
          )}
        </div>
        {pullable.length > 0 && (
          <Button size="sm" disabled={moveCopies.isPending} onClick={() => move(pullable)}>
            Move everything into the box
          </Button>
        )}
      </div>

      {/* Same flow as the deck list: zones as unbreakable blocks across as many
          ~30rem columns as fit, so both views fold the same way. */}
      <div className="w-full columns-[30rem] gap-x-10">
        {zones.map(({ zone, cards: zoneCards }) => (
          <ZoneSection
            key={zone}
            zone={zone}
            slotsByCardKey={slotsByCardKey}
            cards={zoneCards}
            sortCards={sortCards}
            groupCards={groupCards}
            groupBy={groupBy}
            rowsFor={rowsFor}
          />
        ))}

        {plan.extras.length > 0 && (
          <section className={DECK_LIST_SECTION_CLASS}>
            <div className="flex h-6 items-center gap-2 border-b">
              <span className="text-muted-foreground text-2xs font-semibold tracking-widest uppercase">
                Not in this deck
              </span>
              <Button
                size="xs"
                variant="ghost"
                className="ml-auto text-xs"
                disabled={moveCopies.isPending}
                onClick={() =>
                  setMovingOut(plan.extras.flatMap((entry) => entry.copies.map((c) => c.copyId)))
                }
              >
                Move out {plan.extraCount}
              </Button>
            </div>
            <div className="flex flex-col gap-0.5">
              {plan.extras.flatMap((entry) =>
                entry.copies.map((copy) => (
                  <BoxRow
                    key={copy.copyId}
                    card={entry.card}
                    copy={copy}
                    labels={labels}
                    siblings={plan.siblingPrintingsByCardId.get(entry.card.cardId) ?? []}
                    onHoverCard={onHoverCard}
                    // No zone: these copies aren't deck entries, so the detail
                    // opens on the card without anchoring in the deck's list.
                    onOpen={
                      onCardClick
                        ? () =>
                            onCardClick({
                              cardId: entry.card.cardId,
                              preferredPrintingId: copy.printingId,
                            })
                        : undefined
                    }
                    leading={<span className="size-4 shrink-0" />}
                    trailing={
                      <Button
                        variant="ghost"
                        size="xs"
                        className="shrink-0 text-xs"
                        disabled={moveCopies.isPending}
                        onClick={() => setMovingOut([copy.copyId])}
                      >
                        Move out
                      </Button>
                    }
                  />
                )),
              )}
            </div>
          </section>
        )}
      </div>

      {plan.missingCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={onViewMissing}
          disabled={!onViewMissing}
        >
          <PackageSearchIcon className="size-3.5" />
          You don&apos;t own {plan.missingCount} {plan.missingCount === 1 ? "card" : "cards"}
        </Button>
      )}

      <MoveDialog
        open={movingOut !== null}
        onOpenChange={(open) => setMovingOut(open ? movingOut : null)}
        // Moving into the box is what the rest of the tab does; this dialog is
        // only ever about getting copies out of it.
        collections={collections.filter((collection) => collection.id !== homeCollectionId)}
        count={movingOut?.length ?? 0}
        onMove={(toCollectionId) => {
          if (movingOut) {
            moveCopies.mutate({ copyIds: movingOut, toCollectionId });
          }
          setMovingOut(null);
        }}
        isPending={moveCopies.isPending}
      />
    </div>
  );
}

/**
 * One zone's block, headed like the deck list's: small-caps label over a
 * hairline rule, with how much of the zone is in the box in place of the
 * list's card count. Grouped zones keep their sub-groups.
 * @returns The zone section.
 */
function ZoneSection({
  zone,
  cards,
  slotsByCardKey,
  sortCards,
  groupCards,
  groupBy,
  rowsFor,
}: {
  zone: DeckZone;
  cards: DeckBuilderCard[];
  slotsByCardKey: ReadonlyMap<string, DeckBoxSlot[]>;
  sortCards: (zoneCards: DeckBuilderCard[]) => DeckBuilderCard[];
  groupCards: (zoneCards: DeckBuilderCard[]) => DeckCardGroup[];
  groupBy: DeckOverviewGroup;
  rowsFor: (card: DeckBuilderCard) => React.ReactNode;
}) {
  const zoneSlots = cards.flatMap((card) => slotsByCardKey.get(getDeckCardKey(card)) ?? []);
  const inBox = zoneSlots.filter((slot) => slot.state === "in-box").length;
  const groups = GROUPED_ZONES.has(zone) ? groupCards(cards) : null;

  return (
    <section className={DECK_LIST_SECTION_CLASS}>
      <div className="flex h-6 items-center gap-2 border-b">
        <span className="text-muted-foreground text-2xs font-semibold tracking-widest uppercase">
          {ZONE_LABELS[zone]}
        </span>
        <span
          className={cn(
            "ml-auto text-xs tabular-nums",
            inBox === zoneSlots.length
              ? "text-green-600 dark:text-green-500"
              : "text-muted-foreground",
          )}
        >
          {inBox}/{zoneSlots.length}
        </span>
      </div>

      {groups ? (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-0.5">
              {group.label !== null && (
                <div className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs">
                  {groupBy === "type" && (
                    <img
                      src={getTypeIconPath(group.key, [])}
                      alt=""
                      className="size-3.5 brightness-0 dark:invert"
                    />
                  )}
                  <span className="whitespace-nowrap">{group.label}</span>
                </div>
              )}
              {sortCards(group.cards).map((card) => rowsFor(card))}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">{sortCards(cards).map((card) => rowsFor(card))}</div>
      )}
    </section>
  );
}

/**
 * One copy the deck calls for. What the row offers follows where that copy is:
 * a tick to move it in or back out, a source to pick it from, or the reason it
 * can't come at all.
 * @returns The slot row.
 */
function SlotRow({
  card,
  slot,
  labels,
  siblings,
  disabled,
  onTick,
  onTakeOut,
  onSwap,
  onHoverCard,
  onOpen,
}: {
  card: DeckBoxCard;
  slot: DeckBoxSlot;
  labels: BoxRowLabels;
  siblings: readonly VariantLabelPrinting[];
  disabled: boolean;
  onTick: () => void;
  onTakeOut: () => void;
  onSwap: (fromCopyId: string, toCopyId: string) => void;
  onHoverCard?: HoverHandler;
  onOpen?: () => void;
}) {
  if (slot.state === "in-box") {
    return (
      <BoxRow
        card={card}
        copy={slot.copy}
        labels={labels}
        siblings={siblings}
        onHoverCard={onHoverCard}
        onOpen={onOpen}
        leading={
          <Checkbox
            checked
            disabled={disabled}
            aria-label={`Take ${card.name} back out of the box`}
            onClick={rowControlClick()}
            onCheckedChange={onTakeOut}
          />
        }
      />
    );
  }

  if (slot.state === "available") {
    return (
      <BoxRow
        card={card}
        copy={slot.copy}
        labels={labels}
        siblings={siblings}
        onHoverCard={onHoverCard}
        onOpen={onOpen}
        leading={
          <Checkbox
            checked={false}
            disabled={disabled}
            aria-label={`Put ${card.name} in the box`}
            onClick={rowControlClick()}
            onCheckedChange={onTick}
          />
        }
        trailing={
          <SourcePicker
            card={card}
            slot={slot}
            labels={labels}
            siblings={siblings}
            onSwap={(copyId) => slot.copy && onSwap(slot.copy.copyId, copyId)}
          />
        }
      />
    );
  }

  if (slot.state === "blocked") {
    return (
      <BoxRow
        card={card}
        copy={slot.copy}
        labels={labels}
        siblings={siblings}
        onHoverCard={onHoverCard}
        onOpen={onOpen}
        muted
        leading={
          // Same glyphs the rest of the app uses for these two states: the loan
          // chip's hand, the outgoing-trade arrow.
          <span className="flex size-4 shrink-0 items-center justify-center">
            {slot.reason === "loan" ? (
              <HandHeartIcon className="text-muted-foreground size-3.5" />
            ) : (
              <ArrowUpRightIcon className="text-muted-foreground size-3.5" />
            )}
          </span>
        }
        trailing={
          // A loan has one page to settle it on. A trade reservation belongs to
          // whichever group's trade pinned it, which the copy doesn't name, so
          // that one only states the reason.
          slot.reason === "loan" ? (
            <Link
              to="/loans"
              className="text-muted-foreground shrink-0 text-xs underline-offset-2 hover:underline"
              onClick={rowControlClick()}
            >
              out on loan
            </Link>
          ) : (
            <span className="text-muted-foreground shrink-0 text-xs">reserved for a trade</span>
          )
        }
      />
    );
  }

  return (
    <BoxRow
      card={card}
      labels={labels}
      siblings={siblings}
      onHoverCard={onHoverCard}
      onOpen={onOpen}
      muted
      leading={<span className="size-4 shrink-0" />}
      trailing={<span className="text-muted-foreground shrink-0 text-xs">not owned</span>}
    />
  );
}

/**
 * The art, domain bar and rarity/code column that lead a box row, wired once so
 * the list and the copy picker read alike. The code stays on phones, unlike the
 * deck list's: finding this exact printing in a binder is what a box row is for.
 * @returns The row-lead cluster.
 */
function BoxCardThumb({
  card,
  copy,
  labels,
}: {
  card: DeckBoxCard;
  copy?: DeckBoxCopy;
  labels: BoxRowLabels;
}) {
  return (
    <CardMiniRow
      className="self-stretch"
      imageId={copy?.imageId}
      landscape={getOrientation(card.types) === "landscape"}
      domains={card.domains}
      domainColors={labels.domainColors}
      rarity={copy?.rarity}
      rarityLabels={labels.rarities}
      shortCode={copy?.shortCode}
      loading="lazy"
    />
  );
}

/**
 * Where the copy this row would take comes from, and a way to take a different
 * one. The collection is the label, so a pull run reads as a list of shelves to
 * visit. The count next to it is how many *different* copies are behind it, not
 * how many copies there are: a shelf of forty identical runes is one choice.
 * @returns The source control.
 */
function SourcePicker({
  card,
  slot,
  labels,
  siblings,
  onSwap,
}: {
  card: DeckBoxCard;
  slot: DeckBoxSlot;
  labels: BoxRowLabels;
  siblings: readonly VariantLabelPrinting[];
  onSwap: (copyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState("");
  const source = slot.copy?.collectionName ?? "";
  // Shelves in the order their best copy ranks, so the list still reads as the
  // order a pull run would visit them in.
  const byCollection = Map.groupBy(
    slot.alternatives,
    (alternative) => alternative.copy.collectionName,
  );
  if (slot.alternatives.length === 0) {
    return (
      <span className="text-muted-foreground max-w-1/2 min-w-0 shrink truncate text-xs">
        {source}
      </span>
    );
  }

  const pick = (copyId: string) => {
    setOpen(false);
    onSwap(copyId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className="max-w-1/2 min-w-0 shrink text-xs"
            aria-label={`Take a different copy of ${card.name}`}
            onClick={rowControlClick()}
          >
            <span className="min-w-0 truncate">{source}</span>
            <span className="text-muted-foreground">+{slot.alternatives.length}</span>
          </Button>
        }
      />
      {/* p-0 because PickerList's own CommandList supplies the list inset. */}
      <PopoverContent align="end" className="w-80 p-0" onClick={rowControlClick()}>
        <PickerList
          highlightedId={highlightedId}
          onHighlightChange={setHighlightedId}
          // Plain sentence case, not the small-caps the group labels use: two
          // small-caps lines stacked read as two shelf names, not a title.
          header={
            <p className="text-muted-foreground px-2.5 pt-2 text-xs">Take this copy instead</p>
          }
        >
          {[...byCollection].map(([collectionName, alternatives]) => (
            <PickerGroup key={collectionName} label={collectionName}>
              {alternatives.map((alternative) => (
                <PickerRow
                  key={alternative.key}
                  value={alternative.key}
                  onSelect={() => pick(alternative.copy.copyId)}
                >
                  <BoxCardThumb card={card} copy={alternative.copy} labels={labels} />
                  <CopyDetails copy={alternative.copy} labels={labels} siblings={siblings} />
                  {alternative.count > 1 && (
                    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                      ×{alternative.count}
                    </span>
                  )}
                </PickerRow>
              ))}
            </PickerGroup>
          ))}
        </PickerList>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One row of the box: art, domain pip, printing code, name, then the marks that
 * tell two copies of the same card apart. No costs, count or price — a row is
 * one physical copy, and the space goes to naming that copy instead.
 * @returns The row.
 */
function BoxRow({
  card,
  copy,
  labels,
  siblings,
  muted,
  leading,
  trailing,
  onHoverCard,
  onOpen,
}: {
  card: DeckBoxCard;
  /** The copy the row stands for. A slot nobody owns has none. */
  copy?: DeckBoxCopy;
  labels: BoxRowLabels;
  siblings: readonly VariantLabelPrinting[];
  /** Grey the card out: the row is a gap rather than something to pack. */
  muted?: boolean;
  /** Control at the row's head — the tick that moves a copy in or out. */
  leading: React.ReactNode;
  /** Trailing action or note: where to take it from, or why it can't come. */
  trailing?: React.ReactNode;
  onHoverCard?: HoverHandler;
  /** Opens the card's detail. Controls inside the row guard their own clicks. */
  onOpen?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded px-2 py-1 text-sm sm:gap-2",
        onOpen ? "hover:bg-muted/50 cursor-pointer" : "hover:bg-muted/40",
      )}
      {...cardHoverProps(onHoverCard, card.cardId, copy?.printingId)}
      {...rowActivateProps(onOpen)}
    >
      {leading}
      <BoxCardThumb card={card} copy={copy} labels={labels} />
      <span className={cn("min-w-0 flex-1 truncate", muted && "text-muted-foreground")}>
        {legendDisplayName({ name: card.name, types: card.types, tags: card.tags })}
      </span>
      {copy && <CopyDetails copy={copy} labels={labels} siblings={siblings} />}
      {trailing}
    </div>
  );
}

/**
 * The marks that tell two copies of the same card apart: the printing's
 * distinguishing attributes under the app-wide variant-label rule, then whether
 * the copy is graded or in a recorded condition. Rendered as the row's own plain
 * run rather than through `PrintingVariantLabel`, whose language chip and
 * "Standard" fallback both work against a dense list.
 * @returns The detail run, or null when the copy has no mark worth naming.
 */
function CopyDetails({
  copy,
  labels,
  siblings,
}: {
  copy: DeckBoxCopy;
  labels: BoxRowLabels;
  /** The printings this card's copies span here, for the variant label rule. */
  siblings: readonly VariantLabelPrinting[];
}) {
  const { language, rest } = formatPrintingVariantLabelParts(copy, siblings, labels);
  const parts: string[] = language === null ? [...rest] : [language, ...rest];
  if (copy.grade !== null) {
    parts.push(`graded ${copy.grade}`);
  } else if (copy.condition !== null) {
    parts.push(labels.conditions[copy.condition]);
  }
  if (parts.length === 0) {
    return null;
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "text-muted-foreground shrink-0 text-xs",
              copy.grade !== null && "text-amber-600 dark:text-amber-500",
            )}
          />
        }
      >
        {parts.join(" · ")}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {copy.grade === null
          ? "The copy this row stands for"
          : "This copy is graded — swap it for a plain one if you'd rather keep it in the binder"}
      </TooltipContent>
    </Tooltip>
  );
}
