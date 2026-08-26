import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { cn } from "@/lib/utils";

import { Reveal } from "./reveal";

/** The gold hairline that sits under every marketing heading. */
export function SectionRule() {
  return <span aria-hidden="true" className="bg-border-accent h-px w-8" />;
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
}: {
  id: string;
  title: string;
  description: string;
  action: ReactNode;
  vignette: ReactNode;
  /** Puts the vignette on the left from `lg` up, so sections alternate. */
  flip?: boolean;
}) {
  return (
    <Reveal>
      {/* content-visibility keeps the 19 sections' looping vignette animations
          from rendering while offscreen; the intrinsic size stops the scrollbar
          from jumping as sections enter. Anchor jumps force rendering on their
          own, so the TOC links still land correctly. */}
      <section
        id={id}
        className="grid items-center gap-8 py-14 [contain-intrinsic-size:auto_640px] [content-visibility:auto] sm:py-20 lg:min-h-[70svh] lg:grid-cols-2 lg:gap-16"
      >
        <div className={cn("flex flex-col items-start gap-4", flip && "lg:order-2")}>
          <Heading level={1} as="h2" className={FEATURE_HEADING_CLASS}>
            {title}
          </Heading>
          <SectionRule />
          <p className="text-muted-foreground max-w-prose">{description}</p>
          {action}
        </div>
        <div className={cn("min-w-0", flip && "lg:order-1")}>{vignette}</div>
      </section>
    </Reveal>
  );
}
