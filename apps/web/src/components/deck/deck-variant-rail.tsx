import type { Card, DeckCardResponse } from "@openrift/shared";
import { ZONE_LABELS } from "@openrift/shared";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, CopyIcon, GitBranchIcon, HistoryIcon, PlusIcon } from "lucide-react";
import { Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCards } from "@/hooks/use-cards";
import type { DeckVariantMode } from "@/hooks/use-decks";
import { deckDetailQueryOptions, useDecks } from "@/hooks/use-decks";
import { useRequiredUserId } from "@/lib/auth-session";
import type { DeckDiff, DeckDiffEntry } from "@/lib/deck-diff";
import { deckDiffCardsFrom, diffDecks } from "@/lib/deck-diff";
import type { RailEdge, RailLayout, RailNode } from "@/lib/deck-variant-rail";
import { buildRailLayout } from "@/lib/deck-variant-rail";
import { formatAbsoluteDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { isLocalDeckId } from "@/stores/local-decks-store";

import { DeckVariantCreateDialog } from "./deck-variant-create-dialog";
import { DeckVariantsDialog } from "./deck-variants-dialog";

// The rail is a git-style branch graph of the deck's family (ADR-042): HTML
// nodes positioned over an SVG that draws only the connections. Geometry lives
// here because it is pure presentation; the graph itself (who sits where, in
// which lane, at which slot) comes from lib/deck-variant-rail.

/** How many members fit before the rail collapses the rest into "+N more". */
const MAX_RAIL_NODES = 6;
/** Horizontal distance between two chain steps. */
const SLOT_WIDTH = 168;
/** Left inset so the first node's halo and focus ring aren't clipped. */
const PAD_X = 20;
/** Room to the right of the last node for its label. */
const TRAILING_X = 150;
/** Baseline of the ancestry chain. */
const LANE_0_Y = 34;
/** Baseline of the siblings. */
const LANE_1_Y = 76;
/** Tall enough for a lane-1 node plus its label below it. */
const RAIL_HEIGHT_TWO_LANE = 104;
/** No siblings, so nothing renders below the chain. */
const RAIL_HEIGHT_ONE_LANE = 52;
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
function laneY(lane: 0 | 1): number {
  return lane === 0 ? LANE_0_Y : LANE_1_Y;
}

/**
 * The SVG path for one connection. A chain step is a straight run along lane 0;
 * a branch leaves its anchor and eases down into lane 1, which is what makes
 * the fork read as a fork rather than a second unrelated row.
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
  if (edge.kind === "chain") {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const bend = (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`;
}

/**
 * Places an edge's step-diff numbers clear of both the labels and the dots.
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
  if (edge.kind === "chain") {
    // Below the chain line at the midpoint; the labels live above it.
    return { left: (nodeX(from) + nodeX(to)) / 2, top: LANE_0_Y + 14 };
  }
  // On the flat run into the branch node, where the curve has levelled off —
  // far enough left that the numbers clear the node's own dot.
  return { left: nodeX(to) - 48, top: LANE_1_Y };
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

function EdgeCounts({ addCount, cutCount }: { addCount: number; cutCount: number }) {
  return (
    <span className="bg-background flex items-center gap-1 rounded px-1">
      <span className={cn(CHIP_BASE, ADD_CHIP)}>+{addCount}</span>
      <span className={cn(CHIP_BASE, CUT_CHIP)}>−{cutCount}</span>
    </span>
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
  updatedAt,
  ourCards,
  theirCards,
  cardsById,
  onShowFullChanges,
  onBranchFrom,
}: {
  node: RailNode;
  updatedAt: string | undefined;
  ourCards: DeckCardResponse[] | undefined;
  theirCards: DeckCardResponse[] | undefined;
  cardsById: Record<string, Card>;
  onShowFullChanges: () => void;
  onBranchFrom: () => void;
}) {
  const updatedLabel = updatedAt
    ? formatAbsoluteDate(updatedAt, { year: "numeric", month: "short", day: "numeric" })
    : null;

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
        {/* Not a PopoverClose: the navigation unmounts the whole rail, and
            closing first would only race the route change. */}
        <Button
          variant="ghost"
          size="sm"
          render={<Link to="/decks/$deckId" params={{ deckId: node.id }} />}
        >
          <ArrowRightIcon className="size-4" />
          Open deck
        </Button>
        <PopoverClose render={<Button variant="ghost" size="sm" onClick={onShowFullChanges} />}>
          Show full changes
        </PopoverClose>
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
        "text-2xs absolute left-2.5 flex items-center gap-1.5",
        node.lane === 0 ? "bottom-full mb-2" : "top-full mt-2",
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
        "block size-2 rounded-full",
        isCurrent ? "bg-primary ring-primary/25 ring-4" : "bg-muted-foreground",
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
  const [presetCompareId, setPresetCompareId] = useState<string | null>(null);

  const current = items.find((item) => item.deck.id === deckId);
  const familyId = current?.deck.familyId ?? null;
  const members = items
    .filter((item) => familyId !== null && item.deck.familyId === familyId)
    .map((item) => item.deck);

  const layout: RailLayout =
    familyId === null || members.length < 2
      ? { nodes: [], edges: [], overflowCount: 0 }
      : buildRailLayout(members, deckId, new Date().getFullYear(), MAX_RAIL_NODES);

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

  const handleShowChanges = (compareId: string | null) => {
    setPresetCompareId(compareId);
    setVariantsOpen(true);
  };

  if (layout.nodes.length === 0) {
    return null;
  }

  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  const updatedById = new Map(members.map((member) => [member.id, member.updatedAt]));
  const hasSiblings = layout.nodes.some((node) => node.lane === 1);
  const height = hasSiblings ? RAIL_HEIGHT_TWO_LANE : RAIL_HEIGHT_ONE_LANE;
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
                <EdgeCounts addCount={counts.addCount} cutCount={counts.cutCount} />
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
                <PopoverTrigger
                  nativeButton={false}
                  openOnHover
                  delay={200}
                  closeDelay={120}
                  className="focus-visible:ring-ring absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:ring-2 focus-visible:outline-none"
                  style={position}
                  render={
                    <Link
                      to="/decks/$deckId"
                      params={{ deckId: node.id }}
                      aria-label={node.fullName}
                    />
                  }
                >
                  <RailDot isCurrent={false} />
                  <RailNodeLabel node={node} />
                </PopoverTrigger>
                <RailNodePopover
                  node={node}
                  updatedAt={updatedById.get(node.id)}
                  ourCards={cardsByDeck[deckId]}
                  theirCards={cardsByDeck[node.id]}
                  cardsById={cardsById}
                  onShowFullChanges={() => handleShowChanges(node.id)}
                  onBranchFrom={() => handleCreate("variant", { id: node.id, name: node.fullName })}
                />
              </Popover>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1" style={{ height: LANE_0_Y * 2 }}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Add a variant"
                  className="border-border rounded-full border border-dashed"
                />
              }
            >
              <PlusIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => handleCreate("checkpoint", { id: deckId, name: openDeckName })}
              >
                <HistoryIcon className="size-4" />
                Save checkpoint…
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleCreate("variant", { id: deckId, name: openDeckName })}
              >
                <CopyIcon className="size-4" />
                New variant…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {layout.overflowCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => handleShowChanges(null)}
            >
              +{layout.overflowCount} more
            </Button>
          )}
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
        open={variantsOpen}
        onOpenChange={setVariantsOpen}
        initialBaseId={presetCompareId === null ? undefined : deckId}
        initialCompareId={presetCompareId ?? undefined}
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
