import type { ReactNode } from "react";

import { Heading } from "@/components/heading";

import { SectionRule } from "./feature-section";
import { Reveal } from "./reveal";

/**
 * A supporting feature, rendered two-up beside a sibling. Deliberately not a
 * boxed tile: every vignette is a ClipFrame already, and framing one inside a
 * second frame reads as a double border. The grid supplies the structure, so
 * the card is FeatureSection's column at a smaller tier.
 */
export function FeatureCard({
  id,
  title,
  description,
  action,
  vignette,
}: {
  id: string;
  title: string;
  description: string;
  action: ReactNode;
  vignette?: ReactNode;
}) {
  return (
    // min-w-0: the section below is size-contained while offscreen, so its
    // intrinsic width (420px) is what a grid item reports as its automatic
    // minimum. Left at `auto` that number, not the viewport, sizes the column
    // and the card grid runs off the side of a phone.
    <Reveal className="h-full min-w-0">
      <section
        id={id}
        className="flex h-full scroll-mt-12 flex-col items-start gap-3 [contain-intrinsic-size:auto_420px] [content-visibility:auto] max-xl:scroll-mt-28"
      >
        <Heading level={2} as="h3">
          {title}
        </Heading>
        <SectionRule />
        <p className="text-muted-foreground max-w-prose text-sm">{description}</p>
        {vignette && <div className="w-full min-w-0 pt-1">{vignette}</div>}
        {/* mt-auto lands the action links of a row on one line, whatever the
            vignettes above them measure. */}
        <div className="mt-auto pt-2">{action}</div>
      </section>
    </Reveal>
  );
}
