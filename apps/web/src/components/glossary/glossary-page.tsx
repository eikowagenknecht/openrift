import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { initQueryOptions } from "@/hooks/use-init";
import type { KeywordEntry } from "@/lib/glossary";
import { KEYWORD_INFO, keywordAnchorSlug } from "@/lib/glossary";
import { cn, PAGE_PADDING } from "@/lib/utils";

interface Section {
  id: string;
  title: string;
}

const SECTIONS: Section[] = [
  { id: "domains", title: "Domains" },
  { id: "card-types", title: "Card types" },
  { id: "rarities", title: "Rarities" },
  { id: "keywords", title: "Keywords" },
  { id: "symbols", title: "In-text symbols" },
  { id: "numbering", title: "Card numbering" },
];

function matches(query: string, ...fields: (string | undefined | null)[]): boolean {
  if (!query) {
    return true;
  }
  const needle = query.toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

function SectionHeading({ id, title }: Section) {
  return (
    <h2
      id={id}
      className="border-border mt-8 scroll-mt-20 border-b pb-1 text-xl font-bold first:mt-0"
    >
      {title}
    </h2>
  );
}

function GlossaryToc() {
  return (
    <nav className="space-y-0.5">
      {SECTIONS.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="text-muted-foreground hover:text-foreground block truncate font-semibold"
        >
          {section.title}
        </a>
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
        Domains define a card&apos;s identity and what runes can pay its costs. Your Champion
        Legend&apos;s domains determine your deck&apos;s domain identity.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((domain) => {
          const slug = domain.slug.toLowerCase();
          const hasIcon = slug !== "colorless";
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
              <div className="font-medium" style={domain.color ? { color: domain.color } : {}}>
                {domain.label}
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
  if (visible.length === 0) {
    return null;
  }
  const knownIcons = new Set(["battlefield", "gear", "legend", "rune", "spell", "unit"]);
  return (
    <section>
      <SectionHeading id="card-types" title="Card types" />
      <p className="text-muted-foreground mt-2">
        Every card has a type that determines where and when it can be played.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((cardType) => {
          const slug = cardType.slug.toLowerCase();
          const hasIcon = knownIcons.has(slug);
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
              <span className="font-medium">{cardType.label}</span>
            </li>
          );
        })}
      </ul>
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
        Each printing has a rarity, indicated by a coloured glyph on the card.
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
        Keywords are shorthand for longer rules text. Tap a rule reference to read the full
        definition.
      </p>
      <ul className="mt-4 space-y-3">
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
                  to="/rules"
                  hash={`rule-${kw.info.ruleNumber}`}
                  className="text-primary hover:underline"
                >
                  See Rule {kw.info.ruleNumber} →
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

function SymbolsSection({ query }: { query: string }) {
  const symbols = [
    {
      key: "might",
      label: "Might",
      summary: "A unit's combat power. Used to deal and assign damage in combat.",
      icon: "/images/glyphs/might.svg",
    },
    {
      key: "exhaust",
      label: "Exhaust",
      summary: "A tapped/spent state. Many activated abilities require exhausting a card to pay.",
      icon: "/images/glyphs/exhaust.svg",
    },
    {
      key: "rune-rainbow",
      label: "Power (any domain)",
      summary: "Marked [A], can be paid with a rune of any domain.",
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
        These glyphs appear inline in card text and costs.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {visible.map((sym) => (
          <li key={sym.key} className="border-border flex items-start gap-3 rounded-md border p-3">
            <img
              src={sym.icon}
              alt={sym.label}
              width={32}
              height={32}
              className="size-8 shrink-0 brightness-0 dark:invert"
            />
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
      summary: "Set code (Origins) followed by the printed card number.",
    },
    {
      pattern: "OGN-120a",
      summary: "Lowercase suffix marks an alternate art variant of the same base card.",
    },
    {
      pattern: "OGN-T1",
      summary: "T prefix indicates a token printed for the set.",
    },
    {
      pattern: "OGN-R1",
      summary: "R prefix indicates a rune printed for the set.",
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
        Card numbers combine a three-letter set code with a number and optional suffix.
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

  return (
    <div className={cn("mx-auto w-full max-w-6xl", PAGE_PADDING)}>
      <h1 className="text-2xl font-bold">Glossary</h1>
      <p className="text-muted-foreground mt-1">
        Riftbound symbols, keywords, and shorthand. Keyword entries link into the official rules.
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
        <div className="min-w-0 flex-1 space-y-6">
          <DomainsSection domains={domains} query={query} />
          <CardTypesSection types={cardTypes} query={query} />
          <RaritiesSection rarities={rarities} query={query} />
          <KeywordsSection keywords={keywordRows} query={query} />
          <SymbolsSection query={query} />
          <NumberingSection query={query} />
        </div>
      </div>
    </div>
  );
}
