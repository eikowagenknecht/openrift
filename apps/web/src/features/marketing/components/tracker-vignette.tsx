import { DicesIcon, Settings2Icon, ShieldIcon, SparklesIcon, SwordsIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { deckGlowStyle } from "@/lib/domain";
import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

const POINTS_TARGET = 8;

const VIGNETTE_STYLE = {
  backgroundImage: "radial-gradient(120% 80% at 50% 50%, transparent 34%, var(--color-card) 100%)",
  opacity: 0.7,
};

const MEDALLIONS: { reason: string; icon: LucideIcon }[] = [
  { reason: "conquer", icon: SwordsIcon },
  { reason: "hold", icon: ShieldIcon },
  { reason: "ability", icon: SparklesIcon },
];

function Pips({ points }: { points: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: POINTS_TARGET }, (_, index) => (
        <i
          key={index}
          className={cn(
            "h-0.5 w-2 rounded-full",
            index < points ? "bg-primary" : "bg-foreground/15",
          )}
        />
      ))}
    </span>
  );
}

function Panel({
  name,
  points,
  domains,
  art,
  rotated,
  scoring,
}: {
  name: string;
  points: number;
  domains: string[];
  art?: string;
  rotated?: boolean;
  scoring?: boolean;
}) {
  return (
    <section
      aria-label={`${name} scorepad`}
      className={cn(
        "bg-card relative flex h-32 min-w-0 flex-col items-center justify-between overflow-hidden rounded-lg border p-2",
        rotated && "rotate-180",
      )}
    >
      {art && (
        <img
          src={art}
          alt=""
          aria-hidden="true"
          loading="lazy"
          draggable={false}
          className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-md saturate-125 dark:opacity-40"
        />
      )}
      <div aria-hidden="true" className="absolute inset-0" style={deckGlowStyle(domains)} />
      <div aria-hidden="true" className="absolute inset-0" style={VIGNETTE_STYLE} />

      <span className="text-muted-foreground text-2xs relative w-full truncate text-center font-semibold tracking-wide uppercase">
        {name}
      </span>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5">
        {scoring ? (
          <span className="grid justify-items-center">
            <span className="font-heading motion-safe:animate-tracker-before col-start-1 row-start-1 text-5xl leading-none font-bold tabular-nums">
              {points}
            </span>
            <span className="font-heading motion-safe:animate-tracker-after col-start-1 row-start-1 text-5xl leading-none font-bold tabular-nums opacity-0">
              {points + 1}
            </span>
          </span>
        ) : (
          <span className="font-heading text-5xl leading-none font-bold tabular-nums">
            {points}
          </span>
        )}
        {scoring ? (
          <span className="grid justify-items-center">
            <span className="motion-safe:animate-tracker-before col-start-1 row-start-1">
              <Pips points={points} />
            </span>
            <span className="motion-safe:animate-tracker-after col-start-1 row-start-1 opacity-0">
              <Pips points={points + 1} />
            </span>
          </span>
        ) : (
          <Pips points={points} />
        )}
      </div>

      <div className="relative flex items-start justify-center gap-2.5">
        {MEDALLIONS.map((medallion, index) => (
          <span
            key={medallion.reason}
            className={cn(
              "border-border-accent grid size-8 place-items-center rounded-full border bg-black/35",
              scoring && index === 0 && "motion-safe:animate-tracker-tap",
            )}
          >
            <medallion.icon className="text-primary size-3.5" aria-hidden="true" />
          </span>
        ))}
      </div>

      <span
        aria-hidden="true"
        className="border-border/60 text-muted-foreground/60 text-2xs absolute top-1/2 left-1 grid h-7 w-5 -translate-y-1/2 place-items-center rounded-full border bg-black/20 font-bold tracking-wide"
      >
        XP
      </span>
    </section>
  );
}

export function TrackerVignette({ thumbnailUrls = [] }: { thumbnailUrls?: string[] }) {
  return (
    <ClipFrame className="p-5">
      <div className="relative flex flex-col gap-2">
        <Panel name="Alice" points={3} domains={["calm", "order"]} art={thumbnailUrls[0]} rotated />
        <Panel name="Max" points={4} domains={["chaos", "fury"]} art={thumbnailUrls[1]} scoring />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center gap-2">
          <span className="bg-popover grid size-8 place-items-center rounded-full border shadow-sm">
            <DicesIcon className="size-4" aria-hidden="true" />
          </span>
          <span className="bg-popover grid size-8 place-items-center rounded-full border shadow-sm">
            <Settings2Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </ClipFrame>
  );
}
