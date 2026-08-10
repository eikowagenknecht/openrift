import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, BoxIcon, HandHeartIcon, PackageSearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MoveDialog } from "@/components/collection/move-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCollections } from "@/hooks/use-collections";
import { useMoveCopies } from "@/hooks/use-copies";
import { useDeckBox } from "@/hooks/use-deck-box";
import { useEnumOrders } from "@/hooks/use-enums";
import type { DeckBoxCopy, DeckBoxGroup, DeckBoxPull } from "@/lib/deck-box";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { cn } from "@/lib/utils";

interface DeckBoxTabProps {
  deckId: string;
  cards: DeckBuilderCard[];
  /** The collection the deck is stored in. The tab only renders with one set. */
  homeCollectionId: string;
  homeCollectionName: string;
  /** Opens the missing-cards dialog, which owns buying and wishlists. */
  onViewMissing?: () => void;
}

/**
 * The deck's box: what is in it, what to pull out of which collection to fill
 * it, and what can't be pulled. Moving a copy is the only state there is — the
 * plan reads the live copies feed, so the list updates itself.
 * @returns The Box tab.
 */
export function DeckBoxTab({
  deckId,
  cards,
  homeCollectionId,
  homeCollectionName,
  onViewMissing,
}: DeckBoxTabProps) {
  // Per-slot copy choices, kept for as long as the tab is open. They are a
  // preference for this pull run, not something worth persisting.
  const [overrides, setOverrides] = useState<ReadonlyMap<string, string>>(new Map());
  const [showSettled, setShowSettled] = useState(false);
  // Where each copy came from, remembered while the tab stays open so taking a
  // card back out returns it to its shelf. Once that memory is gone (a reload,
  // another session) the move dialog asks where it should go instead.
  const [originById, setOriginById] = useState<ReadonlyMap<string, string>>(new Map());
  const [movingOut, setMovingOut] = useState<string[] | null>(null);
  const plan = useDeckBox(deckId, cards, homeCollectionId, overrides);
  const moveCopies = useMoveCopies();
  const { data: collections } = useCollections();

  if (!plan) {
    return <p className="text-muted-foreground py-6 text-sm">Loading your copies…</p>;
  }

  const pullTotal = plan.groups.reduce((sum, group) => sum + group.pulls.length, 0);

  /**
   * Moves copies into the box. A batch says so with an undoable toast; a single
   * tick stays quiet, because the row moving to "In the box" is the feedback
   * and unticking it is the undo — twenty toasts for twenty ticks is noise.
   */
  const move = (pulls: readonly DeckBoxPull[], announce = true) => {
    const copyIds = pulls.map((pull) => pull.copy.copyId);
    const origins = new Map([
      ...originById,
      ...pulls.map((pull): [string, string] => [pull.copy.copyId, pull.copy.collectionId]),
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

  const swap = (slotKey: string, copyId: string) => {
    setOverrides(new Map([...overrides, [slotKey, copyId]]));
  };

  const complete = plan.neededTotal > 0 && plan.inBoxTotal === plan.neededTotal;

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
        {pullTotal > 0 && (
          <Button
            size="sm"
            disabled={moveCopies.isPending}
            onClick={() => move(plan.groups.flatMap((group) => group.pulls))}
          >
            Move everything into the box
          </Button>
        )}
      </div>

      {plan.groups.map((group) => (
        <PullGroup
          key={group.collectionId}
          group={group}
          disabled={moveCopies.isPending}
          onMove={() => move(group.pulls)}
          onTick={(pull) => move([pull], false)}
          onSwap={swap}
        />
      ))}

      {plan.blocked.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Can&apos;t take
          </h3>
          {plan.blocked.map((entry) => (
            <div
              key={`${entry.cardId}:${entry.reason}`}
              className="flex items-center gap-2 py-0.5 text-sm"
            >
              {/* Same glyphs the rest of the app uses for these two states:
                  the loan chip's hand, the outgoing-trade arrow. */}
              {entry.reason === "loan" ? (
                <HandHeartIcon className="text-muted-foreground size-3.5 shrink-0" />
              ) : (
                <ArrowUpRightIcon className="text-muted-foreground size-3.5 shrink-0" />
              )}
              <span className="truncate">{entry.cardName}</span>
              <span className="text-muted-foreground tabular-nums">×{entry.count}</span>
              {/* A loan has one page to settle it on. A trade reservation
                  belongs to whichever group's trade pinned it, which the copy
                  doesn't name, so that one only states the reason. */}
              {entry.reason === "loan" ? (
                <Link
                  to="/loans"
                  className="text-muted-foreground ml-auto shrink-0 text-xs underline-offset-2 hover:underline"
                >
                  out on loan
                </Link>
              ) : (
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  reserved for a trade
                </span>
              )}
            </div>
          ))}
        </section>
      )}

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

      {plan.extras.length > 0 && (
        <section className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Not in this deck
            </h3>
            <span className="text-muted-foreground text-xs tabular-nums">{plan.extraCount}</span>
            <Button
              size="xs"
              variant="outline"
              className="ml-auto"
              disabled={moveCopies.isPending}
              onClick={() =>
                setMovingOut(plan.extras.flatMap((entry) => entry.copies.map((c) => c.copyId)))
              }
            >
              Move out
            </Button>
          </div>
          {plan.extras.map((entry) => (
            <div key={entry.cardId} className="flex items-center gap-2 py-0.5 text-sm">
              <span className="text-muted-foreground tabular-nums">{entry.copies.length}×</span>
              <span className="min-w-0 flex-1 truncate">{entry.cardName}</span>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 text-xs"
                disabled={moveCopies.isPending}
                onClick={() => setMovingOut(entry.copies.map((copy) => copy.copyId))}
              >
                Move out
              </Button>
            </div>
          ))}
        </section>
      )}

      {plan.settled.length > 0 && (
        <section className="flex flex-col gap-1">
          <ExpandToggle expanded={showSettled} onClick={() => setShowSettled(!showSettled)}>
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              In the box ({plan.inBoxTotal})
            </span>
          </ExpandToggle>
          {showSettled &&
            plan.settled.flatMap((entry) =>
              entry.copies.map((copy) => (
                <div
                  key={copy.copyId}
                  className="hover:bg-muted/40 flex items-center gap-2 rounded-md px-1 py-1 text-sm"
                >
                  <Checkbox
                    checked
                    disabled={moveCopies.isPending}
                    aria-label={`Take ${entry.cardName} back out of the box`}
                    onCheckedChange={() => takeOut(copy.copyId)}
                  />
                  <span className="text-muted-foreground w-24 shrink-0 font-mono text-xs">
                    {copy.shortCode}
                  </span>
                  <span className="text-muted-foreground min-w-0 flex-1 truncate">
                    {entry.cardName}
                  </span>
                  <CopyDetails copy={copy} />
                </div>
              )),
            )}
        </section>
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
 * One collection's worth of pulls, in the order the cards sit in it.
 * @returns The group section.
 */
function PullGroup({
  group,
  disabled,
  onMove,
  onTick,
  onSwap,
}: {
  group: DeckBoxGroup;
  disabled: boolean;
  onMove: () => void;
  onTick: (pull: DeckBoxPull) => void;
  onSwap: (slotKey: string, copyId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          <Link
            to="/collections/$collectionId"
            params={{ collectionId: group.collectionId }}
            className="underline-offset-2 hover:underline"
          >
            {group.collectionName}
          </Link>
        </h3>
        <span className="text-muted-foreground text-xs tabular-nums">{group.pulls.length}</span>
        <Button
          size="xs"
          variant="outline"
          className="ml-auto"
          disabled={disabled}
          onClick={onMove}
        >
          Move these {group.pulls.length}
        </Button>
      </div>
      {group.pulls.map((pull) => (
        <PullRow
          key={pull.slotKey}
          pull={pull}
          disabled={disabled}
          onTick={() => onTick(pull)}
          onSwap={onSwap}
        />
      ))}
    </section>
  );
}

/**
 * One copy to pull: what to look for, a tick that puts it in the box as you
 * physically pull it, and a way to take a different copy of the same card
 * instead. The tick is the move — there is no separate "done" state to keep in
 * sync, so the list survives a reload mid-sort.
 * @returns The row.
 */
function PullRow({
  pull,
  disabled,
  onTick,
  onSwap,
}: {
  pull: DeckBoxPull;
  disabled: boolean;
  onTick: () => void;
  onSwap: (slotKey: string, copyId: string) => void;
}) {
  return (
    <div className="hover:bg-muted/40 flex items-center gap-2 rounded-md px-1 py-1 text-sm">
      <Checkbox
        checked={false}
        disabled={disabled}
        aria-label={`Put ${pull.cardName} in the box`}
        onCheckedChange={onTick}
      />
      <span className="text-muted-foreground w-24 shrink-0 font-mono text-xs">
        {pull.copy.shortCode}
      </span>
      <span className="min-w-0 flex-1 truncate">{pull.cardName}</span>
      <CopyDetails copy={pull.copy} />
      {pull.alternatives.length > 0 && (
        <Popover>
          <PopoverTrigger
            render={
              // Counting them rather than saying "Swap" tells you whether the
              // row has a real choice behind it before you open anything.
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 text-xs"
                aria-label={`Take a different copy of ${pull.cardName}`}
              >
                {pull.alternatives.length} {pull.alternatives.length === 1 ? "other" : "others"}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-64 p-1">
            <p className="text-muted-foreground px-2 py-1 text-xs">Take this copy instead</p>
            {pull.alternatives.map((copy) => (
              <Button
                key={copy.copyId}
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 font-normal"
                onClick={() => onSwap(pull.slotKey, copy.copyId)}
              >
                <span className="text-muted-foreground font-mono text-xs">{copy.shortCode}</span>
                <CopyDetails copy={copy} />
                <span className="text-muted-foreground ml-auto truncate text-xs">
                  {copy.collectionName}
                </span>
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/**
 * The marks that tell two copies of the same card apart: language, finish, and
 * whether it is graded or in a recorded condition.
 * @returns The detail chips, or null for a plain copy.
 */
function CopyDetails({ copy }: { copy: DeckBoxCopy }) {
  const { labels } = useEnumOrders();
  const parts: string[] = [copy.language];
  if (copy.finish !== "normal") {
    parts.push(labels.finishes[copy.finish]);
  }
  if (copy.grade !== null) {
    parts.push(`graded ${copy.grade}`);
  } else if (copy.condition !== null) {
    parts.push(labels.conditions[copy.condition]);
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
          ? "The copy this row would take"
          : "This copy is graded — swap it for a plain one if you'd rather keep it in the binder"}
      </TooltipContent>
    </Tooltip>
  );
}
