import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, CheckIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { ClipFrame, cornerClip } from "@/components/marketing/clip-frame";
import { Reveal } from "@/components/marketing/reveal";

import { HeroCtas } from "./hero-ctas";

const ROW_CLIP = cornerClip(12);

const SWITCH_POINTS = [
  "Free and open source. No ads, no paywall.",
  "Every printing and promo: English, Chinese, French, Korean.",
];

/**
 * Everything after the differentiator sections: the switcher band for visitors
 * who already keep a collection somewhere else, the way through to the full
 * feature tour, and the closing call to action.
 * @returns The landing page's closing section.
 */
export function LandingClosing() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 pb-20 md:gap-16 md:pb-28">
      <Reveal>
        <ClipFrame className="flex flex-col gap-5 p-8 md:p-12">
          <Heading level={1} as="h2">
            Switching? Bring your collection.
          </Heading>
          <span aria-hidden="true" className="bg-border-accent h-px w-8" />
          <p className="text-muted-foreground max-w-2xl leading-relaxed">
            Import a CSV from Piltover Archive, RiftCore, or RiftMana and you&rsquo;re set up in
            minutes. Export everything back out whenever you want. Your cards stay yours.
          </p>
          <ul className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-8">
            {SWITCH_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <CheckIcon aria-hidden="true" className="text-primary size-4 shrink-0" />
                {point}
              </li>
            ))}
          </ul>
          <Link
            to="/collections/import"
            className="text-primary group flex items-center gap-1.5 text-sm font-medium"
          >
            Import your collection
            <ArrowRightIcon
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </ClipFrame>
      </Reveal>

      <Reveal>
        <ClipFrame tone="border" cut={12} className="p-0">
          <Link
            to="/features"
            className="hover:bg-secondary group flex items-center justify-between gap-4 p-5 transition-colors"
            style={{ clipPath: ROW_CLIP }}
          >
            <span className="font-heading font-medium">See everything OpenRift does</span>
            <ArrowRightIcon
              aria-hidden="true"
              className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </ClipFrame>
      </Reveal>

      <Reveal className="flex flex-col items-center gap-4 text-center">
        <Heading level={1} as="h2" className="md:text-4xl">
          Ready when you are.
        </Heading>
        <span aria-hidden="true" className="bg-border-accent h-px w-8" />
        <HeroCtas />
      </Reveal>
    </section>
  );
}
