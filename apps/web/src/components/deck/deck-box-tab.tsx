import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, BoxIcon, HandHeartIcon, PackageSearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMoveCopies } from "@/hooks/use-copies";
import { useDeckBox } from "@/hooks/use-deck-box";
import { useEnumOrders } from "@/hooks/use-enums";
import type { DeckBoxCopy, DeckBoxGroup, DeckBoxPull } from "@/lib/deck-box";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { cn } from "@/lib/utils";

interface DeckBoxTabProps {
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
  cards,
  homeCollectionId,
  homeCollectionName,
  onViewMissing,
}: DeckBoxTabProps) {
  // Per-slot copy choices, kept for as long as the tab is open. They are a
  // preference for this pull run, not something worth persisting.
  const [overrides, setOverrides] = useState<ReadonlyMap<string, string>>(new Map());
  const [showSettled, setShowSettled] = useState(false);
  const plan = useDeckBox(cards, homeCollectionId, overrides);
  const moveCopies = useMoveCopies();

  if (!plan) {
    return <p className="text-muted-foreground py-6 text-sm">Loading your copies…</p>;
  }

  const pullTotal = plan.groups.reduce((sum, group) => sum + group.pulls.length, 0);

  const move = (pulls: readonly DeckBoxPull[]) => {
    const copyIds = pulls.map((pull) => pull.copy.copyId);
    // Where each copy came from, so undo can put every one of them back rather
    // than piling them into whichever collection was moved from last.
    const originById = new Map(pulls.map((pull) => [pull.copy.copyId, pull.copy.collectionId]));
    moveCopies.mutate(
      { copyIds, toCollectionId: homeCollectionId },
      {
        onSuccess: () => {
          toast.success(
            `Moved ${copyIds.length} ${copyIds.length === 1 ? "card" : "cards"} into ${homeCollectionName}`,
            {
              action: {
                label: "Undo",
                onClick: () => {
                  const byOrigin = Map.groupBy(copyIds, (copyId) => originById.get(copyId) ?? "");
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

      {plan.settled.length > 0 && (
        <section className="flex flex-col gap-1">
          <ExpandToggle expanded={showSettled} onClick={() => setShowSettled(!showSettled)}>
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              In the box ({plan.inBoxTotal})
            </span>
          </ExpandToggle>
          {showSettled &&
            plan.settled.map((entry) => (
              <div key={entry.cardId} className="text-muted-foreground flex gap-2 py-0.5 text-sm">
                <span className="tabular-nums">{entry.count}×</span>
                <span className="truncate">{entry.cardName}</span>
              </div>
            ))}
        </section>
      )}
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
  onSwap,
}: {
  group: DeckBoxGroup;
  disabled: boolean;
  onMove: () => void;
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
        <PullRow key={pull.slotKey} pull={pull} onSwap={onSwap} />
      ))}
    </section>
  );
}

/**
 * One copy to pull: what to look for, and a way to take a different copy of the
 * same card instead.
 * @returns The row.
 */
function PullRow({
  pull,
  onSwap,
}: {
  pull: DeckBoxPull;
  onSwap: (slotKey: string, copyId: string) => void;
}) {
  return (
    <div className="hover:bg-muted/40 flex items-center gap-2 rounded-md px-1 py-1 text-sm">
      <span className="text-muted-foreground w-24 shrink-0 font-mono text-xs">
        {pull.copy.shortCode}
      </span>
      <span className="min-w-0 flex-1 truncate">{pull.cardName}</span>
      <CopyDetails copy={pull.copy} />
      {pull.alternatives.length > 0 && (
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="xs" className="shrink-0 text-xs">
                Swap
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
