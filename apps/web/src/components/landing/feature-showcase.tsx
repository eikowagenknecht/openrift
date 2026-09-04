import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { Reveal } from "@/components/marketing/reveal";
import { ScanVignette } from "@/components/marketing/scan-vignette";
import { OrnamentRule } from "@/components/ui/ornament";
import type { LandingThumbnailCard } from "@/lib/landing-thumbnails";
import { cn } from "@/lib/utils";

import { GroupsVignette, ListsVignette, PricesVignette } from "./landing-vignettes";

/**
 * The landing page's four differentiator sections: what OpenRift does that a
 * visitor cannot already get elsewhere, one large alternating text-plus-vignette
 * block each. Vignettes are miniatures built from the app's real primitives
 * (badges, validation colors, viewfinder brackets, card thumbnails) so the
 * section shows the product instead of describing it.
 * @returns The feature showcase section.
 */
export function FeatureShowcase({
  scanCards,
  thumbnailUrls,
}: {
  /** The sampled printings the scanner vignette logs (landing-summary payload). */
  scanCards: LandingThumbnailCard[];
  /** Sampled art for the group cards' trade strips. */
  thumbnailUrls: string[];
}) {
  const features = [
    {
      title: "Scan cards with your camera",
      description:
        "Point your phone at a card and OpenRift recognizes the exact printing. Sort a fresh box into your collection in one sitting.",
      cta: "Open the scanner",
      to: "/scan",
      vignette: <ScanVignette cards={scanCards} />,
    },
    {
      title: "A collection that keeps itself current",
      description:
        "Track every copy across binders, deck boxes, and loans. Write a rule once, like every card missing for a playset, and your wishlist updates itself from then on.",
      cta: "Open collections",
      to: "/collections",
      vignette: <ListsVignette />,
    },
    {
      title: "See who has what you need",
      description:
        "Start a private group with your playgroup or store. OpenRift matches wishlists against tradelists and shows exactly who to talk to. The trade itself happens at the table.",
      cta: "Open groups",
      to: "/groups",
      vignette: <GroupsVignette thumbnailUrls={thumbnailUrls} />,
    },
    {
      title: "Know what your cards are worth",
      description:
        "Daily prices from TCGplayer, Cardmarket, and CardTrader side by side on every printing, with history charts and your collection's value tracked over time.",
      cta: "Open the catalog",
      to: "/cards",
      vignette: <PricesVignette />,
    },
  ] as const;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16 md:gap-24 md:py-24">
      {features.map((feature, index) => (
        <Reveal key={feature.title}>
          <Link
            to={feature.to}
            className="hover:bg-background/60 group grid items-center gap-8 rounded-2xl p-4 transition-colors sm:p-6 lg:grid-cols-2 lg:gap-14"
          >
            <div className={cn("flex flex-col gap-4", index % 2 === 1 && "lg:order-2")}>
              <Heading level={1} as="h2">
                {feature.title}
              </Heading>
              <OrnamentRule className="w-40" />
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              <span className="text-primary flex items-center gap-1.5 text-sm font-medium">
                {feature.cta}
                <ArrowRightIcon
                  aria-hidden="true"
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </div>
            <div className={cn(index % 2 === 1 && "lg:order-1")}>{feature.vignette}</div>
          </Link>
        </Reveal>
      ))}
    </section>
  );
}
