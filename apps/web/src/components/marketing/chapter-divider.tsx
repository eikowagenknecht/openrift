import { Heading } from "@/components/heading";

import type { FeatureChapter } from "./features-chapters";
import { chapterAnchor } from "./features-chapters";
import { Reveal } from "./reveal";

export function ChapterDivider({ chapter }: { chapter: FeatureChapter }) {
  const Icon = chapter.icon;
  return (
    <section
      id={chapterAnchor(chapter.id)}
      // Asymmetric padding on purpose: the wide gap above separates it from the
      // previous chapter, the slim gap below attaches it to its own sections.
      className="relative scroll-mt-12 pt-16 pb-0 max-xl:scroll-mt-28 sm:pt-24"
    >
      <div
        aria-hidden="true"
        // The glow is the chapter's only backdrop, so it has to reach the
        // physical viewport edge rather than stopping at the page gutter and
        // drawing a hard vertical edge down the tint. Below `sm` the column is
        // the viewport, so the gutter is cancelled with a negative margin; from
        // `sm` up there is room to spill outwards instead.
        className="max-sm:mx-safe-neg pointer-events-none absolute inset-x-0 top-0 -z-10 h-full sm:-inset-x-10 lg:-inset-x-24"
        style={{
          backgroundImage: `radial-gradient(60% 90% at 18% 0%, ${chapter.glowColor}26 0%, transparent 65%)`,
        }}
      />
      <Reveal>
        <div className="flex flex-col items-start gap-4">
          <div className="text-primary font-heading flex items-center gap-2 text-sm font-semibold tracking-widest uppercase">
            <Icon aria-hidden="true" className="size-4" />
            {chapter.number}
          </div>
          <Heading level={1} as="h2" className="text-4xl sm:text-5xl">
            {chapter.title}
          </Heading>
          <p className="text-muted-foreground max-w-prose">{chapter.tagline}</p>
        </div>
      </Reveal>
    </section>
  );
}
