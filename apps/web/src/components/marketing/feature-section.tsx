import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { OrnamentRule } from "@/components/ui/ornament";
import { cn } from "@/lib/utils";

import { Reveal } from "./reveal";

/** The gold rule that sits under every marketing heading. */
export function SectionRule() {
  return <OrnamentRule className="w-40" />;
}

/**
 * Class for the quiet "Open X" link that closes a feature section. Applied to
 * a `Link` or an `<a>` at the call site so each destination stays type-checked
 * against the route tree.
 */
export const FEATURE_ACTION_CLASS =
  "text-primary focus-visible:ring-ring group inline-flex items-center gap-1.5 text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none";

/**
 * Section headings on the marketing tour. One tier above the page title from
 * `sm` up, so a section fills its own viewport instead of reading as a card in
 * a stack. Both sizes are on the scale in docs/typography.md.
 */
export const FEATURE_HEADING_CLASS = "text-2xl sm:text-4xl";

/** The arrow that trails a {@link FEATURE_ACTION_CLASS} link. */
export function ActionArrow() {
  return (
    <ArrowRightIcon
      aria-hidden="true"
      className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
    />
  );
}

export function FeatureSection({
  id,
  title,
  description,
  action,
  vignette,
  flip,
  emphasis,
  eyebrow,
  compact,
}: {
  id: string;
  title: string;
  description: string;
  action: ReactNode;
  vignette: ReactNode;
  /** Puts the vignette on the left from `lg` up, so sections alternate. */
  flip?: boolean;
  /** Widens the vignette column for the one or two showpiece sections. */
  emphasis?: boolean;
  /** Small label above the title, for a section that is one step of a sequence. */
  eyebrow?: string;
  /**
   * Drops the viewport-height floor and tightens the padding. For a run of
   * sections telling one story: at full height each step floats in its own
   * screen of empty space and the run reads as unrelated features.
   */
  compact?: boolean;
}) {
  return (
    // content-visibility keeps the looping vignette animations from rendering
    // while offscreen; the intrinsic size stops the scrollbar from jumping as
    // sections enter. Anchor jumps force rendering on their own, so the TOC
    // links still land correctly.
    <section
      id={id}
      className={cn(
        "grid scroll-mt-12 items-center gap-8 [contain-intrinsic-size:auto_640px] [content-visibility:auto] max-xl:scroll-mt-28 lg:gap-16",
        compact ? "py-6 sm:py-8" : "py-10 sm:py-14 lg:min-h-[60svh]",
        emphasis ? (flip ? "lg:grid-cols-[3fr_2fr]" : "lg:grid-cols-[2fr_3fr]") : "lg:grid-cols-2",
      )}
    >
      <Reveal className={cn("flex flex-col items-start gap-4", flip && "lg:order-2")}>
        {eyebrow ? (
          <span className="text-muted-foreground font-heading text-xs font-semibold tracking-wide uppercase">
            {eyebrow}
          </span>
        ) : null}
        <Heading level={1} as="h2" className={FEATURE_HEADING_CLASS}>
          {title}
        </Heading>
        <SectionRule />
        <p className="text-muted-foreground max-w-prose">{description}</p>
        {action}
      </Reveal>
      <Reveal delayMs={150} className={cn("min-w-0", flip && "lg:order-1")}>
        {vignette}
      </Reveal>
    </section>
  );
}
