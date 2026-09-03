import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

// Rail geometry from deck-variant-rail.tsx. The vertical rhythm is verbatim —
// it is what makes the graph read as one. Only the slot narrows (168 → 132), so
// three generations fit a marketing column without the rail's own scroller.
// SLOT_WIDTH and LANE_GAP are also the marker's travel, so `variant-slide` in
// index.css carries them as literals.
const SLOT_WIDTH = 132;
const DOT_SIZE = 8;
const LABEL_WIDTH = SLOT_WIDTH - 12;
const PAD_X = LABEL_WIDTH / 2;
const LANE_TOP_Y = 28;
const LANE_GAP = 52;
const COUNTS_GAP_Y = 13;
const RAIL_WIDTH = PAD_X + SLOT_WIDTH * 2 + PAD_X;
const RAIL_HEIGHT = LANE_TOP_Y + LANE_GAP + 24;

const CHIP_BASE = "rounded-md px-1.5 font-mono text-2xs font-bold tabular-nums";
const ADD_CHIP = "bg-success-soft text-success";
const CUT_CHIP = "bg-destructive/10 text-destructive";
const CHANGE_CHIP = "bg-warning-soft text-warning";

const ROOT_X = PAD_X;
const HEAD_X = PAD_X + SLOT_WIDTH;
const FORK_X = PAD_X + SLOT_WIDTH * 2;
const LANE_0_Y = LANE_TOP_Y;
const LANE_1_Y = LANE_TOP_Y + LANE_GAP;

type DiffKind = "add" | "cut" | "change";

const CHIP_STYLES: Record<DiffKind, string> = {
  add: ADD_CHIP,
  cut: CUT_CHIP,
  change: CHANGE_CHIP,
};

interface DiffEntry {
  name: string;
  kind: DiffKind;
  /** The chip text the real diff renders: "+1", "−2", or "3→1". */
  chip: string;
}

/**
 * One step of the Azir family the deck vignette builds, card for card. The chip
 * totals on the rail are these entries summed, and both count copies rather
 * than rows, so a `2→3` change is worth one add.
 *
 * Every card is real and legal in the list: an Emperor of the Sands legend puts
 * the deck in calm and order, so nothing from the other four domains can appear
 * here. Rebuilding for Unleashed pulls in that set's cards; the budget branch
 * off it fills the holes with commons and drops the two carrying the price.
 *
 * The counts also have to fit the deck vignette's energy curve, since both
 * describe the same 39-card list. Nothing here claims three copies at an energy
 * whose column is already spoken for.
 */
const UNLEASHED_DIFF: DiffEntry[] = [
  { name: "Vi, Peacekeeper", kind: "add", chip: "+1" },
  { name: "Soul Sword", kind: "change", chip: "2→3" },
  { name: "Xin Zhao, Vigilant", kind: "cut", chip: "−1" },
];

const BUDGET_DIFF: DiffEntry[] = [
  { name: "Trusty Ramhound", kind: "add", chip: "+3" },
  { name: "Honest Broker", kind: "add", chip: "+1" },
  { name: "Tactical Retreat", kind: "change", chip: "3→1" },
  { name: "Poppy, Defender of the Meek", kind: "cut", chip: "−2" },
];

function NodeLabel({
  label,
  draft,
  emphasis,
}: {
  label: string;
  draft?: boolean;
  /** Which half of the switch this label is bold for. */
  emphasis?: "a" | "b";
}) {
  const name = <span className="truncate">{label}</span>;
  return (
    <span
      className="text-2xs absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center justify-center gap-1.5"
      style={{ width: LABEL_WIDTH }}
    >
      {emphasis === undefined ? (
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5">{name}</span>
      ) : (
        <span className="grid min-w-0">
          <span
            className={cn(
              "text-muted-foreground col-start-1 row-start-1 flex min-w-0 items-center gap-1.5",
              emphasis === "a"
                ? "motion-safe:animate-variant-b"
                : "motion-safe:animate-variant-a opacity-0",
            )}
          >
            {name}
          </span>
          <span
            className={cn(
              "text-foreground col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 font-medium",
              emphasis === "a"
                ? "motion-safe:animate-variant-a"
                : "motion-safe:animate-variant-b opacity-0",
            )}
          >
            {name}
          </span>
        </span>
      )}
      {draft && <span className="text-warning shrink-0">Draft</span>}
    </span>
  );
}

function RailNode({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <span className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
      {children}
    </span>
  );
}

function EdgeCounts({
  x,
  y,
  added,
  cut,
  pulse,
}: {
  x: number;
  y: number;
  added: number;
  cut: number;
  pulse?: boolean;
}) {
  return (
    <span
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: x, top: y + COUNTS_GAP_Y }}
    >
      <span
        className={cn(
          "bg-background flex items-center gap-1 rounded-full px-1",
          pulse && "motion-safe:animate-variant-chip",
        )}
      >
        <span className={cn(CHIP_BASE, ADD_CHIP)}>+{added}</span>
        <span className={cn(CHIP_BASE, CUT_CHIP)}>−{cut}</span>
      </span>
    </span>
  );
}

/**
 * The card-by-card body the numbers on a connector open, for one step. Both
 * panels share a grid cell so the frame measures the taller of the two and the
 * switch never reflows the column. Panel "a" is the one showing at rest, which
 * is what reduced motion and the server render get.
 */
function StepDiff({
  from,
  to,
  entries,
  emphasis,
}: {
  from: string;
  to: string;
  entries: DiffEntry[];
  emphasis: "a" | "b";
}) {
  return (
    <div
      className={cn(
        "col-start-1 row-start-1 flex min-w-0 flex-col gap-2",
        emphasis === "a"
          ? "motion-safe:animate-variant-a"
          : "motion-safe:animate-variant-b opacity-0",
      )}
    >
      <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
        <span className="truncate">{from}</span>
        <ArrowRightIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{to}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-muted-foreground text-2xs font-semibold tracking-wide uppercase">
          Main Deck
        </span>
        {entries.map((entry) => (
          <div key={entry.name} className="flex items-baseline gap-2">
            <span className={cn(CHIP_BASE, CHIP_STYLES[entry.kind])}>{entry.chip}</span>
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The deck-variant rail: a branch of the same deck drawn as a commit graph,
 * with each hop's added and cut copies floating over its connector. The
 * animation opens the fork and hands it the current marker, the way switching
 * variants moves it on the real page, and the panel below follows to the step
 * the marker lands on.
 */
export function VariantsVignette() {
  return (
    <ClipFrame className="flex flex-col gap-4 p-5">
      <div className="min-w-0 overflow-x-auto overflow-y-hidden px-1">
        <div className="relative" style={{ width: RAIL_WIDTH, height: RAIL_HEIGHT }}>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            width={RAIL_WIDTH}
            height={RAIL_HEIGHT}
            viewBox={`0 0 ${RAIL_WIDTH} ${RAIL_HEIGHT}`}
            fill="none"
          >
            <path
              d={`M ${ROOT_X} ${LANE_0_Y} L ${HEAD_X} ${LANE_0_Y}`}
              className="stroke-border"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <path
              d={`M ${HEAD_X} ${LANE_0_Y} C ${HEAD_X + SLOT_WIDTH / 2} ${LANE_0_Y} ${FORK_X - SLOT_WIDTH / 2} ${LANE_1_Y} ${FORK_X} ${LANE_1_Y}`}
              className="stroke-border"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>

          <EdgeCounts x={(ROOT_X + HEAD_X) / 2} y={LANE_0_Y} added={2} cut={1} />
          <EdgeCounts x={(HEAD_X + FORK_X) / 2} y={LANE_1_Y} added={4} cut={4} pulse />

          <RailNode x={ROOT_X} y={LANE_0_Y}>
            <NodeLabel label="Spiritforged" />
            <span className="bg-muted-foreground block size-2 rounded-full" />
            <span className="text-muted-foreground text-2xs absolute top-full left-1/2 mt-1 -translate-x-1/2 tabular-nums">
              2026-08-11
            </span>
          </RailNode>

          <RailNode x={HEAD_X} y={LANE_0_Y}>
            <NodeLabel label="Unleashed" emphasis="a" />
            <span className="bg-muted-foreground block size-2 rounded-full" />
            <span className="text-muted-foreground text-2xs absolute top-full left-1/2 mt-1 -translate-x-1/2 tabular-nums">
              2026-08-15
            </span>
          </RailNode>

          <RailNode x={FORK_X} y={LANE_1_Y}>
            <NodeLabel label="budget" draft emphasis="b" />
            <span className="bg-muted-foreground block size-2 rounded-full" />
            <span className="text-muted-foreground text-2xs absolute top-full left-1/2 mt-1 -translate-x-1/2 tabular-nums">
              2026-08-16
            </span>
          </RailNode>

          <span
            aria-hidden="true"
            className="bg-primary ring-primary/25 motion-safe:animate-variant-slide absolute block size-2 rounded-full ring-4"
            style={{
              left: HEAD_X - DOT_SIZE / 2,
              top: LANE_0_Y - DOT_SIZE / 2,
            }}
          />
        </div>
      </div>

      <div className="border-border/60 grid border-t pt-3">
        <StepDiff
          from="Azir (Spiritforged)"
          to="Azir (Unleashed)"
          entries={UNLEASHED_DIFF}
          emphasis="a"
        />
        <StepDiff from="Azir (Unleashed)" to="Azir (budget)" entries={BUDGET_DIFF} emphasis="b" />
      </div>
    </ClipFrame>
  );
}
