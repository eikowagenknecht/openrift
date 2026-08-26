import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

// Rail geometry from deck-variant-rail.tsx. The vertical rhythm is verbatim —
// it is what makes the graph read as one. Only the slot narrows (168 → 132), so
// two generations fit a marketing column without the rail's own scroller.
const SLOT_WIDTH = 132;
const DOT_SIZE = 8;
const LABEL_WIDTH = SLOT_WIDTH - 12;
const PAD_X = LABEL_WIDTH / 2;
const LANE_TOP_Y = 28;
const LANE_GAP = 52;
const COUNTS_GAP_Y = 13;
const RAIL_WIDTH = PAD_X + SLOT_WIDTH + PAD_X;
const RAIL_HEIGHT = LANE_TOP_Y + LANE_GAP + 24;

const CHIP_BASE = "rounded px-1.5 font-mono text-2xs font-bold tabular-nums";
const ADD_CHIP = "bg-green-500/10 text-green-600 dark:text-green-500";
const CUT_CHIP = "bg-destructive/10 text-destructive";

const ROOT_X = PAD_X;
const HEAD_X = PAD_X + SLOT_WIDTH;
const LANE_0_Y = LANE_TOP_Y;
const LANE_1_Y = LANE_TOP_Y + LANE_GAP;

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
      {draft && <span className="shrink-0 text-amber-700 dark:text-amber-500">Draft</span>}
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

function VariantRow({
  name,
  lane,
  fork,
  last,
  updated,
  draft,
  emphasis,
}: {
  name: string;
  lane: 0 | 1;
  /** Draws the elbow that peels this row off lane 0. */
  fork?: boolean;
  last?: boolean;
  updated: string;
  draft?: boolean;
  emphasis?: "a" | "b";
}) {
  return (
    <li className="flex min-w-0 items-stretch gap-2">
      <span aria-hidden="true" className="relative w-8 shrink-0">
        {!fork && !last && <span className="bg-border absolute inset-y-0 left-[7px] w-px" />}
        {!fork && last && <span className="bg-border absolute top-0 bottom-1/2 left-[7px] w-px" />}
        {fork && (
          <span
            className="border-border absolute top-0 bottom-1/2 rounded-bl-sm border-b border-l"
            style={{ left: 7, width: 14 }}
          />
        )}
        <span
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: lane * 14 + 7 }}
        >
          <span className="bg-muted-foreground block size-2 rounded-full" />
          <span
            className={cn(
              "bg-primary ring-primary/25 absolute inset-0 block size-2 rounded-full ring-4",
              emphasis === undefined && "hidden",
              emphasis === "a" && "motion-safe:animate-variant-a",
              emphasis === "b" && "motion-safe:animate-variant-b opacity-0",
            )}
          />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 py-1">
        <span className="truncate font-medium">{name}</span>
        {emphasis !== undefined && (
          <span className="grid shrink-0">
            <Badge
              variant="subtle"
              className={cn(
                "col-start-1 row-start-1",
                emphasis === "a"
                  ? "motion-safe:animate-variant-a"
                  : "motion-safe:animate-variant-b opacity-0",
              )}
            >
              Current
            </Badge>
          </span>
        )}
        {draft && (
          <Badge variant="warning" className="shrink-0">
            Draft
          </Badge>
        )}
        <span className="text-muted-foreground text-2xs ml-auto shrink-0">Updated {updated}</span>
      </span>
    </li>
  );
}

/**
 * The deck-variant rail: a branch of the same deck drawn as a commit graph,
 * with each hop's added and cut copies floating over its connector. The
 * animation opens the fork and hands it the current marker, the way switching
 * variants moves it on the real page.
 */
export function VariantsVignette() {
  return (
    <ClipFrame className="flex flex-col gap-5 p-5">
      <div className="flex items-start gap-2 px-1">
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
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
                d={`M ${ROOT_X} ${LANE_0_Y} C ${ROOT_X + SLOT_WIDTH / 2} ${LANE_0_Y} ${HEAD_X - SLOT_WIDTH / 2} ${LANE_1_Y} ${HEAD_X} ${LANE_1_Y}`}
                className="stroke-border"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </svg>

            <EdgeCounts x={(ROOT_X + HEAD_X) / 2} y={LANE_0_Y} added={2} cut={1} />
            <EdgeCounts x={(ROOT_X + HEAD_X) / 2} y={LANE_1_Y} added={4} cut={4} pulse />

            <RailNode x={ROOT_X} y={LANE_0_Y}>
              <NodeLabel label="Yasuo Aggro" />
              <span className="bg-muted-foreground block size-2 rounded-full" />
              <span className="text-muted-foreground text-2xs absolute top-full left-1/2 mt-1 -translate-x-1/2 tabular-nums">
                2026-08-11
              </span>
            </RailNode>

            <RailNode x={HEAD_X} y={LANE_0_Y}>
              <NodeLabel label="tuned" emphasis="a" />
              <span className="bg-muted-foreground block size-2 rounded-full" />
              <span className="text-muted-foreground text-2xs absolute top-full left-1/2 mt-1 -translate-x-1/2 tabular-nums">
                2026-08-15
              </span>
            </RailNode>

            <RailNode x={HEAD_X} y={LANE_1_Y}>
              <NodeLabel label="budget" draft emphasis="b" />
              <span className="bg-muted-foreground block size-2 rounded-full" />
              <span className="text-muted-foreground text-2xs absolute top-full left-1/2 mt-1 -translate-x-1/2 tabular-nums">
                2026-08-14
              </span>
            </RailNode>

            <span
              aria-hidden="true"
              className="bg-primary ring-primary/25 motion-safe:animate-variant-slide absolute block size-2 rounded-full ring-4"
              style={{ left: HEAD_X - DOT_SIZE / 2, top: LANE_0_Y - DOT_SIZE / 2 }}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1" style={{ height: LANE_TOP_Y * 2 }}>
          <span
            aria-hidden="true"
            className="border-border grid size-8 place-items-center rounded-full border border-dashed"
          >
            <PlusIcon className="size-4" />
          </span>
          <span className="text-muted-foreground px-2 text-sm font-medium">Variants</span>
        </div>
      </div>

      <ul className="border-border/60 flex flex-col border-t pt-2 text-sm">
        <VariantRow name="Yasuo Aggro" lane={0} updated="2026-08-11" />
        <VariantRow name="Yasuo Aggro (tuned)" lane={0} updated="2026-08-15" emphasis="a" />
        <VariantRow
          name="Yasuo Aggro (budget)"
          lane={1}
          fork
          last
          updated="2026-08-14"
          draft
          emphasis="b"
        />
      </ul>
    </ClipFrame>
  );
}
