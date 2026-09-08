import {
  BookOpenIcon,
  BoxIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InboxIcon,
  LayersIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { MiniCardArt, Vignette, VignetteHeading } from "./vignette-parts";

// Before/after counts must keep summing to the 842 the "All Cards" badge shows.
const COLLECTION_ROWS = [
  {
    icon: BookOpenIcon,
    name: "Main binder",
    was: 411,
    count: 413,
    active: true,
    receives: "a" as const,
  },
  { icon: BookOpenIcon, name: "Storage drawer", count: 220, active: false, receives: null },
  { icon: BookOpenIcon, name: "Shoe box", count: 148, active: false, receives: null },
  { icon: BoxIcon, name: "Azir Order", was: 60, count: 61, active: false, receives: "b" as const },
] as const;

const DROP_PHASE = {
  a: {
    until: "motion-safe:animate-collect-until-a",
    from: "motion-safe:animate-collect-from-a",
    ring: "motion-safe:animate-collect-drop-a",
  },
  b: {
    until: "motion-safe:animate-collect-until-b",
    from: "motion-safe:animate-collect-from-b",
    ring: "motion-safe:animate-collect-drop-b",
  },
} as const;

const SIDEBAR_ROW = "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm";
const SIDEBAR_ROW_ACTIVE = "bg-sidebar-accent text-sidebar-accent-foreground font-medium";

const COPY_LOCATIONS = [
  { name: "Main binder", count: 2 },
  { name: "Storage drawer", count: 1 },
  { name: "Azir Order", count: 1 },
] as const;

function DropCount({ was, now, phase }: { was: number; now: number; phase: "a" | "b" }) {
  return (
    <span className="inline-grid justify-items-end">
      <span
        className={cn("col-start-1 row-start-1 tabular-nums opacity-0", DROP_PHASE[phase].until)}
      >
        {was}
      </span>
      <span className={cn("col-start-1 row-start-1 tabular-nums", DROP_PHASE[phase].from)}>
        {now}
      </span>
    </span>
  );
}

// GHOST_FAN offsets are fractions of this.
const GHOST_WIDTH = 36;
const GHOST_FAN = [
  { x: 0, y: 0, rotate: 0 },
  { x: 0.107, y: -0.036, rotate: 6 },
  { x: 0.214, y: -0.018, rotate: 12 },
] as const;

function DragGhost({ urls, className }: { urls: readonly string[]; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-8 z-20 w-9 -translate-y-1/2"
    >
      <span className={cn("relative block opacity-0", urls.length <= 1 && "rotate-3", className)}>
        {urls.toReversed().map((url, reversedIndex) => {
          const index = urls.length - 1 - reversedIndex;
          const offset = GHOST_FAN[index] ?? GHOST_FAN[0];
          return (
            <span
              key={url}
              className={cn("w-full", index > 0 ? "absolute top-0 left-0" : "relative block")}
              style={{
                transform: `translate(${offset.x * GHOST_WIDTH}px, ${offset.y * GHOST_WIDTH}px) rotate(${offset.rotate}deg)`,
                zIndex: urls.length - index,
              }}
            >
              <MiniCardArt url={url} className="shadow-lg" />
            </span>
          );
        })}
        {urls.length > 1 && (
          <span className="bg-primary text-primary-foreground text-2xs absolute -top-1.5 -right-1.5 z-10 flex size-4 items-center justify-center rounded-full font-bold shadow">
            {urls.length}
          </span>
        )}
      </span>
    </span>
  );
}

function DropRing({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-primary/10 ring-primary/60 pointer-events-none absolute inset-0 rounded-md opacity-0 ring-2 ring-inset",
        className,
      )}
    />
  );
}

function CopyStepper({ count, strong }: { count: number; strong?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <span
        aria-hidden="true"
        className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}
      >
        <MinusIcon />
      </span>
      <span
        className={cn(
          "text-muted-foreground w-5 text-center tabular-nums",
          strong && "font-medium",
        )}
      >
        {count}
      </span>
      <span
        aria-hidden="true"
        className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}
      >
        <PlusIcon />
      </span>
    </div>
  );
}

function VariantHeaderRow({
  label,
  count,
  expanded,
  className,
}: {
  label: string;
  count: number;
  expanded?: boolean;
  className?: string;
}) {
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
  return (
    <div
      className={cn("bg-muted flex items-center gap-2 rounded-md px-1.5 py-0.5 text-sm", className)}
    >
      <div className="flex flex-1 items-center gap-1.5 whitespace-nowrap">
        <Chevron className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
        <span className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
          {label}
        </span>
      </div>
      <CopyStepper count={count} strong />
    </div>
  );
}

export function CollectionsVignette({ thumbnailUrls }: { thumbnailUrls: string[] }) {
  const ghosts = thumbnailUrls.slice(0, 3);
  return (
    <Vignette>
      <div className="flex flex-col gap-1">
        <div className={SIDEBAR_ROW}>
          <LayersIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">All Cards</span>
          <Badge variant="ghost" className="text-2xs ml-auto">
            842
          </Badge>
        </div>
        <VignetteHeading>Collections</VignetteHeading>
        <div className={cn(SIDEBAR_ROW, "relative")}>
          <InboxIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Inbox</span>
          <span className="ml-auto inline-grid justify-items-end">
            <Badge
              variant="default"
              className="text-2xs motion-safe:animate-collect-until-a col-start-1 row-start-1 opacity-0"
            >
              3
            </Badge>
            <Badge
              variant="default"
              className="text-2xs motion-safe:animate-collect-between col-start-1 row-start-1 opacity-0"
            >
              1
            </Badge>
          </span>
          {ghosts.length === 3 && (
            <>
              <DragGhost urls={ghosts.slice(0, 2)} className="motion-safe:animate-collect-fly-a" />
              <DragGhost urls={ghosts.slice(2, 3)} className="motion-safe:animate-collect-fly-b" />
            </>
          )}
        </div>
        {COLLECTION_ROWS.map((row) => (
          <div
            key={row.name}
            className={cn(SIDEBAR_ROW, "relative", row.active && SIDEBAR_ROW_ACTIVE)}
          >
            {row.receives !== null && <DropRing className={DROP_PHASE[row.receives].ring} />}
            <row.icon className="relative size-4 shrink-0" aria-hidden="true" />
            <span className="relative flex-1 truncate">{row.name}</span>
            <Badge variant="ghost" className="text-2xs relative ml-auto">
              {row.receives === null ? (
                row.count
              ) : (
                <DropCount was={row.was} now={row.count} phase={row.receives} />
              )}
            </Badge>
          </div>
        ))}
      </div>
      <div className="border-border/60 flex flex-col gap-1 border-t pt-4">
        <VignetteHeading>Copies of Hidden Blade</VignetteHeading>
        <VariantHeaderRow label="EN · OGN-213 · Standard" count={4} expanded />
        {COPY_LOCATIONS.map((row) => (
          <div
            key={row.name}
            className="flex items-center gap-2 rounded-md py-0.5 pr-1.5 pl-4 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
            <CopyStepper count={row.count} />
          </div>
        ))}
        <VariantHeaderRow label="EN · OGN-213 · Foil" count={1} className="mt-1.5" />
      </div>
    </Vignette>
  );
}
