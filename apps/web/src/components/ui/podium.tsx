import { CrownIcon } from "lucide-react";
import type { ReactNode } from "react";

import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// Podium is the standings throne: the top three as seats, first place raised
// on the app's warm accent glow. It is the one module on a tournament page
// designed around having a winner, so it owns its own degenerate states rather
// than making call sites branch: no results yet renders ghost seats (hiding the
// module instead would shift the page's layout mid-event), and a field of one
// or two seats the same number of columns, centered.
//
// Ranks come from the caller and are rendered as given: a tie hands two seats
// `rank: 1` and both get the crown. The seat is presentation, the medal is
// the claim — the caller has already resolved the tie-break for the raised
// seat, and passes the deciding number as `hint`.

/**
 * The accent wash CoverBand and the heroes use, at the strength a surface wants
 * it. Exported so anything else that marks a winner reaches for this rather than
 * pasting a gradient that nearly matches. `strength` is the percentage of the
 * accent mixed into the wash.
 */
export function accentGlow(strength: number): string {
  return `radial-gradient(120% 90% at 50% 115%, color-mix(in oklab, var(--border-accent) ${strength}%, transparent), transparent 70%)`;
}

/** The winner's seat glow. */
const SEAT_GLOW = accentGlow(24);

export interface PodiumSeat {
  key: string;
  /** 1-based standing. Repeats on a tie; drives the medal, not the position. */
  rank: number;
  name: string;
  image?: string | null;
  gravatarHash?: string | null;
  /** The headline number (points). */
  score: ReactNode;
  /** The supporting line — wins, or the tie-break that decided the seat. */
  hint?: ReactNode;
}

const MEDAL_CLASS: Record<number, string> = {
  2: "bg-muted-foreground/40 text-foreground",
  3: "bg-amber-800/45 text-foreground dark:bg-amber-800/60",
};

// Over artwork the wash a plate sits on is the card, not the page, so the
// translucent silver and bronze turn to mud and their theme-following
// foregrounds can land on their own background. Both are restated as fixed
// pairs, which is also right in both themes because the art does not change
// with them.
const MEDAL_ON_ART_CLASS: Record<number, string> = {
  2: "bg-zinc-300 text-zinc-900",
  3: "bg-amber-700 text-amber-50",
};

/** The winner's crown tint, per surface: over art it needs its own shadow. */
const CROWN_CLASS: Record<MedalVariant, string> = {
  flat: "text-amber-500 dark:text-amber-400",
  onArt: "text-amber-300 drop-shadow-[0_1px_2px_rgb(0_0_0/0.7)]",
};

/** @returns The medal tint for a rank, falling back to the neutral chip. */
function medalClass(rank: number, variant: MedalVariant): string {
  if (variant === "onArt") {
    return MEDAL_ON_ART_CLASS[rank] ?? "bg-zinc-800 text-zinc-100";
  }
  return MEDAL_CLASS[rank] ?? "bg-muted text-muted-foreground";
}

/**
 * Where a medal is sitting. `onArt` is the overlay a deck tile or winner card
 * pins over its splash crop: an opaque plate with a shadow, so the numeral holds
 * against whatever the artwork puts behind it.
 */
export type MedalVariant = "flat" | "onArt";

/**
 * The display order for a row of seats: the winner is centered and the
 * runners-up flank it, so the row reads 2 · 1 · 3 rather than 1 · 2 · 3.
 */
function seatOrder<TSeat>(seats: readonly TSeat[]): TSeat[] {
  if (seats.length >= 3) {
    return [seats[1], seats[0], seats[2]];
  }
  if (seats.length === 2) {
    return [seats[1], seats[0]];
  }
  return [...seats];
}

const COLUMNS_CLASS: Record<number, string> = {
  1: "grid-cols-1 max-w-32",
  2: "grid-cols-2 max-w-64",
  3: "grid-cols-3",
};

/**
 * The rank chip: a crown for the winner, then silver, bronze, and a neutral
 * tint. Exported so the standings table can medal its top three from the same
 * tints as the throne, and so the archive's tiles can pin one over card art
 * with `variant="onArt"`.
 *
 * @returns The medal element.
 */
export function Medal({
  rank,
  variant = "flat",
  className,
}: {
  rank: number;
  variant?: MedalVariant;
  className?: string;
}) {
  if (rank === 1) {
    return (
      <span
        data-slot="medal"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center",
          CROWN_CLASS[variant],
          className,
        )}
      >
        <CrownIcon aria-hidden className="size-4.5 fill-current" />
        <span className="sr-only">1</span>
      </span>
    );
  }

  return (
    <span
      data-slot="medal"
      className={cn(
        "font-heading text-2xs flex size-5 shrink-0 items-center justify-center rounded-full font-bold tabular-nums",
        medalClass(rank, variant),
        variant === "onArt" && "shadow-md ring-1 ring-black/20",
        className,
      )}
    >
      {rank}
    </span>
  );
}

function Seat({ seat, raised }: { seat: PodiumSeat; raised: boolean }) {
  return (
    <div
      className={cn(
        "bg-muted/40 flex min-w-0 flex-col items-center gap-1 rounded-lg px-1.5 text-center",
        raised ? "ring-border-accent/40 py-4 ring-1" : "py-3",
      )}
      style={raised ? { backgroundImage: SEAT_GLOW } : undefined}
    >
      <Medal rank={seat.rank} />
      <UserAvatar name={seat.name} image={seat.image} gravatarHash={seat.gravatarHash} size="lg" />
      <span className="w-full truncate text-sm font-medium">{seat.name}</span>
      <span
        className={cn(
          "font-heading font-bold tabular-nums",
          raised ? "text-border-accent text-3xl" : "text-2xl",
        )}
      >
        {seat.score}
      </span>
      {seat.hint ? <span className="text-muted-foreground text-2xs">{seat.hint}</span> : null}
    </div>
  );
}

/** @returns One unfilled seat: the medal and an outlined avatar well. */
function GhostSeat({ rank }: { rank: number }) {
  return (
    <div className="bg-muted/40 flex flex-col items-center gap-1 rounded-lg px-1.5 py-3">
      <Medal rank={rank} className="opacity-40" />
      <span className="border-border size-10 rounded-full border border-dashed" />
    </div>
  );
}

/**
 * The standings throne. Pass the leaders already sorted and tie-broken; at most
 * three seats render. With no seats it renders its own empty state, so a
 * tournament before its first result keeps the module (and the page's layout)
 * in place.
 *
 * @returns The podium element.
 */
export function Podium({
  seats,
  emptyLabel = "No results yet.",
  className,
}: {
  seats: PodiumSeat[];
  /** Shown under the ghost seats while there are no results. */
  emptyLabel?: ReactNode;
  className?: string;
}) {
  const shown = seats.slice(0, 3);

  if (shown.length === 0) {
    return (
      <div data-slot="podium" className={cn("flex flex-col gap-2", className)}>
        <div className="grid grid-cols-3 items-end gap-2 opacity-75">
          <GhostSeat rank={2} />
          <GhostSeat rank={1} />
          <GhostSeat rank={3} />
        </div>
        <p className="text-muted-foreground text-center text-sm">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div
      data-slot="podium"
      className={cn(
        "mx-auto grid w-full items-end gap-2",
        COLUMNS_CLASS[shown.length] ?? COLUMNS_CLASS[3],
        className,
      )}
    >
      {seatOrder(shown).map((seat) => (
        <Seat key={seat.key} seat={seat} raised={seat.key === shown[0].key} />
      ))}
    </div>
  );
}
