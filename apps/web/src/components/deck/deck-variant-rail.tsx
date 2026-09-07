import type { Card, DeckCardResponse, DeckDetailResponse } from "@openrift/shared";
import { ZONE_LABELS, formatDay } from "@openrift/shared";
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, GitBranchIcon, GitCompareArrowsIcon, PlusIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SectionHeading } from "@/components/ui/section-heading";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCards } from "@/hooks/use-cards";
import { deckDetailQueryOptions, useDecks } from "@/hooks/use-decks";
import { useRequiredUserId } from "@/lib/auth-session";
import type { DeckDiff, DeckDiffEntry } from "@/lib/deck-diff";
import { deckDiffCardsFrom, diffDecks } from "@/lib/deck-diff";
import type { RailEdge, RailLayout, RailNode } from "@/lib/deck-variant-rail";
import { buildRailLayout } from "@/lib/deck-variant-rail";
import { isLocalDeckId } from "@/lib/local-deck";
import { cn } from "@/lib/utils";

import { DeckVariantCreateDialog } from "./deck-variant-create-dialog";
import { DeckVariantsDialog } from "./deck-variants-dialog";

// HTML nodes positioned over an SVG that draws only the connections. Geometry
// lives here; the graph itself (who sits where, which lane, which column)
// comes from lib/deck-variant-rail.

const MAX_RAIL_NODES = 6;
const SLOT_WIDTH = 168;
const DOT_SIZE = 8;
const LABEL_GAP = 8;
const DATE_GAP = 4;
const LABEL_LINE_HEIGHT = 16;
const COUNTS_GAP_Y = LABEL_LINE_HEIGHT / 2 + 5;
const LABEL_MARGIN_X = 12;
const LABEL_WIDTH = SLOT_WIDTH - LABEL_MARGIN_X;
const PAD_X = LABEL_WIDTH / 2;
const TRAILING_X = LABEL_WIDTH / 2;
const LANE_TOP_Y = DOT_SIZE / 2 + LABEL_GAP + LABEL_LINE_HEIGHT;
const LANE_GAP = DOT_SIZE + DATE_GAP + LABEL_LINE_HEIGHT + LABEL_GAP + LABEL_LINE_HEIGHT;
const LANE_BOTTOM_PAD = Math.max(
  DOT_SIZE / 2 + DATE_GAP + LABEL_LINE_HEIGHT,
  COUNTS_GAP_Y + LABEL_LINE_HEIGHT / 2,
);

const CHIP_BASE = "rounded-md px-1.5 font-mono text-2xs font-bold tabular-nums";
const ADD_CHIP = "bg-success-soft text-success";
const CUT_CHIP = "bg-destructive-soft text-destructive";
const CHANGE_CHIP = "bg-warning-soft text-warning";
const ADD_CHIP_HOVER =
  "transition-colors group-hover:bg-success/20 group-focus-visible:bg-success/20";
const CUT_CHIP_HOVER =
  "transition-colors group-hover:bg-destructive/20 group-focus-visible:bg-destructive/20";

const CHIP_STYLES: Record<DeckDiffEntry["kind"], string> = {
  add: ADD_CHIP,
  cut: CUT_CHIP,
  change: CHANGE_CHIP,
};

function chipLabel(entry: DeckDiffEntry): string {
  if (entry.kind === "add") {
    return `+${entry.theirs}`;
  }
  if (entry.kind === "cut") {
    return `−${entry.ours}`;
  }
  return `${entry.ours}→${entry.theirs}`;
}

function nodeX(node: { x: number }): number {
  return PAD_X + node.x * SLOT_WIDTH;
}

function laneY(lane: number): number {
  return LANE_TOP_Y + lane * LANE_GAP;
}

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

function edgeCountsPosition(
  edge: RailEdge,
  byId: ReadonlyMap<string, RailNode>,
): { left: number; top: number } | null {
  const from = byId.get(edge.fromId);
  const to = byId.get(edge.toId);
  if (!from || !to) {
    return null;
  }
  return { left: (nodeX(from) + nodeX(to)) / 2, top: laneY(to.lane) + COUNTS_GAP_Y };
}

// Both ends must be loaded before a count means anything; a half-loaded edge draws nothing.
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

function selectDeckCards(detail: DeckDetailResponse): DeckCardResponse[] {
  return detail.cards;
}

function RailDiffRows({ diff }: { diff: DeckDiff }) {
  if (diff.zones.length === 0) {
    return <p className="text-muted-foreground">The two lists match, card for card.</p>;
  }
  return (
    <div className="flex max-h-64 min-w-0 flex-col gap-3 overflow-y-auto overscroll-contain">
      {diff.zones.map((zoneDiff) => (
        <section key={zoneDiff.zone} className="flex min-w-0 flex-col gap-1">
          <SectionHeading as="h3" size="sm">
            {ZONE_LABELS[zoneDiff.zone]}
          </SectionHeading>
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

// Split out so the comparison only runs once the popup actually mounts: a
// rail draws up to six of these, none on screen until someone hovers a node.
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

function EdgeCounts({
  fromId,
  toId,
  fromLabel,
  toLabel,
  addCount,
  cutCount,
  cardsByDeck,
  cardsById,
}: {
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  addCount: number;
  cutCount: number;
  cardsByDeck: Record<string, DeckCardResponse[]>;
  cardsById: Record<string, Card>;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`What changed between ${fromLabel} and ${toLabel}`}
        className="group bg-background focus-visible:ring-ring flex items-center gap-1 rounded-full px-1 transition-transform outline-none hover:scale-110 focus-visible:scale-110 focus-visible:ring-2 data-popup-open:scale-110"
      >
        <span className={cn(CHIP_BASE, ADD_CHIP, ADD_CHIP_HOVER)}>+{addCount}</span>
        <span className={cn(CHIP_BASE, CUT_CHIP, CUT_CHIP_HOVER)}>−{cutCount}</span>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="center" side="bottom">
        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5">
          <span className="truncate">{fromLabel}</span>
          <ArrowRightIcon className="size-3.5 shrink-0" />
          <span className="truncate">{toLabel}</span>
        </div>
        <RailNodeDiff
          ourCards={cardsByDeck[fromId]}
          theirCards={cardsByDeck[toId]}
          cardsById={cardsById}
        />
        <div className="border-t pt-2">
          {/* Not a PopoverClose: the navigation unmounts the whole rail, and
              closing first would only race the route change. */}
          <Button
            variant="ghost"
            size="sm"
            render={<Link to="/decks/compare" search={{ from: fromId, to: toId }} />}
          >
            Show full changes
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function defaultCompareFrom(
  layout: RailLayout,
  members: readonly { id: string; updatedAt: string }[],
  deckId: string,
): string | null {
  const parentEdge = layout.edges.find((edge) => edge.toId === deckId);
  if (parentEdge) {
    return parentEdge.fromId;
  }
  const newestOther = members
    .filter((member) => member.id !== deckId)
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  return newestOther?.id ?? null;
}

function RailCurrentPopover({
  node,
  updatedAt,
  compareFrom,
  onBranchFrom,
}: {
  node: RailNode;
  updatedAt: string | undefined;
  compareFrom: string | null;
  onBranchFrom: () => void;
}) {
  const updatedLabel = updatedAt ? formatDay(updatedAt) : null;

  return (
    <PopoverContent className="w-72" align="start" side="bottom">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium">{node.fullName}</span>
        {updatedLabel && (
          <span className="text-muted-foreground text-2xs">
            {node.isDraft ? "Draft · " : ""}Updated {updatedLabel}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t pt-2">
        {compareFrom !== null && (
          // Not a PopoverClose: the navigation unmounts the whole rail, and
          // closing first would only race the route change.
          <Button
            variant="ghost"
            size="sm"
            render={<Link to="/decks/compare" search={{ from: compareFrom, to: node.id }} />}
          >
            <GitCompareArrowsIcon className="size-4" />
            Compare with other versions
          </Button>
        )}
        <PopoverClose render={<Button variant="ghost" size="sm" onClick={onBranchFrom} />}>
          <GitBranchIcon className="size-4" />
          Branch from here
        </PopoverClose>
      </div>
    </PopoverContent>
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
          variant="default"
          size="sm"
          render={<Link to="/decks/$deckId" params={{ deckId: node.id }} />}
        >
          <ArrowRightIcon className="size-4" />
          Open deck
        </Button>
        <Button
          variant="ghost"
          size="sm"
          render={<Link to="/decks/compare" search={{ from: node.id, to: openDeckId }} />}
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
        "text-2xs absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center justify-center gap-1.5",
        node.isCurrent ? "text-foreground font-medium" : "text-muted-foreground",
      )}
      style={{ width: LABEL_WIDTH }}
    >
      <span className="truncate">{node.label}</span>
      {node.isDraft && <span className="text-warning shrink-0">Draft</span>}
    </span>
  );
}

function RailNodeDate({ updatedAt }: { updatedAt: string | undefined }) {
  if (!updatedAt) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-2xs absolute top-full left-1/2 mt-1 -translate-x-1/2 tabular-nums">
      {formatDay(updatedAt)}
    </span>
  );
}

function RailDot({ isCurrent }: { isCurrent: boolean }) {
  return (
    <span
      className={cn(
        // Growth is on the dot, not the trigger, so the label beside it stays put.
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
  const { cardsById } = useCards();
  const { data: items } = useDecks();

  const [createOpen, setCreateOpen] = useState(false);
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

  // Must subscribe, not fetch once: the open deck's cache entry is rewritten after every autosave.
  const railResults = useQueries({
    queries: layout.nodes.map((node) => ({
      ...deckDetailQueryOptions(userId, node.id),
      select: selectDeckCards,
    })),
  });

  const cardsByDeck: Record<string, DeckCardResponse[]> = {};
  for (const [index, node] of layout.nodes.entries()) {
    const cards = railResults[index]?.data;
    if (cards) {
      cardsByDeck[node.id] = cards;
    }
  }

  const openDeckName = current?.deck.name ?? "this deck";

  const handleCreate = (target: { id: string; name: string }) => {
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
  const compareFrom = defaultCompareFrom(layout, members, deckId);
  const createTargetId = createTarget?.id ?? deckId;
  const createTargetName = createTarget?.name ?? openDeckName;

  return (
    <div className="flex items-start gap-2 px-1">
      <nav
        aria-label="Deck variants"
        // overflow-y must be stated: left at `visible` next to a set `overflow-x`,
        // CSS promotes it to `auto` and a hair of vertical overflow shows a scrollbar.
        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain"
      >
        <div className="relative" style={{ width, height }}>
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
                  fromLabel={nodesById.get(edge.fromId)?.fullName ?? "the previous version"}
                  toLabel={nodesById.get(edge.toId)?.fullName ?? "this version"}
                  addCount={counts.addCount}
                  cutCount={counts.cutCount}
                  cardsByDeck={cardsByDeck}
                  cardsById={cardsById}
                />
              </span>
            );
          })}

          {layout.nodes.map((node) => {
            const position = { left: nodeX(node), top: laneY(node.lane) };
            if (node.isCurrent) {
              return (
                <Popover key={node.id}>
                  <PopoverTrigger
                    aria-label={`${node.fullName} (open deck)`}
                    className="focus-visible:ring-ring group absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:ring-2 focus-visible:outline-none"
                    style={position}
                  >
                    <RailNodeLabel node={node} />
                    <RailDot isCurrent />
                    <RailNodeDate updatedAt={updatedById.get(node.id)} />
                  </PopoverTrigger>
                  <RailCurrentPopover
                    node={node}
                    updatedAt={updatedById.get(node.id)}
                    compareFrom={compareFrom}
                    onBranchFrom={() => handleCreate({ id: deckId, name: openDeckName })}
                  />
                </Popover>
              );
            }
            return (
              <Popover key={node.id}>
                <PopoverTrigger
                  aria-label={node.fullName}
                  className="focus-visible:ring-ring group absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:ring-2 focus-visible:outline-none"
                  style={position}
                >
                  <RailNodeLabel node={node} />
                  <RailDot isCurrent={false} />
                  <RailNodeDate updatedAt={updatedById.get(node.id)} />
                </PopoverTrigger>
                <RailNodePopover
                  node={node}
                  openDeckId={deckId}
                  updatedAt={updatedById.get(node.id)}
                  ourCards={cardsByDeck[deckId]}
                  theirCards={cardsByDeck[node.id]}
                  cardsById={cardsById}
                  onBranchFrom={() => handleCreate({ id: node.id, name: node.fullName })}
                />
              </Popover>
            );
          })}
        </div>
      </nav>

      {/* Outside the scroller, so the actions stay pinned to the right edge
          instead of trailing a wide graph off-screen. */}
      <div className="flex shrink-0 items-center gap-1" style={{ height: LANE_TOP_Y * 2 }}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New variant"
                className="rounded-full border border-dashed"
                onClick={() => handleCreate({ id: deckId, name: openDeckName })}
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
          {layout.overflowCount > 0 ? `Variants (+${layout.overflowCount})` : "Variants"}
        </Button>
      </div>

      <DeckVariantCreateDialog
        deckId={createTargetId}
        deckName={createTargetName}
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

// Never renders for a browser-local deck: local decks have no family.
export function DeckVariantRail({ deckId }: { deckId: string }) {
  if (isLocalDeckId(deckId)) {
    return null;
  }
  // Fallback must be null: the rail must not hold up the deck page while loading.
  return (
    <Suspense fallback={null}>
      <VariantRailBody deckId={deckId} />
    </Suspense>
  );
}
