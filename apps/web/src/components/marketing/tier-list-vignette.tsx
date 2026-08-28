import { TIER_LABEL_INK, tierColor } from "@openrift/shared";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { MiniCardArt, Swap, Vignette, VignetteHeading } from "./vignette-parts";

/** Tile width, so the rows and the pool below them read as the same board. */
const TILE = "w-11 shrink-0";

/**
 * Row names are the creator's own. A board opens on S to D and is renamed,
 * reordered and grown from there, so a miniature showing the letters would be
 * advertising the one part of the board that is not fixed.
 */
const TIER_1 = { label: "Tier 1", index: 0 };
const TIER_2 = { label: "Tier 2", index: 1 };
const FRINGE = { label: "Fringe", index: 2 };

/**
 * A board row, mirroring TierRowFrame: the ramp-coloured label chip against the
 * card strip. `bg-background/40` rather than the board's own `bg-card/40` — the
 * frame around this miniature is already `bg-card`, so the real value would
 * leave the row invisible.
 *
 * @returns The row node.
 */
function TierRow({ tier, children }: { tier: typeof TIER_1; children: ReactNode }) {
  return (
    // No overflow-hidden, unlike the real TierRowFrame: the tile flying in from
    // the pool passes over the rows below this one, and a clipped row would pop
    // it into place instead. The label chip rounds its own left corners in its
    // place.
    <div className="ring-border bg-background/40 flex items-stretch rounded-md ring-1">
      <div
        className="text-2xs flex w-12 shrink-0 items-center justify-center rounded-s-md px-1 text-center font-bold wrap-anywhere"
        style={{ backgroundColor: tierColor(tier.index), color: TIER_LABEL_INK }}
      >
        {tier.label}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1 p-1">{children}</div>
    </div>
  );
}

/** A board tile, or its placeholder when the day's sample came up short. */
function Tile({ url, className }: { url?: string; className?: string }) {
  if (!url) {
    return <span className={cn("aspect-card bg-muted rounded-[5%/3.6%]", TILE, className)} />;
  }
  return <MiniCardArt url={url} className={cn(TILE, className)} />;
}

// h-5 and the rounding are CountPill's; the real control is a CountPillButton,
// which nothing in a miniature may be.
const PILL = "text-2xs inline-flex h-5 max-w-11 items-center truncate rounded-md px-1.5 font-bold";

/** The strip control once a card is ranked: the row's own name, in its colour. */
function TierPill({ tier }: { tier: typeof TIER_1 }) {
  return (
    <span
      className={PILL}
      style={{ backgroundColor: tierColor(tier.index), color: TIER_LABEL_INK }}
    >
      {tier.label}
    </span>
  );
}

/** The strip control while a card is unranked. This is the tap path on a phone. */
function RankPill() {
  return <span className={cn(PILL, "bg-muted text-muted-foreground")}>Rank</span>;
}

/**
 * A pool cell. The pool is a card browser, so a cell is a CardCell with a strip
 * under it, and the strip's control is the tier pill: the row's own name once
 * the card is ranked, "Rank" while it is not. A ranked card is dimmed and stays
 * in the pool rather than leaving it.
 *
 * The cell being ranked this cycle crossfades its pill on the shared `Swap`,
 * whose 9s beat is the one the board's flight is cut against.
 *
 * @returns The pool cell node.
 */
function PoolCell({
  url,
  tier,
  animate,
}: {
  url?: string;
  /** The row this card sits in, or undefined while it is still unranked. */
  tier?: typeof TIER_1;
  animate?: boolean;
}) {
  return (
    <span className="flex flex-col items-center gap-1">
      <Tile
        url={url}
        className={cn(tier && "opacity-40", animate && "motion-safe:animate-tier-pool-dim")}
      />
      {animate && tier ? (
        <Swap className="justify-items-center" was={<RankPill />} now={<TierPill tier={tier} />} />
      ) : tier ? (
        <TierPill tier={tier} />
      ) : (
        <RankPill />
      )}
    </span>
  );
}

/**
 * The tier list builder in miniature: a board of Legends mid-ranking, with the
 * card that just landed in the top row flying up out of the pool while its pool
 * copy dims and takes that row's pill.
 *
 * The ramp colours come from the shared `tierColor`, not from a copy — the same
 * function paints the real board and the API's share image, and a third
 * hand-picked set here would be the one that drifts.
 *
 * @returns The tier list vignette.
 */
export function TierListVignette({ legendUrls = [] }: { legendUrls?: string[] }) {
  const art = (index: number) => legendUrls[index];
  return (
    <Vignette>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">Current meta, best legends</span>
        <VignetteHeading>
          <Swap was={<>8 ranked</>} now={<>9 ranked</>} />
        </VignetteHeading>
      </div>

      <div className="flex flex-col gap-1.5">
        <TierRow tier={TIER_1}>
          <Tile url={art(0)} />
          <Tile url={art(1)} />
          <Tile url={art(2)} />
          <Tile url={art(3)} />
          {/* z-10: the flight crosses the rows below, which come later in the
              DOM and would otherwise paint over it. */}
          <Tile url={art(4)} className="motion-safe:animate-tier-land relative z-10" />
        </TierRow>
        <TierRow tier={TIER_2}>
          <Tile url={art(5)} />
          <Tile url={art(6)} />
          <Tile url={art(7)} />
        </TierRow>
        <TierRow tier={FRINGE}>
          <Tile url={art(8)} />
        </TierRow>
      </div>

      <div className="flex flex-col gap-1.5">
        <VignetteHeading>Card pool</VignetteHeading>
        <div className="flex items-start gap-1.5">
          <PoolCell url={art(0)} tier={TIER_1} />
          <PoolCell url={art(5)} tier={TIER_2} />
          <PoolCell url={art(4)} tier={TIER_1} animate />
          <PoolCell url={art(8)} tier={FRINGE} />
          <PoolCell url={art(9)} />
        </div>
      </div>
    </Vignette>
  );
}
