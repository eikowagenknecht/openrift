import type { DeckZone, VariantLabelEnumLabels, VariantLabelPrinting } from "@openrift/shared";
import {
  formatPrintingVariantLabelParts,
  getOrientation,
  legendDisplayName,
  WellKnown,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, BoxIcon, HandHeartIcon, PackageSearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardMiniRow } from "@/components/cards/card-mini-row";
import { DECK_LIST_SECTION_CLASS } from "@/components/deck/deck-overview-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PickerGroup, PickerList, PickerRow } from "@/components/ui/picker-list";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SectionHeading } from "@/components/ui/section-heading";
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

// Excludes Overflow: cards parked there don't travel with the deck.
const BOX_ZONE_ORDER: readonly DeckZone[] = [
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
];

const SURPLUS_TICK_CLASS =
  "data-checked:border-destructive data-checked:bg-destructive data-checked:text-white dark:data-checked:bg-destructive";

// Resolved once for the tab: the hooks behind these rebuild their maps on
// every call, so a row reading them itself would get a fresh object each time.
interface BoxRowLabels extends VariantLabelEnumLabels {
  rarities: Record<string, string>;
  conditions: Record<string, string>;
  domainColors: Record<string, string>;
}

interface DeckBoxTabProps {
  deckId: string;
  cards: DeckBuilderCard[];
  homeCollectionId: string;
  homeCollectionName: string;
  onViewMissing?: () => void;
  sortCards: (zoneCards: DeckBuilderCard[]) => DeckBuilderCard[];
  groupCards: (zoneCards: DeckBuilderCard[]) => DeckCardGroup[];
  groupBy: DeckOverviewGroup;
  onCardClick?: (card: CardOpenTarget) => void;
  onHoverCard?: HoverHandler;
}

// Copies in the box that no deck calls for trail the list, already ticked, in red.
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
  // Preference for this pull run only; not persisted.
  const [pinnedCopyIds, setPinnedCopyIds] = useState<ReadonlySet<string>>(new Set());
  // Remembered only for this tab session; lost on reload the move dialog asks instead.
  const [originById, setOriginById] = useState<ReadonlyMap<string, string>>(new Map());
  const plan = useDeckBox(deckId, cards, homeCollectionId, pinnedCopyIds);
  const moveCopies = useMoveCopies();
  const { data: collections } = useCollections();
  const inboxId = collections.find((collection) => collection.isInbox)?.id;
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

  // No toast: the tick going green is the feedback, unticking it is the undo.
  const putIn = (copy: DeckBoxCopy) => {
    setOriginById(new Map([...originById, [copy.copyId, copy.collectionId]]));
    moveCopies.mutate({ copyIds: [copy.copyId], toCollectionId: homeCollectionId });
  };

  // Clearing a surplus row announces where the card went, with undo; unticking
  // a settled row stays quiet since the tick clearing is itself the feedback.
  const takeOut = (copyIds: readonly string[], announce = true) => {
    if (inboxId === undefined) {
      return;
    }
    const byTarget = [...Map.groupBy(copyIds, (copyId) => originById.get(copyId) ?? inboxId)];
    for (const [toCollectionId, ids] of byTarget) {
      moveCopies.mutate({ copyIds: ids, toCollectionId });
    }
    if (!announce) {
      return;
    }
    const single = byTarget.length === 1 ? byTarget[0]?.[0] : undefined;
    const target = collections.find((collection) => collection.id === single);
    const noun = copyIds.length === 1 ? "card" : "cards";
    toast.success(
      target
        ? `Moved ${copyIds.length} ${noun} into ${target.name}`
        : `Moved ${copyIds.length} ${noun} out of the box`,
      {
        action: {
          label: "Undo",
          onClick: () => {
            moveCopies.mutate({ copyIds: [...copyIds], toCollectionId: homeCollectionId });
          },
        },
      },
    );
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
        onTick={() => slot.copy && putIn(slot.copy)}
        onTakeOut={() => slot.copy && takeOut([slot.copy.copyId], false)}
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
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground max-w-prose">
        Tick cards off as you put them in the box. Each tick moves that copy into this deck&apos;s
        collection. A red tick marks a card the deck doesn&apos;t want, and clearing it sends that
        copy to your inbox.
      </p>
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
          <Badge variant="muted" className="text-success">
            Ready to play
          </Badge>
        )}
      </div>

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
              <SectionHeading as="span" size="sm">
                Not in this deck
              </SectionHeading>
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {plan.extraCount}
              </span>
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
                    // No zone: these copies aren't deck entries.
                    onOpen={
                      onCardClick
                        ? () =>
                            onCardClick({
                              cardId: entry.card.cardId,
                              preferredPrintingId: copy.printingId,
                            })
                        : undefined
                    }
                    leading={
                      <Checkbox
                        checked
                        className={SURPLUS_TICK_CLASS}
                        disabled={moveCopies.isPending}
                        aria-label={`Move ${legendDisplayName(entry.card)} out of the box`}
                        onClick={rowControlClick()}
                        onCheckedChange={() => takeOut([copy.copyId])}
                      />
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
    </div>
  );
}

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
        <SectionHeading as="span" size="sm">
          {ZONE_LABELS[zone]}
        </SectionHeading>
        <span
          className={cn(
            "ml-auto text-xs tabular-nums",
            inBox === zoneSlots.length ? "text-success" : "text-muted-foreground",
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
            aria-label={`Take ${legendDisplayName(card)} back out of the box`}
            onClick={rowControlClick()}
            onCheckedChange={onTakeOut}
          />
        }
        trailing={
          <SourcePicker
            card={card}
            slot={slot}
            labels={labels}
            siblings={siblings}
            mode="keep"
            onSwap={(copyId) => slot.copy && onSwap(slot.copy.copyId, copyId)}
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
            aria-label={`Put ${legendDisplayName(card)} in the box`}
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
          <span className="flex size-4 shrink-0 items-center justify-center">
            {slot.reason === "loan" ? (
              <HandHeartIcon className="text-muted-foreground size-3.5" />
            ) : (
              <ArrowUpRightIcon className="text-muted-foreground size-3.5" />
            )}
          </span>
        }
        trailing={
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

// Code stays visible on phones (unlike the deck list's): the row's job is
// finding this exact printing in a binder.
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

// The count shown is how many *different* copies are behind the source, not
// how many copies exist: a shelf of forty identical runes is one choice.
function SourcePicker({
  card,
  slot,
  labels,
  siblings,
  mode = "take",
  onSwap,
}: {
  card: DeckBoxCard;
  slot: DeckBoxSlot;
  labels: BoxRowLabels;
  siblings: readonly VariantLabelPrinting[];
  mode?: "take" | "keep";
  onSwap: (copyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState("");
  const source = slot.copy?.collectionName ?? "";
  const wording =
    mode === "keep"
      ? {
          trigger: "Swap",
          action: `Keep a different copy of ${legendDisplayName(card)}`,
          prompt: "Keep this copy instead",
        }
      : {
          trigger: source,
          action: `Take a different copy of ${legendDisplayName(card)}`,
          prompt: "Take this copy instead",
        };
  const byCollection = Map.groupBy(
    slot.alternatives,
    (alternative) => alternative.copy.collectionName,
  );
  if (slot.alternatives.length === 0) {
    return mode === "keep" ? null : (
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
            aria-label={wording.action}
            onClick={rowControlClick()}
          >
            <span className="min-w-0 truncate">{wording.trigger}</span>
            <span className="text-muted-foreground">+{slot.alternatives.length}</span>
          </Button>
        }
      />
      {/* p-0: PickerList's own CommandList supplies the list inset. */}
      <PopoverContent align="end" className="w-80 p-0" onClick={rowControlClick()}>
        <PickerList
          highlightedId={highlightedId}
          onHighlightChange={setHighlightedId}
          header={<p className="text-muted-foreground px-2.5 pt-2 text-xs">{wording.prompt}</p>}
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
  copy?: DeckBoxCopy;
  labels: BoxRowLabels;
  siblings: readonly VariantLabelPrinting[];
  muted?: boolean;
  leading: React.ReactNode;
  trailing?: React.ReactNode;
  onHoverCard?: HoverHandler;
  onOpen?: () => void;
}) {
  return (
    <div
      className={cn(
        "hover:bg-muted/50 flex items-center gap-1.5 rounded-md px-2 py-1 text-sm sm:gap-2",
        onOpen !== undefined && "cursor-pointer",
      )}
      {...cardHoverProps(onHoverCard, card.cardId, copy?.printingId)}
      {...rowActivateProps(onOpen)}
    >
      {leading}
      <BoxCardThumb card={card} copy={copy} labels={labels} />
      <span className={cn("min-w-0 flex-1 truncate", muted && "text-muted-foreground")}>
        {legendDisplayName(card)}
      </span>
      {copy && <CopyDetails copy={copy} labels={labels} siblings={siblings} />}
      {trailing}
    </div>
  );
}

function CopyDetails({
  copy,
  labels,
  siblings,
}: {
  copy: DeckBoxCopy;
  labels: BoxRowLabels;
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
              copy.grade !== null && "text-warning",
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
