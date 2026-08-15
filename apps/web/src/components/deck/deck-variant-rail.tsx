import type { Card, DeckCardResponse } from "@openrift/shared";
import { ZONE_LABELS, formatDay } from "@openrift/shared";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, GitBranchIcon, PlusIcon } from "lucide-react";
import { Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCards } from "@/hooks/use-cards";
import type { DeckVariantMode } from "@/hooks/use-decks";
import { deckDetailQueryOptions, useDecks } from "@/hooks/use-decks";
import { useRequiredUserId } from "@/lib/auth-session";
import type { DeckDiff, DeckDiffEntry } from "@/lib/deck-diff";
import { deckDiffCardsFrom, diffDecks } from "@/lib/deck-diff";
import type { RailEdge, RailLayout, RailNode } from "@/lib/deck-variant-rail";
import { buildRailLayout } from "@/lib/deck-variant-rail";
import { cn } from "@/lib/utils";
import { isLocalDeckId } from "@/stores/local-decks-store";

import { DeckVariantCreateDialog } from "./deck-variant-create-dialog";
import { DeckVariantsDialog } from "./deck-variants-dialog";

// The rail is a git-style branch graph of the deck's family (ADR-042): HTML
// nodes positioned over an SVG that draws only the connections. Geometry lives
// here because it is pure presentation; the graph itself (who sits where, in
// which lane, at which column) comes from lib/deck-variant-rail.

/** How many members fit before the rail collapses the rest into "+N more". */
const MAX_RAIL_NODES = 6;
/** Horizontal distance between two generations. */
const SLOT_WIDTH = 168;
/** Left inset so the first node's halo and focus ring aren't clipped. */
const PAD_X = 20;
/** Room to the right of the last node for its label. */
const TRAILING_X = 150;
/** Baseline of lane 0. */
const LANE_TOP_Y = 22;
/** Vertical distance between two lanes: a dot plus its label below it. */
const LANE_GAP = 46;
/** Room under the last lane for its label. */
const LANE_BOTTOM_PAD = 26;
/** Width of a node's label box; it truncates rather than pushing the layout. */
const LABEL_WIDTH = 140;

const CHIP_BASE = "rounded px-1.5 font-mono text-2xs font-bold tabular-nums";
const ADD_CHIP = "bg-green-500/10 text-green-600 dark:text-green-500";
const CUT_CHIP = "bg-destructive/10 text-destructive";
const CHANGE_CHIP = "bg-amber-500/10 text-amber-700 dark:text-amber-500";

const CHIP_STYLES: Record<DeckDiffEntry["kind"], string> = {
  add: ADD_CHIP,
  cut: CUT_CHIP,
  change: CHANGE_CHIP,
};

/** @returns The chip text for one diff entry, e.g. "+2", "−1", or "3→2". */
function chipLabel(entry: DeckDiffEntry): string {
  if (entry.kind === "add") {
    return `+${entry.theirs}`;
  }
  if (entry.kind === "cut") {
    return `−${entry.ours}`;
  }
  return `${entry.ours}→${entry.theirs}`;
}

/** @returns The pixel x of a node's dot. */
function nodeX(node: { x: number }): number {
  return PAD_X + node.x * SLOT_WIDTH;
}

/** @returns The pixel y of a lane's baseline. */
function laneY(lane: number): number {
  return LANE_TOP_Y + lane * LANE_GAP;
}

/**
 * The SVG path for one connection. A step along the same lane is a straight
 * run; a fork eases down into its own lane, which is what makes it read as a
 * fork rather than a second unrelated row.
 *
 * @returns The `d` attribute, or null when either end is missing.
 */
function edgePath(edge: RailEdge, byId: ReadonlyMap<string, RailNode>): string | null {
  const from = byId.get(edge.fromId);
  const to = byId.get(edge.toId);
  if (!from || !to) {
    return null;
  }
  const x1 = nodeX(from);
  const y1 = laneY(from.lane);
  const x2 = nodeX(to);
  const y2 = laneY(to.lane);
  if (from.lane === to.lane) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const bend = (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`;
}

/**
 * Places an edge's step-diff numbers clear of both the labels and the dots:
 * midway along the edge, just above the line it lands on. Labels hang below
 * their dots, so the space above a line is always free.
 *
 * @returns The pixel centre for the numbers, or null when either end is missing.
 */
function edgeCountsPosition(
  edge: RailEdge,
  byId: ReadonlyMap<string, RailNode>,
): { left: number; top: number } | null {
  const from = byId.get(edge.fromId);
  const to = byId.get(edge.toId);
  if (!from || !to) {
    return null;
  }
  return { left: (nodeX(from) + nodeX(to)) / 2, top: laneY(to.lane) - 13 };
}

/**
 * The copies added and cut along one edge. Both ends have to be loaded before
 * a number means anything, so a half-loaded edge draws nothing at all rather
 * than a misleading zero.
 *
 * @returns The add/cut totals, or null while either end is still loading.
 */
function edgeCounts(
  cardsByDeck: Record<string, DeckCardResponse[]>,
  cardsById: Record<string, Card>,
  edge: RailEdge,
): { addCount: number; cutCount: number } | null {
  const from = cardsByDeck[edge.fromId];
  const to = cardsByDeck[edge.toId];
  if (!from || !to) {
    return null;
  }
  const diff = diffDecks(deckDiffCardsFrom(from, cardsById), deckDiffCardsFrom(to, cardsById));
  return { addCount: diff.addCount, cutCount: diff.cutCount };
}

/**
 * Fetches every rail member's card list. React Query dedupes and caches these,
 * so revisiting a family costs nothing; `onLoaded` fires per deck so the rail
 * fills in edge by edge instead of waiting for the slowest member.
 *
 * @returns A promise resolving once every member has been fetched.
 */
async function loadRailCards(
  queryClient: QueryClient,
  userId: string,
  deckIds: readonly string[],
  onLoaded: (deckId: string, cards: DeckCardResponse[]) => void,
): Promise<void> {
  await Promise.all(
    deckIds.map(async (deckId) => {
      const detail = await queryClient.fetchQuery(deckDetailQueryOptions(userId, deckId));
      onLoaded(deckId, detail.cards);
    }),
  );
}

/**
 * One edge's step diff, as the link into the full comparison. The numbers are
 * the most direct handle on "what changed between these two", so they carry the
 * navigation rather than sitting there as decoration.
 *
 * @returns The linked +N / −N chips.
 */
function EdgeCounts({
  fromId,
  toId,
  addCount,
  cutCount,
}: {
  fromId: string;
  toId: string;
  addCount: number;
  cutCount: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to="/decks/$deckId/changes"
            params={{ deckId: toId }}
            search={{ from: fromId }}
            aria-label="Show what changed"
            className="focus-visible:ring-ring bg-background hover:ring-border flex items-center gap-1 rounded px-1 ring-1 ring-transparent transition-[box-shadow] outline-none focus-visible:ring-2"
          />
        }
      >
        <span className={cn(CHIP_BASE, ADD_CHIP)}>+{addCount}</span>
        <span className={cn(CHIP_BASE, CUT_CHIP)}>−{cutCount}</span>
      </TooltipTrigger>
      <TooltipContent>Show what changed</TooltipContent>
    </Tooltip>
  );
}

function RailDiffRows({ diff }: { diff: DeckDiff }) {
  if (diff.zones.length === 0) {
    return <p className="text-muted-foreground">The two lists match, card for card.</p>;
  }
  return (
    <div className="flex max-h-64 min-w-0 flex-col gap-3 overflow-y-auto overscroll-contain">
      {diff.zones.map((zoneDiff) => (
        <section key={zoneDiff.zone} className="flex min-w-0 flex-col gap-1">
          <span className="text-muted-foreground text-2xs font-semibold tracking-widest uppercase">
            {ZONE_LABELS[zoneDiff.zone]}
          </span>
          {zoneDiff.entries.map((entry) => (
            <div key={entry.cardId} className="flex items-baseline gap-2">
              <span className={cn(CHIP_BASE, CHIP_STYLES[entry.kind])}>{chipLabel(entry)}</span>
              <span className="min-w-0 flex-1 truncate">{entry.cardName}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * The popover's diff body. Split out so the comparison only runs once the
 * popup actually mounts — a rail draws up to six of these, and none of them is
 * on screen until someone hovers a node.
 *
 * @returns The zone-grouped diff, or a loading line while a side is missing.
 */
function RailNodeDiff({
  ourCards,
  theirCards,
  cardsById,
}: {
  ourCards: DeckCardResponse[] | undefined;
  theirCards: DeckCardResponse[] | undefined;
  cardsById: Record<string, Card>;
}) {
  if (!ourCards || !theirCards) {
    return <p className="text-muted-foreground">Loading changes…</p>;
  }
  return (
    <RailDiffRows
      diff={diffDecks(
        deckDiffCardsFrom(ourCards, cardsById),
        deckDiffCardsFrom(theirCards, cardsById),
      )}
    />
  );
}

function RailNodePopover({
  node,
  openDeckId,
  updatedAt,
  ourCards,
  theirCards,
  cardsById,
  onBranchFrom,
}: {
  node: RailNode;
  /** The deck the rail belongs to, i.e. the other side of the comparison. */
  openDeckId: string;
  updatedAt: string | undefined;
  ourCards: DeckCardResponse[] | undefined;
  theirCards: DeckCardResponse[] | undefined;
  cardsById: Record<string, Card>;
  onBranchFrom: () => void;
}) {
  const updatedLabel = updatedAt ? formatDay(updatedAt) : null;

  return (
    <PopoverContent className="w-80" align="start" side="bottom">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium">{node.fullName}</span>
        {updatedLabel && (
          <span className="text-muted-foreground text-2xs">
            {node.isDraft ? "Draft · " : ""}Updated {updatedLabel}
          </span>
        )}
      </div>
      <RailNodeDiff ourCards={ourCards} theirCards={theirCards} cardsById={cardsById} />
      <div className="flex flex-wrap items-center gap-1 border-t pt-2">
        {/* Neither link is a PopoverClose: the navigation unmounts the whole
            rail, and closing first would only race the route change. */}
        <Button
          variant="ghost"
          size="sm"
          render={<Link to="/decks/$deckId" params={{ deckId: node.id }} />}
        >
          <ArrowRightIcon className="size-4" />
          Open deck
        </Button>
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link
              to="/decks/$deckId/changes"
              params={{ deckId: openDeckId }}
              search={{ from: node.id }}
            />
          }
        >
          Show full changes
        </Button>
        <PopoverClose render={<Button variant="ghost" size="sm" onClick={onBranchFrom} />}>
          <GitBranchIcon className="size-4" />
          Branch from here
        </PopoverClose>
      </div>
    </PopoverContent>
  );
}

function RailNodeLabel({ node }: { node: RailNode }) {
  return (
    <span
      className={cn(
        // Every label hangs below its dot: with more than two lanes, labels
        // above would collide with the lane over them.
        "text-2xs absolute top-full left-2.5 mt-2 flex items-center gap-1.5",
        node.isCurrent ? "text-foreground font-medium" : "text-muted-foreground",
      )}
      style={{ width: LABEL_WIDTH }}
    >
      <span className="truncate">{node.label}</span>
      {node.isDraft && <span className="shrink-0 text-amber-700 dark:text-amber-500">Draft</span>}
    </span>
  );
}

function RailDot({ isCurrent }: { isCurrent: boolean }) {
  return (
    <span
      className={cn(
        // The hover/open growth is on the dot rather than the trigger so the
        // label beside it stays put.
        "block size-2 rounded-full transition-[scale,background-color]",
        isCurrent
          ? "bg-primary ring-primary/25 ring-4"
          : "bg-muted-foreground group-hover:bg-foreground group-focus-visible:bg-foreground group-data-popup-open:bg-foreground group-hover:scale-150 group-focus-visible:scale-150 group-data-popup-open:scale-150",
      )}
    />
  );
}

function VariantRailBody({ deckId }: { deckId: string }) {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  const { cardsById } = useCards();
  const { data: items } = useDecks();

  const [cardsByDeck, setCardsByDeck] = useState<Record<string, DeckCardResponse[]>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<DeckVariantMode>("variant");
  const [createTarget, setCreateTarget] = useState<{ id: string; name: string } | null>(null);
  const [variantsOpen, setVariantsOpen] = useState(false);

  const current = items.find((item) => item.deck.id === deckId);
  const familyId = current?.deck.familyId ?? null;
  const members = items
    .filter((item) => familyId !== null && item.deck.familyId === familyId)
    .map((item) => item.deck);

  const layout: RailLayout =
    familyId === null || members.length < 2
      ? { nodes: [], edges: [], overflowCount: 0 }
      : buildRailLayout(members, deckId, MAX_RAIL_NODES);

  // Joined rather than the array itself so the effect doesn't refire on every
  // render just because `.map()` produced a new array.
  const railKey = layout.nodes.map((node) => node.id).join(",");

  useEffect(() => {
    const deckIds = railKey.split(",").filter((id) => id.length > 0);
    if (deckIds.length === 0) {
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        await loadRailCards(queryClient, userId, deckIds, (loadedId, cards) => {
          if (cancelled) {
            return;
          }
          setCardsByDeck((previous) => ({ ...previous, [loadedId]: cards }));
        });
      } catch {
        // A member that won't load simply leaves its step-diff blank; the rail
        // never blocks the deck page on it.
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [queryClient, userId, railKey]);

  const openDeckName = current?.deck.name ?? "this deck";

  const handleCreate = (mode: DeckVariantMode, target: { id: string; name: string }) => {
    setCreateMode(mode);
    setCreateTarget(target);
    setCreateOpen(true);
  };

  if (layout.nodes.length === 0) {
    return null;
  }

  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  const updatedById = new Map(members.map((member) => [member.id, member.updatedAt]));
  const maxLane = layout.nodes.reduce((deepest, node) => Math.max(deepest, node.lane), 0);
  const height = laneY(maxLane) + LANE_BOTTOM_PAD;
  const maxX = layout.nodes.reduce((widest, node) => Math.max(widest, node.x), 0);
  const width = PAD_X + maxX * SLOT_WIDTH + TRAILING_X;
  const createTargetId = createTarget?.id ?? deckId;
  const createTargetName = createTarget?.name ?? openDeckName;

  return (
    <div className="overflow-x-auto overscroll-x-contain px-1">
      <nav aria-label="Deck variants" className="flex w-max items-start">
        <div className="relative shrink-0" style={{ width, height }}>
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            fill="none"
          >
            {layout.edges.map((edge) => {
              const path = edgePath(edge, nodesById);
              if (!path) {
                return null;
              }
              return (
                <path
                  key={`${edge.fromId}-${edge.toId}`}
                  d={path}
                  className="stroke-border"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {layout.edges.map((edge) => {
            const position = edgeCountsPosition(edge, nodesById);
            const counts = edgeCounts(cardsByDeck, cardsById, edge);
            if (!position || !counts) {
              return null;
            }
            return (
              <span
                key={`counts-${edge.fromId}-${edge.toId}`}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: position.left, top: position.top }}
              >
                <EdgeCounts
                  fromId={edge.fromId}
                  toId={edge.toId}
                  addCount={counts.addCount}
                  cutCount={counts.cutCount}
                />
              </span>
            );
          })}

          {layout.nodes.map((node) => {
            const position = { left: nodeX(node), top: laneY(node.lane) };
            if (node.isCurrent) {
              return (
                <span
                  key={node.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={position}
                >
                  <RailDot isCurrent />
                  <RailNodeLabel node={node} />
                  <span className="sr-only">{node.fullName} (open deck)</span>
                </span>
              );
            }
            return (
              <Popover key={node.id}>
                {/* The dot opens the comparison rather than the deck: the deck
                    is one click further in, behind "Open deck". */}
                <PopoverTrigger
                  openOnHover
                  delay={200}
                  closeDelay={120}
                  aria-label={node.fullName}
                  className="focus-visible:ring-ring group absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:ring-2 focus-visible:outline-none"
                  style={position}
                >
                  <RailDot isCurrent={false} />
                  <RailNodeLabel node={node} />
                </PopoverTrigger>
                <RailNodePopover
                  node={node}
                  openDeckId={deckId}
                  updatedAt={updatedById.get(node.id)}
                  ourCards={cardsByDeck[deckId]}
                  theirCards={cardsByDeck[node.id]}
                  cardsById={cardsById}
                  onBranchFrom={() => handleCreate("variant", { id: node.id, name: node.fullName })}
                />
              </Popover>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1" style={{ height: LANE_TOP_Y * 2 }}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New variant"
                  className="border-border rounded-full border border-dashed"
                  onClick={() => handleCreate("variant", { id: deckId, name: openDeckName })}
                />
              }
            >
              <PlusIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>New variant</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setVariantsOpen(true)}
          >
            {layout.overflowCount > 0 ? `+${layout.overflowCount} more` : "Manage"}
          </Button>
        </div>
      </nav>

      <DeckVariantCreateDialog
        deckId={createTargetId}
        deckName={createTargetName}
        mode={createMode}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <DeckVariantsDialog
        deckId={deckId}
        deckName={openDeckName}
        open={variantsOpen}
        onOpenChange={setVariantsOpen}
      />
    </div>
  );
}

/**
 * The variant rail (ADR-042): the deck's family drawn as a branch graph between
 * the hero and the tab strip. Renders nothing for a standalone deck, and never
 * for a browser-local one — local decks have no family.
 *
 * @returns The rail element, or null when there is no family to draw.
 */
export function DeckVariantRail({ deckId }: { deckId: string }) {
  if (isLocalDeckId(deckId)) {
    return null;
  }
  // The deck list and the catalog both suspend; the rail is decoration, so it
  // waits invisibly rather than holding up the deck page behind a fallback.
  return (
    <Suspense fallback={null}>
      <VariantRailBody deckId={deckId} />
    </Suspense>
  );
}
