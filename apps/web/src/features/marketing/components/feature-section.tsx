import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { OrnamentRule } from "@/components/ui/ornament";
import { cn } from "@/lib/utils";

import { Reveal } from "./reveal";

export function SectionRule() {
  return <OrnamentRule className="w-40" />;
}

export const FEATURE_ACTION_CLASS =
  "text-primary focus-visible:ring-ring group inline-flex items-center gap-1.5 text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none";

export const FEATURE_HEADING_CLASS = "text-2xl sm:text-4xl";

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
  /** Puts the vignette on the left from `lg` up. */
  flip?: boolean;
  /** Widens the vignette column. */
  emphasis?: boolean;
  /** Small label above the title. */
  eyebrow?: string;
  /** Drops the viewport-height floor and tightens the padding. */
  compact?: boolean;
}) {
  return (
    // content-visibility pauses offscreen vignette animations; the intrinsic
    // size keeps the scrollbar from jumping as sections enter.
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
