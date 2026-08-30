import { Heading } from "@/components/heading";
import { cn, PAGE_WIDTH } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";
import { SectionRule } from "./feature-section";
import type { FeatureChapter } from "./features-chapters";
import { chapterAnchor } from "./features-chapters";
import { smoothAnchorClick } from "./features-nav";
import { MiniCardArt } from "./vignette-parts";

const SPREAD_CARD_WIDTH = 100;

const TRUST_POINTS = ["Fast", "Free", "No ads", "Open source"];

const SPREAD = [
  { left: 0, top: 32, rotate: -9 },
  { left: 70, top: 16, rotate: -2 },
  { left: 140, top: 28, rotate: 6 },
  { left: 210, top: 48, rotate: 13 },
];

/**
 * The container is fixed-size so the spread can arrive with the catalog query
 * without moving the headline beside it.
 */
function CardFlourish({ urls }: { urls: string[] }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative hidden h-60 w-[310px] shrink-0 select-none lg:block"
    >
      {SPREAD.map((slot, index) => {
        const url = urls[index];
        if (!url) {
          return null;
        }
        return (
          <span
            key={slot.left}
            className="absolute block"
            style={{
              left: slot.left,
              top: slot.top,
              width: SPREAD_CARD_WIDTH,
              transform: `rotate(${slot.rotate}deg)`,
            }}
          >
            <MiniCardArt url={url} />
          </span>
        );
      })}
    </div>
  );
}

function ChapterTile({ chapter }: { chapter: FeatureChapter }) {
  return (
    <ClipFrame tone="border" cut={12} className="h-full p-0">
      <a
        href={`#${chapterAnchor(chapter.id)}`}
        onClick={smoothAnchorClick}
        className="hover:bg-secondary focus-visible:ring-ring flex h-full flex-col gap-1.5 p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
      >
        <span className="flex items-center gap-2">
          <span className="text-primary font-heading text-xs font-semibold">{chapter.number}</span>
          <chapter.icon className="text-primary size-4" aria-hidden="true" />
        </span>
        <span className="font-heading leading-tight font-medium">{chapter.title}</span>
        <span className="text-muted-foreground line-clamp-2 text-xs">
          {chapter.features.map((feature) => feature.label).join(" · ")}
        </span>
      </a>
    </ClipFrame>
  );
}

export function FeaturesHero({
  chapters,
  thumbnailUrls,
}: {
  chapters: FeatureChapter[];
  /** Card art thumbnails from the landing summary, already full URLs. May be empty until the query resolves. */
  thumbnailUrls: string[];
}) {
  return (
    // Full-bleed band: the gradient spans the viewport while the inner column
    // matches the page column exactly, so the hero never reads as its own width.
    <section className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "var(--hero-glow)" }}
      />
      <div
        className={cn(
          PAGE_WIDTH.capped,
          "px-safe relative flex flex-col gap-8 pt-8 pb-10 sm:pt-12 sm:pb-14",
        )}
      >
        <div className="flex items-start justify-between gap-10">
          <div className="flex flex-col items-start gap-4">
            {/* The page's h1 is the "Features" title in the top bar. */}
            <Heading level={1} as="h2" className="text-4xl md:text-5xl">
              Everything OpenRift does
            </Heading>
            <SectionRule />
            <p className="text-muted-foreground max-w-prose">
              Your collection, your decks, and your game nights, in one app.
            </p>
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {TRUST_POINTS.map((point, index) => (
                <li key={point} className="flex items-center gap-x-3">
                  {index > 0 && (
                    <span aria-hidden="true" className="bg-border-accent size-1 rotate-45" />
                  )}
                  <span className="font-heading text-sm font-medium">{point}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground max-w-prose">
              Coming from another app?{" "}
              <a
                href="#import"
                onClick={smoothAnchorClick}
                className="text-primary focus-visible:ring-ring font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                Importing your collection takes a minute
              </a>
              .
            </p>
          </div>
          <CardFlourish urls={thumbnailUrls} />
        </div>
        <nav
          aria-label="Chapter overview"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          {chapters.map((chapter) => (
            <ChapterTile key={chapter.id} chapter={chapter} />
          ))}
        </nav>
      </div>
    </section>
  );
}
