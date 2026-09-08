import { Badge } from "@/components/ui/badge";
import { keywordAnchorSlug } from "@/features/rules/lib/glossary";
import type { KeywordRow } from "@/features/rules/lib/glossary-content";
import {
  CARD_TYPE_RULES,
  DOMAIN_RULES,
  SUPERTYPES,
  SYMBOLS,
} from "@/features/rules/lib/glossary-content";
import { matches } from "@/features/rules/lib/glossary-search";
import { getFilterIconPath } from "@/lib/icons";

import { GlossarySectionHeading, RuleRef } from "./glossary-shared";

export function DomainsSection({
  domains,
  query,
}: {
  domains: { slug: string; label: string; color?: string | null }[];
  query: string;
}) {
  const visible = domains.filter((domain) => matches(query, domain.label, domain.slug));
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <GlossarySectionHeading id="domains" title="Domains" />
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
          const domainIcon = getFilterIconPath("domains", domain.slug);
          const ruleNumber = DOMAIN_RULES[slug];
          return (
            <li key={domain.slug} className="flex items-center gap-3 rounded-md border p-3">
              {hasIcon && domainIcon && (
                <img
                  src={domainIcon}
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
                  {ruleNumber && <RuleRef ruleNumber={ruleNumber} />}
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

export function CardTypesSection({
  types,
  query,
}: {
  types: { slug: string; label: string }[];
  query: string;
}) {
  const visible = types.filter((cardType) => matches(query, cardType.label, cardType.slug));
  const visibleSupertypes = SUPERTYPES.filter((supertype) =>
    matches(query, supertype.label, supertype.slug, supertype.description),
  );
  if (visible.length === 0 && visibleSupertypes.length === 0) {
    return null;
  }
  const knownIcons = new Set(["battlefield", "gear", "legend", "rune", "spell", "unit"]);
  return (
    <section>
      <GlossarySectionHeading id="card-types" title="Card types" />
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
              const typeIcon = getFilterIconPath("types", cardType.slug);
              const ruleNumber = CARD_TYPE_RULES[slug];
              return (
                <li key={cardType.slug} className="flex items-center gap-3 rounded-md border p-3">
                  {hasIcon && typeIcon && (
                    <img
                      src={typeIcon}
                      alt={cardType.label}
                      width={32}
                      height={32}
                      className="size-8 shrink-0 brightness-0 dark:invert"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                    <span className="font-medium">{cardType.label}</span>
                    {ruleNumber && <RuleRef ruleNumber={ruleNumber} />}
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
            They mostly affect deckbuilding.
          </p>
          <ul className="mt-3 space-y-2">
            {visibleSupertypes.map((supertype) => {
              const supertypeIcon = getFilterIconPath("superTypes", supertype.slug);
              return (
                <li
                  key={supertype.slug}
                  className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-baseline sm:gap-3"
                >
                  <span className="flex items-center gap-2 font-medium sm:w-32 sm:shrink-0">
                    {supertypeIcon && (
                      <img
                        src={supertypeIcon}
                        alt=""
                        width={20}
                        height={20}
                        className="size-5 shrink-0 brightness-0 dark:invert"
                      />
                    )}
                    {supertype.label}
                  </span>
                  <p className="text-muted-foreground flex-1">{supertype.description}</p>
                  <RuleRef ruleNumber={supertype.ruleNumber} className="shrink-0" />
                </li>
              );
            })}
          </ul>
        </>
      )}
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

export function KeywordsSection({ keywords, query }: { keywords: KeywordRow[]; query: string }) {
  const visible = keywords.filter((kw) =>
    matches(query, kw.name, kw.info?.summary, kw.info?.ruleNumber),
  );
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <GlossarySectionHeading id="keywords" title="Keywords" />
      <p className="text-muted-foreground mt-2">
        Keywords are short words or phrases that stand in for a longer rule. They appear in card
        text in square brackets, like [Equip] or [Deathknell]. Tap a rule reference to jump to the
        full definition.
      </p>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {visible.map((kw) => (
          <li
            id={keywordAnchorSlug(kw.name)}
            key={kw.name}
            className="scroll-mt-20 rounded-md border p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <KeywordPill name={kw.name} color={kw.color} darkText={kw.darkText} />
              {kw.info?.ruleNumber && <RuleRef ruleNumber={kw.info.ruleNumber} />}
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

export function SymbolsSection({ query }: { query: string }) {
  const visible = SYMBOLS.filter((symbol) => matches(query, symbol.label, symbol.summary));
  if (visible.length === 0) {
    return null;
  }
  return (
    <section>
      <GlossarySectionHeading id="symbols" title="In-text symbols" />
      <p className="text-muted-foreground mt-2">
        Riftbound uses a small set of inline symbols on cards to express costs and core game
        concepts compactly.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {visible.map((sym) => (
          <li key={sym.key} className="flex items-start gap-3 rounded-md border p-3">
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
