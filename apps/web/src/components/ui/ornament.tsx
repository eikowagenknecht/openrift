import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type OrnamentFade = "both" | "tips";
export type OrnamentTone = "gold" | "silver";

/** Gold is the accent hairline; silver is for the black stage ground only. */
const TONE_CLASS: Record<OrnamentTone, string> = {
  gold: "text-border-accent",
  silver: "text-muted-foreground",
};

function Gem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" className={cn("size-3.5 shrink-0", className)} aria-hidden="true">
      <path
        d="M7 1 13 7 7 13 1 7Z"
        className="fill-none stroke-current"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <path d="M7 4 10 7 7 10 4 7Z" className="fill-current" />
    </svg>
  );
}

type OrnamentRuleProps = Omit<ComponentProps<"div">, "children"> & {
  /** `both` fades along the whole line; `tips` stays solid and fades only the last stretch, for a long labelled divider. */
  fade?: OrnamentFade;
  tone?: OrnamentTone;
  /** Rendered between two gems, in place of the single gem. */
  children?: ReactNode;
};

/**
 * The card-border rule: a hairline with a diamond gem. The width comes from
 * the caller (`w-40` under a heading, `w-full` as a divider).
 *
 * @returns The rule element.
 */
export function OrnamentRule({
  fade = "both",
  tone = "gold",
  className,
  children,
  ...props
}: OrnamentRuleProps) {
  const line = cn(
    "h-px flex-1 from-current to-transparent",
    fade === "tips" && "from-75%",
    TONE_CLASS[tone],
  );
  return (
    <div
      data-slot="ornament-rule"
      aria-hidden={children ? undefined : true}
      className={cn("flex items-center gap-2.5", className)}
      {...props}
    >
      <span className={cn(line, "bg-linear-to-l")} />
      <Gem className={TONE_CLASS[tone]} />
      {children && (
        <>
          {children}
          <Gem className={TONE_CLASS[tone]} />
        </>
      )}
      <span className={cn(line, "bg-linear-to-r")} />
    </div>
  );
}

// Only the diagonal and the echo are SVG. The side stub, the step and the base
// line are 1px divs, which the browser snaps to device pixels at fractional
// zoom; an SVG stroke is not, and two collinear runs then meet half a pixel apart.
function BaseCap({ mirror }: { mirror?: boolean }) {
  return (
    <svg
      viewBox="0 0 44 16"
      className={cn("absolute top-0 h-4 w-11", mirror ? "right-0 -scale-x-100" : "left-0")}
      aria-hidden="true"
    >
      <path d="M14 4.5L18 8.5" className="fill-none stroke-current" strokeWidth="1" />
      <path
        d="M0.5 7.5H9L13 11.5H22"
        className="fill-none stroke-current opacity-55"
        strokeWidth="1"
      />
    </svg>
  );
}

// The panel surface follows the step: side, step at 4.5, diagonal onto the line.
const SURFACE_CLIP =
  "polygon(0 0, 100% 0, 100% 4.5px, calc(100% - 14px) 4.5px, calc(100% - 17.5px) 100%, 17.5px 100%, 14px 4.5px, 0 4.5px)";

type OrnamentBaseProps = Omit<ComponentProps<"div">, "children"> & {
  tone?: OrnamentTone;
  /** Background of the medallion, matching the surface it sits on. */
  plateClassName?: string;
  /** Background of the panel above, carried down to the base line. */
  surfaceClassName?: string;
  /** Icon inside the medallion; a gem when omitted. */
  children?: ReactNode;
};

/**
 * The card-border base: the bottom edge of a text box or panel, stepping
 * toward the panel near the ends, with a medallion in the middle. The panel
 * above drops its own bottom edge and draws its side hairlines in the tone
 * color; the caps continue them.
 *
 * @returns The base element.
 */
export function OrnamentBase({
  tone = "gold",
  plateClassName = "bg-card",
  surfaceClassName,
  className,
  children,
  ...props
}: OrnamentBaseProps) {
  return (
    <div
      data-slot="ornament-base"
      aria-hidden="true"
      className={cn("relative flex h-5 items-start justify-center", TONE_CLASS[tone], className)}
      {...props}
    >
      {surfaceClassName && (
        <span
          data-slot="ornament-surface"
          className={cn("absolute inset-x-0 top-0 h-2", surfaceClassName)}
          style={{ clipPath: SURFACE_CLIP }}
        />
      )}
      <span className="absolute top-0 left-0 h-1 w-px bg-current" />
      <span className="absolute top-0 right-0 h-1 w-px bg-current" />
      <span className="absolute top-1 left-0 h-px w-3.5 bg-current" />
      <span className="absolute top-1 right-0 h-px w-3.5 bg-current" />
      <span className="absolute inset-x-4 top-2 h-px bg-current" />
      <BaseCap />
      <BaseCap mirror />
      <span
        className={cn(
          "relative -mt-1 flex size-6 items-center justify-center rounded-full border border-current",
          plateClassName,
        )}
      >
        {children ?? <Gem className="size-2.5" />}
      </span>
    </div>
  );
}

const CORNER_CLASS = {
  tl: "top-0 left-0",
  tr: "top-0 right-0 -scale-x-100",
  bl: "bottom-0 left-0 -scale-y-100",
} as const;

/**
 * Corner brackets for a hairline frame: a chamfer with an inner echo on three
 * corners, leaving the frame's corner cut as the fourth. The parent must be
 * `relative`; the wedge takes the surface color behind the frame.
 *
 * @returns The three corner elements.
 */
export function OrnamentCorners({
  tone = "gold",
  wedgeClassName = "fill-background",
}: {
  tone?: OrnamentTone;
  wedgeClassName?: string;
}) {
  return (
    <>
      {(Object.keys(CORNER_CLASS) as (keyof typeof CORNER_CLASS)[]).map((corner) => (
        <svg
          key={corner}
          viewBox="0 0 26 26"
          className={cn(
            "pointer-events-none absolute size-[26px]",
            TONE_CLASS[tone],
            CORNER_CLASS[corner],
          )}
          aria-hidden="true"
        >
          <path d="M0 0H12L0 12Z" className={wedgeClassName} />
          <path d="M0.5 12L12 0.5" className="fill-none stroke-current" strokeWidth="1" />
          <path
            d="M5.5 26V14L14 5.5H26"
            className="fill-none stroke-current opacity-55"
            strokeWidth="0.75"
          />
        </svg>
      ))}
    </>
  );
}
