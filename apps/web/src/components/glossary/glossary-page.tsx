import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { initQueryOptions } from "@/hooks/use-init";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type { KeywordEntry } from "@/lib/glossary";
import { KEYWORD_INFO, keywordAnchorSlug } from "@/lib/glossary";
import { cn, PAGE_PADDING } from "@/lib/utils";

interface Section {
  id: string;
  title: string;
}

interface Group {
  id: string;
  title: string;
  sections: Section[];
}

const GROUPS: Group[] = [
  {
    id: "game-vocabulary",
    title: "Game vocabulary",
    sections: [
      { id: "domains", title: "Domains" },
      { id: "card-types", title: "Card types" },
      { id: "keywords", title: "Keywords" },
      { id: "symbols", title: "In-text symbols" },
    ],
  },
  {
    id: "printing-variants",
    title: "Printing variants",
    sections: [
      { id: "rarities", title: "Rarities" },
      { id: "art-variants", title: "Art variants" },
      { id: "finishes", title: "Finishes" },
      { id: "markers", title: "Markers" },
      { id: "artist-and-signature", title: "Artist and signature" },
    ],
  },
  {
    id: "sets-and-numbering",
    title: "Sets and numbering",
    sections: [
      { id: "sets", title: "Sets" },
      { id: "numbering", title: "Card numbering" },
    ],
  },
];

const DOMAIN_RULES: Record<string, string> = {
  fury: "134.2.a",
  calm: "134.2.b",
  mind: "134.2.c",
  body: "134.2.d",
  chaos: "134.2.e",
  order: "134.2.f",
};

const CARD_TYPE_RULES: Record<string, string> = {
  unit: "140",
  gear: "147",
  spell: "152",
  rune: "159",
  battlefield: "168",
  legend: "172",
};

interface SupertypeEntry {
  slug: string;
  label: string;
  description: string;
  ruleNumber: string;
}

const SUPERTYPE_ICONS = new Set(["champion"]);

const SUPERTYPES: SupertypeEntry[] = [
  {
    slug: "champion",
    label: "Champion",
    description: "Applies exclusively to Units. Determines who can be your Chosen Champion.",
    ruleNumber: "133.7.a",
  },
  {
    slug: "signature",
    label: "Signature",
    description: "Can apply to any card type. Limited to 3 per deck, tied to your Champion's tag.",
    ruleNumber: "133.7.b",
  },
  {
    slug: "token",
    label: "Token",
    description: "Temporary game objects created by effects, not part of a deck.",
    ruleNumber: "133.7.c",
  },
];

const ART_VARIANT_DESCRIPTIONS: Record<string, string> = {
  normal: "Standard art for the printing.",
  altart:
    "An additional artwork using the same card name and rarity. Distinguished by a lowercase letter suffix on the card number (e.g. 120a).",
  overnumbered:
    "Reprinted art with a card number that exceeds the printed set total — typically a special variant slotted into a later set.",
  ultimate:
    "A premium full-art treatment. The card itself usually keeps its original rarity (e.g. Showcase) — Ultimate describes the artwork, not the rarity.",
};

const FINISH_DESCRIPTIONS: Record<string, string> = {
  normal: "Standard cardstock with no special treatment.",
  foil: "Glossy foil finish across the card face.",
  metal: "Premium metal-stamped collectible printing.",
  "metal-deluxe": "Higher-tier metal printing with extra finishing.",
};

interface MarkerEntry {
  slug: string;
  label: string;
  description: string;
}

const MARKERS: MarkerEntry[] = [
  {
    slug: "promo",
    label: "Promo",
    description:
      "Catch-all promo printing — typically given out at events or bundled with retail products.",
  },
  {
    slug: "champion",
    label: "Champion",
    description: "Awarded to winners of regional and national competitive events.",
  },
  {
    slug: "summoner",
    label: "Summoner",
    description:
      "Distributed through Summoner's Skirmish events for participation, top-8, or 1st-place finishes.",
  },
  {
    slug: "regional",
    label: "Tournament",
    description:
      "Distributed through regional and national tournaments. Tiers include participation, top-8, 1st place, prize wall, and best-of.",
  },
  {
    slug: "launch-exclusive",
    label: "Launch",
    description: "Given out at the launch event for a set.",
  },
  {
    slug: "origins",
    label: "Origins",
    description: "Distributed through Origins-tied events such as Nexus Night and Pre-Rift.",
  },
  {
    slug: "judge",
    label: "Judge",
    description: "Awarded through the Judge program for officials running sanctioned events.",
  },
  {
    slug: "city",
    label: "City Challenge",
    description: "Distributed through monthly City Challenge events at participating stores.",
  },
  {
    slug: "participation",
    label: "Participation",
    description:
      "A participation-tier promo within a larger event series (e.g. Summoner, Regional, National).",
  },
  {
    slug: "prerelease",
    label: "Prerelease",
    description: "Given out at prerelease events ahead of a new set's launch.",
  },
];

function matches(query: string, ...fields: (string | undefined | null)[]): boolean {
  if (!query) {
    return true;
  }
  const needle = query.toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

function GroupHeading({ id, title }: { id: string; title: string }) {
  return (
    <h2 id={id} className="scroll-mt-20 text-xl font-bold">
      {title}
    </h2>
  );
}

function SectionHeading({ id, title }: Section) {
  return (
    <h3 id={id} className="mt-8 scroll-mt-20 text-lg font-semibold">
      {title}
    </h3>
  );
}

function GlossaryToc() {
  return (
    <nav className="space-y-4">
      {GROUPS.map((group) => (
        <div key={group.id}>
          <a
            href={`#${group.id}`}
            className="text-foreground hover:text-primary block truncate font-bold"
          >
            {group.title}
          </a>
          <div className="mt-1 space-y-0.5 pl-3">
            {group.sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-muted-foreground hover:text-foreground block truncate"
              >
                {section.title}
              </a>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function DomainsSection({
  domains,
  query,
}: {
  domains: { slug: string; label: string; color?: string | null }[];
  query: string;
}) {
  const visible = domains.filter((d) => matches(query, d.label, d.slug));
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <SectionHeading id="domains" title="Domains" />
      <p className="text-muted-foreground mt-2">
        Riftbound has six domains, each with its own colour and symbol: Fury, Calm, Mind, Body,
        Chaos, and Order. A card&apos;s domain is shown by glyphs in the lower-right corner of the
        card, and runes of that domain produce the Power needed to pay its costs. Your Champion
        Legend&apos;s domains determine your deck&apos;s Domain Identity, which limits which other
        cards you can include.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((domain) => {
          const slug = domain.slug.toLowerCase();
          const hasIcon = slug !== "colorless";
          const ruleNumber = DOMAIN_RULES[slug];
          return (
            <li
              key={domain.slug}
              className="border-border flex items-center gap-3 rounded-md border p-3"
            >
              {hasIcon && (
                <img
                  src={`/images/domains/${slug}.webp`}
                  alt={domain.label}
                  width={40}
                  height={40}
                  className="size-10 shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium" style={domain.color ? { color: domain.color } : {}}>
                    {domain.label}
                  </div>
                  {ruleNumber && (
                    <Link
                      to="/rules/$kind"
                      params={{ kind: "core" }}
                      hash={`rule-${ruleNumber}`}
                      className="text-primary text-xs hover:underline"
                    >
                      Rule {ruleNumber} →
                    </Link>
                  )}
                </div>
                {hasIcon && (
                  <img
                    src={`/images/glyphs/rune-${slug}.svg`}
                    alt={`${domain.label} rune`}
                    title={`${domain.label} rune cost glyph`}
                    width={20}
                    height={20}
                    className="mt-1 size-5"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CardTypesSection({
  types,
  query,
}: {
  types: { slug: string; label: string }[];
  query: string;
}) {
  const visible = types.filter((t) => matches(query, t.label, t.slug));
  const visibleSupertypes = SUPERTYPES.filter((s) =>
    matches(query, s.label, s.slug, s.description),
  );
  if (visible.length === 0 && visibleSupertypes.length === 0) {
    return null;
  }
  const knownIcons = new Set(["battlefield", "gear", "legend", "rune", "spell", "unit"]);
  return (
    <section>
      <SectionHeading id="card-types" title="Card types" />
      {visible.length > 0 && (
        <>
          <p className="text-muted-foreground mt-2">
            A card&apos;s type tells you how and where it interacts with the game. Units fight on
            battlefields, Gear attaches to a Unit you control, Spells resolve their effects and
            leave play, Runes sit in your Rune Pool to produce Energy and Power, Battlefields are
            the locations Units fight over, and Legends sit beside your deck and represent your
            Champion.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((cardType) => {
              const slug = cardType.slug.toLowerCase();
              const hasIcon = knownIcons.has(slug);
              const ruleNumber = CARD_TYPE_RULES[slug];
              return (
                <li
                  key={cardType.slug}
                  className="border-border flex items-center gap-3 rounded-md border p-3"
                >
                  {hasIcon && (
                    <img
                      src={`/images/types/${slug}.svg`}
                      alt={cardType.label}
                      width={32}
                      height={32}
                      className="size-8 shrink-0 brightness-0 dark:invert"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                    <span className="font-medium">{cardType.label}</span>
                    {ruleNumber && (
                      <Link
                        to="/rules/$kind"
                        params={{ kind: "core" }}
                        hash={`rule-${ruleNumber}`}
                        className="text-primary text-xs hover:underline"
                      >
                        Rule {ruleNumber} →
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {visibleSupertypes.length > 0 && (
        <>
          <h4 className="mt-6 text-base font-semibold">Supertypes</h4>
          <p className="text-muted-foreground mt-1">
            Supertypes apply on top of a card&apos;s type and are listed before it on the card face.
            They mostly affect deckbuilding: Champions are Units eligible to be your Chosen
            Champion, Signature cards are tied to a Champion&apos;s tag and capped at three per
            deck, and Tokens are temporary game objects created by effects rather than included in a
            deck.
          </p>
          <ul className="mt-3 space-y-2">
            {visibleSupertypes.map((supertype) => {
              const hasIcon = SUPERTYPE_ICONS.has(supertype.slug);
              return (
                <li
                  key={supertype.slug}
                  className="border-border flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-baseline sm:gap-3"
                >
                  <span className="flex items-center gap-2 font-medium sm:w-32 sm:shrink-0">
                    {hasIcon && (
                      <img
                        src={`/images/supertypes/${supertype.slug}.svg`}
                        alt=""
                        width={20}
                        height={20}
                        className="size-5 shrink-0 brightness-0 dark:invert"
                      />
                    )}
                    {supertype.label}
                  </span>
                  <p className="text-muted-foreground flex-1">{supertype.description}</p>
                  <Link
                    to="/rules/$kind"
                    params={{ kind: "core" }}
                    hash={`rule-${supertype.ruleNumber}`}
                    className="text-primary shrink-0 text-xs hover:underline"
                  >
                    Rule {supertype.ruleNumber} →
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function RaritiesSection({
  rarities,
  query,
}: {
  rarities: { slug: string; label: string; color?: string | null }[];
  query: string;
}) {
  const visible = rarities.filter((r) => matches(query, r.label, r.slug));
  if (visible.length === 0) {
    return null;
  }
  const withImage = new Set(["common", "uncommon", "rare", "epic", "showcase"]);
  return (
    <section>
      <SectionHeading id="rarities" title="Rarities" />
      <p className="text-muted-foreground mt-2">
        Every printing has a rarity, shown by the coloured glyph in the middle of the card face.
        Rarity reflects how often a card appears in booster packs and the visual treatment of its
        frame, not its strength in play. The five tiers run from Common up through Uncommon, Rare,
        and Epic to Showcase, which is reserved for premium full-art and alternative-art printings.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((rarity) => {
          const slug = rarity.slug.toLowerCase();
          return (
            <li
              key={rarity.slug}
              className="border-border flex items-center gap-3 rounded-md border p-3"
            >
              {withImage.has(slug) && (
                <img
                  src={`/images/rarities/${slug}-28x28.webp`}
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

function ArtVariantsSection({
  artVariants,
  query,
}: {
  artVariants: { slug: string; label: string }[];
  query: string;
}) {
  const visible = artVariants.filter((v) => {
    const description = ART_VARIANT_DESCRIPTIONS[v.slug.toLowerCase()];
    return matches(query, v.label, v.slug, description);
  });
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <SectionHeading id="art-variants" title="Art variants" />
      <p className="text-muted-foreground mt-2">
        An art variant describes which illustration appears on a printing, and it&apos;s a separate
        axis from rarity. The same card can be a Showcase rarity and have an Ultimate art variant at
        the same time, because the rarity glyph and the artwork are tracked independently. Alt-art
        printings are usually marked by a lowercase letter suffix on the card number, like OGN-120a.
      </p>
      <ul className="mt-4 space-y-2">
        {visible.map((variant) => (
          <li
            key={variant.slug}
            className="border-border flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-baseline sm:gap-3"
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

function FinishesSection({
  finishes,
  query,
}: {
  finishes: { slug: string; label: string }[];
  query: string;
}) {
  const visible = finishes.filter((f) => {
    const description = FINISH_DESCRIPTIONS[f.slug.toLowerCase()];
    return matches(query, f.label, f.slug, description);
  });
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <SectionHeading id="finishes" title="Finishes" />
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
            className="border-border flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-baseline sm:gap-3"
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

function MarkersSection({ query }: { query: string }) {
  const visible = MARKERS.filter((m) => matches(query, m.label, m.slug, m.description));
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <SectionHeading id="markers" title="Markers" />
      <p className="text-muted-foreground mt-2">
        Markers describe how a printing was distributed rather than what&apos;s on the card. They
        cover promotional channels like prereleases, tournaments, judge programs, and store-level
        events, and a single printing can carry more than one. Markers sit alongside rarity and
        finish, so the same artwork can ship as both a regular Common and a Tournament-marked
        Common.
      </p>
      <ul className="mt-4 space-y-2">
        {visible.map((marker) => (
          <li
            key={marker.slug}
            className="border-border flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-baseline sm:gap-3"
          >
            <span className="font-medium sm:w-36 sm:shrink-0">{marker.label}</span>
            <p className="text-muted-foreground">{marker.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface SetEntry {
  slug: string;
  name: string;
  releasedAt: string | null;
  released: boolean;
  setType: "main" | "supplemental";
  cardCount: number;
}

function PrintingDetailsSection({ query }: { query: string }) {
  const items = [
    {
      key: "artist",
      label: "Artist",
      description:
        "Illustrator credit printed on the card. Tracked per printing so reprints can credit the original artist.",
    },
    {
      key: "signature",
      label: "Signature",
      description:
        "A printing flag indicating the card carries the artist's signature, usually overlaid on a foil alt-art or Ultimate variant.",
    },
  ];
  const visible = items.filter((i) => matches(query, i.label, i.description));
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <SectionHeading id="artist-and-signature" title="Artist and signature" />
      <p className="text-muted-foreground mt-2">
        Artist credit is tracked per printing so reprints can preserve the original illustrator, and
        the signature flag marks printings where the artist&apos;s signature is overlaid on the
        artwork (usually on a foil alt-art or Ultimate variant).
      </p>
      <ul className="mt-4 space-y-2">
        {visible.map((item) => (
          <li
            key={item.key}
            className="border-border flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-baseline sm:gap-3"
          >
            <span className="font-medium sm:w-32 sm:shrink-0">{item.label}</span>
            <p className="text-muted-foreground">{item.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SetsSection({ sets, query }: { sets: SetEntry[]; query: string }) {
  const visible = sets.filter((s) => matches(query, s.slug, s.name, s.setType));
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <SectionHeading id="sets" title="Sets" />
      <p className="text-muted-foreground mt-2">
        Sets are how Riftbound releases new cards. Each set has a three-letter code that prefixes
        every card number in it, and is classified as either a main set (the regular release
        cadence) or a supplemental set (smaller drops outside the main schedule). Browse the full
        catalogue of any set on the{" "}
        <Link to="/sets" className="text-primary hover:underline">
          Sets page
        </Link>
        .
      </p>
      <ul className="mt-4 grid gap-2 lg:grid-cols-2">
        {visible.map((set) => (
          <li key={set.slug} className="border-border rounded-md border p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <code className="bg-muted shrink-0 rounded px-2 py-0.5 font-mono">{set.slug}</code>
              <Link
                to="/sets/$setSlug"
                params={{ setSlug: set.slug }}
                className="font-medium hover:underline"
              >
                {set.name}
              </Link>
              <span className="text-muted-foreground capitalize">{set.setType}</span>
              {!set.released && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                  Unreleased
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {set.cardCount} {set.cardCount === 1 ? "card" : "cards"}
              {set.releasedAt && ` · released ${set.releasedAt}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function KeywordPill({
  name,
  color,
  darkText,
}: {
  name: string;
  color?: string | null;
  darkText?: boolean;
}) {
  return (
    <Badge
      style={
        color
          ? {
              backgroundColor: color,
              color: darkText ? "#1a1a1a" : "#ffffff",
            }
          : undefined
      }
      variant={color ? "default" : "secondary"}
    >
      {name}
    </Badge>
  );
}

interface KeywordRow {
  name: string;
  color?: string | null;
  darkText?: boolean;
  info?: KeywordEntry;
}

function KeywordsSection({ keywords, query }: { keywords: KeywordRow[]; query: string }) {
  const visible = keywords.filter((kw) =>
    matches(query, kw.name, kw.info?.summary, kw.info?.ruleNumber),
  );
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <SectionHeading id="keywords" title="Keywords" />
      <p className="text-muted-foreground mt-2">
        Keywords are short words or phrases that stand in for a longer rule. They appear in card
        text in square brackets, like [Equip] or [Deathknell], and each one expands to a paragraph
        in the comprehensive rules. Tap a rule reference to jump to the full definition.
      </p>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {visible.map((kw) => (
          <li
            id={keywordAnchorSlug(kw.name)}
            key={kw.name}
            className="border-border scroll-mt-20 rounded-md border p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <KeywordPill name={kw.name} color={kw.color} darkText={kw.darkText} />
              {kw.info?.ruleNumber && (
                <Link
                  to="/rules/$kind"
                  params={{ kind: "core" }}
                  hash={`rule-${kw.info.ruleNumber}`}
                  className="text-primary text-xs hover:underline"
                >
                  Rule {kw.info.ruleNumber} →
                </Link>
              )}
            </div>
            {kw.info?.summary ? (
              <p className="text-muted-foreground mt-2">{kw.info.summary}</p>
            ) : (
              <p className="text-muted-foreground mt-2 italic">No summary available yet.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface SymbolEntry {
  key: string;
  label: string;
  summary: string;
  icon?: string;
}

function SymbolsSection({ query }: { query: string }) {
  const symbols: SymbolEntry[] = [
    {
      key: "might",
      label: "Might",
      summary: "A unit's combat power. Higher Might deals more damage and is harder to remove.",
      icon: "/images/glyphs/might.svg",
    },
    {
      key: "might-bonus",
      label: "Might bonus",
      summary:
        "A boxed Might value on Gear, indicating how much Might the gear adds to its equipped unit.",
    },
    {
      key: "exhaust",
      label: "Exhaust",
      summary:
        "Turning a card, rune, or legend sideways to use it. Once exhausted, it can't be exhausted again until something readies it.",
      icon: "/images/glyphs/exhaust.svg",
    },
    {
      key: "recycle",
      label: "Recycle",
      summary:
        "Place a card or rune from the board onto the bottom of its deck. Often used to pay Power costs.",
    },
    {
      key: "power-activation",
      label: "Power activation",
      summary:
        "Exhaust a rune of a specific domain to add its Power to your Rune Pool, then spend it to pay costs.",
    },
    {
      key: "energy",
      label: "Energy cost",
      summary:
        "Pay Energy by exhausting any rune, regardless of domain. Shown as a numeric cost on the card.",
    },
    {
      key: "rune-rainbow",
      label: "Power (any domain)",
      summary:
        "Marked [A]. A Power cost that can be paid with a rune of any domain — this is the wild Power symbol.",
      icon: "/images/glyphs/rune-rainbow.svg",
    },
  ];
  const visible = symbols.filter((s) => matches(query, s.label, s.summary));
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <SectionHeading id="symbols" title="In-text symbols" />
      <p className="text-muted-foreground mt-2">
        Riftbound uses a small set of inline symbols on cards to express costs and core game
        concepts compactly. Energy costs can be paid with any rune, Power costs require a rune of a
        specific domain, and the rainbow [A] symbol stands in for Power of any domain. Other symbols
        describe game actions like Exhaust and Recycle, or stats like Might.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {visible.map((sym) => (
          <li key={sym.key} className="border-border flex items-start gap-3 rounded-md border p-3">
            {sym.icon ? (
              <img
                src={sym.icon}
                alt={sym.label}
                width={32}
                height={32}
                className="size-8 shrink-0 brightness-0 dark:invert"
              />
            ) : (
              <div className="size-8 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <div className="font-medium">{sym.label}</div>
              <p className="text-muted-foreground">{sym.summary}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NumberingSection({ query }: { query: string }) {
  const items = [
    {
      pattern: "OGN-001",
      summary: "Set code followed by the printed card number.",
    },
    {
      pattern: "OGN-120a",
      summary:
        "A lowercase letter suffix marks an alt-art variant of the same base card. Distinct from the Showcase rarity, which is shown by the rarity glyph in the middle of the card.",
    },
    {
      pattern: "OGN-224",
      summary:
        "A number above the set's printed total is an Overnumbered variant — usually a special reprint slotted into a later set.",
    },
    {
      pattern: "SFD-T01",
      summary:
        "T prefix indicates a token printed for the set. T and R prefixes were introduced with Spiritforged; Origins used standard numbering for tokens and runes.",
    },
    {
      pattern: "SFD-R01",
      summary: "R prefix indicates a rune printed for the set (introduced in Spiritforged).",
    },
  ];
  const visible = items.filter((i) => matches(query, i.pattern, i.summary));
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <SectionHeading id="numbering" title="Card numbering" />
      <p className="text-muted-foreground mt-2">
        Every printing has a short code combining the three-letter set code with a card number, like
        OGN-007. Letter suffixes mark variants of the same base card (usually an alternative
        artwork), and a number above the set&apos;s printed total marks an Overnumbered variant.
        Starting with Spiritforged, T and R prefixes mark tokens and runes printed alongside the
        set; earlier sets used plain numbers for those.
      </p>
      <ul className="mt-4 space-y-2">
        {visible.map((item) => (
          <li key={item.pattern} className="border-border flex gap-3 rounded-md border p-3">
            <code className="bg-muted shrink-0 self-start rounded px-2 py-0.5 font-mono">
              {item.pattern}
            </code>
            <p className="text-muted-foreground">{item.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GlossaryPage() {
  const { data: init } = useSuspenseQuery(initQueryOptions);
  const { data: setList } = useSuspenseQuery(publicSetListQueryOptions);
  const [query, setQuery] = useState("");

  const keywordRows = useMemo<KeywordRow[]>(() => {
    const rows: KeywordRow[] = [];
    const seen = new Set<string>();
    for (const [name, entry] of Object.entries(init.keywords ?? {})) {
      seen.add(name);
      rows.push({
        name,
        color: entry.color,
        darkText: entry.darkText,
        info: KEYWORD_INFO[name],
      });
    }
    for (const name of Object.keys(KEYWORD_INFO)) {
      if (!seen.has(name)) {
        rows.push({ name, info: KEYWORD_INFO[name] });
      }
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [init.keywords]);

  const domains = init.enums.domains ?? [];
  const rarities = init.enums.rarities ?? [];
  const cardTypes = init.enums.cardTypes ?? [];
  const artVariants = init.enums.artVariants ?? [];
  const finishes = init.enums.finishes ?? [];
  const sets: SetEntry[] = (setList.sets ?? []).map((s) => ({
    slug: s.slug,
    name: s.name,
    releasedAt: s.releasedAt,
    released: s.released,
    setType: s.setType,
    cardCount: s.cardCount,
  }));

  return (
    <div className={cn("mx-auto w-full max-w-6xl", PAGE_PADDING)}>
      <h1 className="text-2xl font-bold">Glossary</h1>
      <p className="text-muted-foreground mt-1">
        A reference for the terms, symbols, and printing details you&apos;ll see on Riftbound cards
        and across OpenRift. Entries link to the comprehensive rules where there&apos;s more to
        read.
      </p>

      <div className="relative mt-4 mb-4 max-w-md">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the glossary..."
          className="pl-9"
        />
      </div>

      <div className="flex gap-6">
        <aside className="hidden w-48 shrink-0 lg:block">
          <div className="sticky top-16">
            <GlossaryToc />
          </div>
        </aside>
        <div className="min-w-0 flex-1 space-y-12">
          <section>
            <GroupHeading id="game-vocabulary" title="Game vocabulary" />
            <DomainsSection domains={domains} query={query} />
            <CardTypesSection types={cardTypes} query={query} />
            <KeywordsSection keywords={keywordRows} query={query} />
            <SymbolsSection query={query} />
          </section>
          <section>
            <GroupHeading id="printing-variants" title="Printing variants" />
            <RaritiesSection rarities={rarities} query={query} />
            <ArtVariantsSection artVariants={artVariants} query={query} />
            <FinishesSection finishes={finishes} query={query} />
            <MarkersSection query={query} />
            <PrintingDetailsSection query={query} />
          </section>
          <section>
            <GroupHeading id="sets-and-numbering" title="Sets and numbering" />
            <SetsSection sets={sets} query={query} />
            <NumberingSection query={query} />
          </section>
        </div>
      </div>
    </div>
  );
}
