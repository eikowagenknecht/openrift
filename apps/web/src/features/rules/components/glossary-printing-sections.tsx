import { Link } from "@tanstack/react-router";

import {
  ART_VARIANT_DESCRIPTIONS,
  FINISH_DESCRIPTIONS,
  PACK_SLOTS,
  PRINTING_DETAILS,
} from "@/features/rules/lib/glossary-content";
import { matches } from "@/features/rules/lib/glossary-search";
import { getFilterIconPath } from "@/lib/icons";

import { GlossarySectionHeading } from "./glossary-shared";

export function RaritiesSection({
  rarities,
  query,
}: {
  rarities: { slug: string; label: string; color?: string | null }[];
  query: string;
}) {
  const visible = rarities.filter((rarity) => matches(query, rarity.label, rarity.slug));
  if (visible.length === 0) {
    return null;
  }
  const withImage = new Set(["common", "uncommon", "rare", "epic", "showcase"]);
  return (
    <section>
      <GlossarySectionHeading id="rarities" title="Rarities" />
      <p className="text-muted-foreground mt-2">
        Every printing has a rarity, shown by the coloured glyph in the middle of the card face.
        Rarity reflects how often a card appears in booster packs and the visual treatment of its
        frame, not its strength in play. The Showcase tier is reserved for premium full-art and
        alternative-art printings.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((rarity) => {
          const slug = rarity.slug.toLowerCase();
          const rarityIcon = getFilterIconPath("rarities", rarity.slug);
          return (
            <li key={rarity.slug} className="flex items-center gap-3 rounded-md border p-3">
              {withImage.has(slug) && rarityIcon && (
                <img
                  src={rarityIcon}
                  alt={rarity.label}
                  width={28}
                  height={28}
                  className="size-7 shrink-0"
                />
              )}
              <span className="font-medium" style={rarity.color ? { color: rarity.color } : {}}>
                {rarity.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BoosterPacksSection({ query }: { query: string }) {
  const visible = PACK_SLOTS.filter((slot) => matches(query, slot.label, slot.description));
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <GlossarySectionHeading id="booster-packs" title="Booster pack contents" />
      <p className="text-muted-foreground mt-2">
        A standard Riftbound booster contains 14 cards across five slot types. The{" "}
        <Link to="/pack-opener" className="text-primary hover:underline">
          Pack opener
        </Link>{" "}
        simulates this same distribution.
      </p>
      <ul className="mt-4 space-y-2">
        {visible.map((slot) => (
          <li
            key={slot.label}
            className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-baseline sm:gap-3"
          >
            <span className="font-medium sm:w-36 sm:shrink-0">{slot.label}</span>
            <p className="text-muted-foreground">{slot.description}</p>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-3">
        Headline rates come from Riot&apos;s Origins announcement. Foil-slot and cascade rates are
        community estimates.
      </p>
    </section>
  );
}

export function ArtVariantsSection({
  artVariants,
  query,
}: {
  artVariants: { slug: string; label: string }[];
  query: string;
}) {
  const visible = artVariants.filter((variant) => {
    const description = ART_VARIANT_DESCRIPTIONS[variant.slug.toLowerCase()];
    return matches(query, variant.label, variant.slug, description);
  });
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <GlossarySectionHeading id="art-variants" title="Art variants" />
      <p className="text-muted-foreground mt-2">
        An art variant describes which illustration appears on a printing. Alt-art printings are
        usually marked by a lowercase letter suffix on the card number, like OGN-120a.
      </p>
      <ul className="mt-4 space-y-2">
        {visible.map((variant) => (
          <li
            key={variant.slug}
            className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-baseline sm:gap-3"
          >
            <span className="font-medium sm:w-32 sm:shrink-0">{variant.label}</span>
            <p className="text-muted-foreground">
              {ART_VARIANT_DESCRIPTIONS[variant.slug.toLowerCase()] ?? ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FinishesSection({
  finishes,
  query,
}: {
  finishes: { slug: string; label: string }[];
  query: string;
}) {
  const visible = finishes.filter((finish) => {
    const description = FINISH_DESCRIPTIONS[finish.slug.toLowerCase()];
    return matches(query, finish.label, finish.slug, description);
  });
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <GlossarySectionHeading id="finishes" title="Finishes" />
      <p className="text-muted-foreground mt-2">
        Finish describes the physical production treatment of a printing. Most cards use a normal
        cardstock finish, foil printings add a glossy reflective coating across the card face, and a
        small number have been released as premium metal collectibles. Finish is independent of
        rarity and art variant, so the same artwork can exist as both a normal and a foil printing.
      </p>
      <ul className="mt-4 space-y-2">
        {visible.map((finish) => (
          <li
            key={finish.slug}
            className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-baseline sm:gap-3"
          >
            <span className="font-medium sm:w-32 sm:shrink-0">{finish.label}</span>
            <p className="text-muted-foreground">
              {FINISH_DESCRIPTIONS[finish.slug.toLowerCase()] ?? ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MarkersSection({
  markers,
  query,
}: {
  markers: { slug: string; label: string; description: string | null }[];
  query: string;
}) {
  const visible = markers.filter((marker) =>
    matches(query, marker.label, marker.slug, marker.description ?? undefined),
  );
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <GlossarySectionHeading id="markers" title="Markers" />
      <p className="text-muted-foreground mt-2">
        Markers describe how a printing was distributed rather than what&apos;s on the card. They
        cover promotional channels like prereleases, tournaments, judge programs, and store-level
        events, and a single printing can carry more than one.
      </p>
      <ul className="mt-4 space-y-2">
        {visible.map((marker) => (
          <li
            key={marker.slug}
            className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-baseline sm:gap-3"
          >
            <span className="font-medium sm:w-36 sm:shrink-0">{marker.label}</span>
            <p className="text-muted-foreground">
              {marker.description ?? <span className="italic">No description yet.</span>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PrintingDetailsSection({ query }: { query: string }) {
  const visible = PRINTING_DETAILS.filter((item) => matches(query, item.label, item.description));
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <GlossarySectionHeading id="artist-and-signature" title="Artist and signature" />
      <p className="text-muted-foreground mt-2">
        Artist credit is tracked per printing so reprints can preserve the original illustrator, and
        the signature flag marks printings where the artist&apos;s signature is overlaid on the
        artwork (usually on a foil alt-art or Ultimate variant).
      </p>
      <ul className="mt-4 space-y-2">
        {visible.map((item) => (
          <li
            key={item.key}
            className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-baseline sm:gap-3"
          >
            <span className="font-medium sm:w-32 sm:shrink-0">{item.label}</span>
            <p className="text-muted-foreground">{item.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
