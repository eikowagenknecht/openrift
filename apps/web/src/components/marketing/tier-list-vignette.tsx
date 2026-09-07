import { TIER_LABEL_INK, tierColor } from "@openrift/shared/tier-colors";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { MiniCardArt, Swap, Vignette, VignetteHeading } from "./vignette-parts";

const TILE = "w-11 shrink-0";

// Must never render "S"/"D": row labels are user-renamed from those defaults.
const TIER_1 = { label: "Tier 1", index: 0 };
const TIER_2 = { label: "Tier 2", index: 1 };
const FRINGE = { label: "Fringe", index: 2 };

function TierRow({ tier, children }: { tier: typeof TIER_1; children: ReactNode }) {
  return (
    // No overflow-hidden: the tile animating in from the pool must pass over rows below.
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

function Tile({ url, className }: { url?: string; className?: string }) {
  if (!url) {
    return <span className={cn("aspect-card bg-muted rounded-[5%/3.6%]", TILE, className)} />;
  }
  return <MiniCardArt url={url} className={cn(TILE, className)} />;
}

// h-5 and the rounding are CountPill's; the real control is a CountPillButton,
// which nothing in a miniature may be.
const PILL = "text-2xs inline-flex h-5 max-w-11 items-center truncate rounded-md px-1.5 font-bold";

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

function RankPill() {
  return <span className={cn(PILL, "bg-muted text-muted-foreground")}>Rank</span>;
}

function PoolCell({
  url,
  tier,
  animate,
}: {
  url?: string;
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

// Ramp colours come from the shared `tierColor`, the same function the real
// board and the API's share image use; a hand-picked copy here would drift.
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
