import type { ReactNode } from "react";

import { Heading } from "@/components/heading";

import { SectionRule } from "./feature-section";
import { Reveal } from "./reveal";

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
    // min-w-0: without it the offscreen size-contained section's intrinsic
    // width becomes the grid item's auto minimum, and the card grid overflows.
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
        <div className="mt-auto pt-2">{action}</div>
      </section>
    </Reveal>
  );
}
