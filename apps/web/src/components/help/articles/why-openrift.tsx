import {
  ArrowRightLeftIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleHelpIcon,
  Code2Icon,
  HammerIcon,
  HeartIcon,
  SparklesIcon,
  SproutIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import { DefinitionList, DefinitionRow } from "@/components/help/definition-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SOCIAL_LINKS } from "@/lib/social-links";
import { cn } from "@/lib/utils";

export default function WhyOpenRiftArticle() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Why this exists</h2>
        <div className="text-muted-foreground space-y-3">
          <p>Honestly? I just wanted to track my collection.</p>
          <p>
            I tried what was already out there, but each site fell short in a different way. One was
            missing cards. Another felt slow every time I pulled it up on my phone and sometimes
            dropped cards mid-edit. A third had every feature you could want, but the basics
            didn&apos;t feel solid underneath.
          </p>
          <p>
            And nothing really worked well on both desktop and mobile. Don&apos;t get me wrong,
            there are great mobile apps, but they just don&apos;t sync with anything you can use at
            a desk.
          </p>
          <p>
            So naturally, after a full week of patient, rigorous evaluation, I did the only
            reasonable thing and built my own from scratch. OpenRift is on its way to being the card
            browser I wanted to use. Below is a side-by-side comparison so you can judge for
            yourself.
          </p>
        </div>
      </section>

      <p className="text-muted-foreground">
        This comparison reflects my opinions as of mid-2026, not marketing. Features change and I
        may have missed things. If you believe something is inaccurate, please{" "}
        <a
          href="mailto:support@openrift.app"
          className="text-primary hover:underline"
          rel="noreferrer"
        >
          send me an email
        </a>{" "}
        so I can correct it or add more info.
      </p>

      {/* What this site is (and isn't) */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">What this site is (and isn&apos;t)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<Code2Icon className="size-4" />}
            title="Open source"
            description={
              <>
                Full source code on{" "}
                <a
                  href={SOCIAL_LINKS.githubRepo}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  GitHub
                </a>{" "}
                under AGPL-3.0. Inspect, fork, self-host, or open an issue. I read every single one.
              </>
            }
          />
          <FeatureCard
            icon={<ArrowRightLeftIcon className="size-4" />}
            title="No lock-in"
            description="Import and export collections and decks in formats any other tool can read. If OpenRift ever stops working for you, taking your data elsewhere is easy."
          />
          <FeatureCard
            icon={<HeartIcon className="size-4" />}
            title="Community, not social network"
            description="Small private groups, list sharing, and trading between members are all here, with more ideas in the works. No forums though, or anything else that needs full-time content moderation."
          />
          <FeatureCard
            icon={<SparklesIcon className="size-4" />}
            title="No AI gimmicks"
            description="No AI deck suggestions or natural language search. I don't think everything needs AI shoehorned into it, though I do use it to build the site."
          />
        </div>
      </section>

      {/* Where OpenRift is catching up */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Where OpenRift is catching up</h2>
        <p className="text-muted-foreground mb-3">
          Beyond the feature gaps below, there are two things a table can&apos;t capture:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <GapCard
            icon={<SproutIcon className="size-4" />}
            title="New kid on the block"
            description="Every Riftbound player knows Piltover Archive. OpenRift doesn't have that recognition or the network effects yet. Join now and you can tell your grandchildren you were here before it was cool."
          />
          <GapCard
            icon={<HammerIcon className="size-4" />}
            title="Not battle-tested"
            description="Every feature here works, but 'works' and 'has been stress-tested by 10,000 users for one year' are not the same thing. Expect the occasional rough edge."
          />
        </div>
      </section>

      <Alert className="border-primary/20 bg-primary/5">
        <AlertDescription className="text-foreground">
          One thing the table below can&apos;t show: I have a long list of ideas no other Riftbound
          app has yet. Those are the features I&apos;m most excited to build.
        </AlertDescription>
      </Alert>

      {/* Comparison table */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Feature comparison</h2>
        <p className="text-muted-foreground mb-3">
          The table compares OpenRift against the four most popular Riftbound card browsers, the
          ones you&apos;re most likely to have tried. A checkmark means the feature is available; a
          half circle means partial support; an X means not available; a question mark means
          I&apos;m not sure.
        </p>
        <p className="text-muted-foreground mb-3">
          OpenRift&apos;s own rows were last refreshed on 2026-07-01. The competitor counts and
          features were last verified on 2026-05-27 and may have drifted since. When you&apos;re
          reading this, it&apos;s probably already slightly out of date, as counts and features
          change regularly.
        </p>

        {/* Desktop: full table */}
        <div className="border-border hidden overflow-x-auto rounded-lg border md:block">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th className="w-1/3 px-3 py-2.5 text-left font-medium">Feature</th>
                <th className="bg-primary/5 px-3 py-2.5 text-center font-medium">
                  <span className="text-primary">OpenRift</span>
                </th>
                <th className="px-3 py-2.5 text-center font-medium">Piltover Archive</th>
                <th className="px-3 py-2.5 text-center font-medium">Riftbound.gg</th>
                <th className="px-3 py-2.5 text-center font-medium">Riftmana</th>
                <th className="px-3 py-2.5 text-center font-medium">Riftcore</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {COMPARISON_ITEMS.map((item) =>
                item.kind === "section" ? (
                  <ComparisonSection key={`section-${item.title}`} title={item.title} />
                ) : (
                  <ComparisonRow
                    key={`row-${item.feature}`}
                    feature={item.feature}
                    values={item.values}
                    detail={item.detail}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: stacked cards */}
        <div className="space-y-3 md:hidden">
          {COMPARISON_ITEMS.map((item) =>
            item.kind === "section" ? (
              <ComparisonMobileSection key={`section-${item.title}`} title={item.title} />
            ) : (
              <ComparisonMobileCard
                key={`row-${item.feature}`}
                feature={item.feature}
                values={item.values}
                detail={item.detail}
              />
            ),
          )}
        </div>
      </section>

      {/* Tech stack */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Tech stack</h2>
        <p className="text-muted-foreground mb-3">
          For the technically curious, or if you&apos;re thinking about contributing:
        </p>
        <DefinitionList>
          <DefinitionRow label="Runtime">
            <TechLink href="https://bun.com">Bun</TechLink>
          </DefinitionRow>
          <DefinitionRow label="Language">
            <TechLink href="https://www.typescriptlang.org">TypeScript</TechLink> end-to-end, linted
            with <TechLink href="https://oxc.rs">oxlint + oxfmt</TechLink>
          </DefinitionRow>
          <DefinitionRow label="Frontend">
            <TechLink href="https://react.dev">React 19</TechLink> with React Compiler, built with{" "}
            <TechLink href="https://vite.dev">Vite</TechLink>
          </DefinitionRow>
          <DefinitionRow label="TanStack">
            <TechLink href="https://tanstack.com/start">Start</TechLink> (SSR),{" "}
            <TechLink href="https://tanstack.com/router">Router</TechLink>,{" "}
            <TechLink href="https://tanstack.com/query">Query</TechLink>,{" "}
            <TechLink href="https://tanstack.com/db">DB</TechLink>,{" "}
            <TechLink href="https://tanstack.com/table">Table</TechLink>,{" "}
            <TechLink href="https://tanstack.com/virtual">Virtual</TechLink>,{" "}
            <TechLink href="https://tanstack.com/hotkeys">Hotkeys</TechLink>
          </DefinitionRow>
          <DefinitionRow label="UI">
            <TechLink href="https://tailwindcss.com">Tailwind CSS</TechLink> +{" "}
            <TechLink href="https://ui.shadcn.com">shadcn/ui</TechLink> +{" "}
            <TechLink href="https://base-ui.com">BaseUI</TechLink> primitives
          </DefinitionRow>
          <DefinitionRow label="State & forms">
            <TechLink href="https://zustand.docs.pmnd.rs">Zustand</TechLink>,{" "}
            <TechLink href="https://react-hook-form.com">React Hook Form</TechLink>,{" "}
            <TechLink href="https://zod.dev">Zod</TechLink>
          </DefinitionRow>
          <DefinitionRow label="Backend">
            <TechLink href="https://hono.dev">Hono</TechLink> +{" "}
            <TechLink href="https://orpc.unnoq.com">oRPC</TechLink> +{" "}
            <TechLink href="https://www.better-auth.com">better-auth</TechLink>
          </DefinitionRow>
          <DefinitionRow label="Database">
            <TechLink href="https://www.postgresql.org">PostgreSQL</TechLink> via{" "}
            <TechLink href="https://kysely.dev">Kysely</TechLink>
          </DefinitionRow>
          <DefinitionRow label="Monorepo">
            <TechLink href="https://turborepo.com">Turborepo</TechLink> (web, api, shared)
          </DefinitionRow>
          <DefinitionRow label="Quality">
            <TechLink href="https://vitest.dev">Vitest</TechLink> +{" "}
            <TechLink href="https://playwright.dev">Playwright</TechLink> +{" "}
            <TechLink href="https://sentry.io">Sentry</TechLink>
          </DefinitionRow>
        </DefinitionList>
      </section>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function GapCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <Card className="border border-dashed ring-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

type CellValue = "yes" | "no" | "partial" | "unknown" | number;

const SITE_NAMES = ["OpenRift", "Piltover Archive", "Riftbound.gg", "Riftmana", "Riftcore"];

interface RowDetail {
  general?: string;
  openrift?: string;
  piltoverArchive?: string;
  riftmana?: string;
  riftboundGg?: string;
  riftcore?: string;
}

const SITE_KEYS: (keyof Omit<RowDetail, "general">)[] = [
  "openrift",
  "piltoverArchive",
  "riftboundGg",
  "riftmana",
  "riftcore",
];

type ComparisonItem =
  | { kind: "section"; title: string }
  | { kind: "row"; feature: string; values: CellValue[]; detail?: string | RowDetail };

const COMPARISON_ITEMS: ComparisonItem[] = [
  { kind: "section", title: "Data & Pricing" },
  {
    kind: "row",
    feature: "English printings tracked",
    values: [1595, 1365, 1085, 1085, 1032],
    detail: {
      general:
        "Count of English-language printings in each site's catalog as of 2026-04-29. Covers all sets released to date.",
      riftmana:
        "Common/uncommon normal and foil variants are merged into single entries, so the effective count is higher.",
    },
  },
  {
    kind: "row",
    feature: "Multi-language printings",
    values: [1459, "partial", "partial", "partial", "no"],
    detail: {
      general: "Printings in languages other than English tracked by each site, as of 2026-04-29.",
      openrift: "1458 Chinese printings plus 1 French printing.",
      piltoverArchive: "A few Chinese printings available, like the ARC set.",
      riftmana: "Chinese printings are available in collections but not in the card browser.",
      riftboundGg: "A few Chinese printings available, like the ARC set.",
    },
  },
  {
    kind: "row",
    feature: "All printings / variants",
    values: ["yes", "yes", "partial", "partial", "partial"],
    detail: {
      general: "Each printing tracked separately (standard, foil, promos, alternate art, etc.).",
      piltoverArchive: "Can filter by Foil, Alt Art, Overnumbered, Signed, and Promo.",
      riftmana:
        "Can filter by Foil, Alt Art, Overnumbered, Signed, and Promo, but common/uncommon normal and foil variants are merged into single entries.",
      riftboundGg: "Can filter by Alt Art and Promo only.",
      riftcore:
        "Only Promo is distinguished in the card browser. Foil is tracked in collections but not in the browser.",
    },
  },
  {
    kind: "row",
    feature: "Price sources",
    values: [3, 2, 2, 2, 1],
    detail: {
      general: "Number of marketplaces shown side by side for each printing.",
      openrift: "TCGplayer, Cardmarket, and CardTrader.",
      piltoverArchive: "TCGplayer and Cardmarket.",
      riftmana: "TCGplayer and Cardmarket.",
      riftboundGg: "TCGplayer and Cardmarket.",
      riftcore: "Cardmarket only.",
    },
  },
  {
    kind: "row",
    feature: "Price history charts",
    values: ["yes", "no", "yes", "yes", "yes"],
    detail: {
      general: "Daily price snapshots shown as a chart.",
      openrift:
        "History goes back to February 2026 when I started tracking, with some earlier data backfilled from external sources.",
      piltoverArchive: "Shows a trend value, but no chart.",
    },
  },
  {
    kind: "row",
    feature: "Card text coverage",
    values: ["yes", "yes", "partial", "yes", "yes"],
    detail: {
      general: "Which parts of a card's text are shown: rules text, effect text, and flavor text.",
      openrift:
        "Rules, effect, and flavor text, with consistent formatting, OCR-verified from actual card scans.",
      riftboundGg: "Rules and effect text, no flavor text.",
    },
  },
  {
    kind: "row",
    feature: "Errata tracking",
    values: ["yes", "partial", "no", "no", "yes"],
    detail: {
      general:
        "Tracking official errata and rules corrections as separate data, beyond just showing the current text.",
      openrift:
        "All published errata, a filter for cards with errata, and a side-by-side comparison of old and new text.",
      piltoverArchive: "Flags cards that have been erratad, but doesn't show the pre-errata text.",
      riftmana: "Shows the current (post-errata) text but doesn't flag which cards were erratad.",
      riftboundGg:
        "Shows the current (post-errata) text but doesn't flag which cards were erratad.",
    },
  },
  {
    kind: "row",
    feature: "Rules reference pages",
    values: ["yes", "no", "no", "no", "yes"],
    detail: {
      general: "Browsable in-app rules reference for the game.",
    },
  },
  { kind: "section", title: "Collection" },
  {
    kind: "row",
    feature: "Collection tracking",
    values: ["yes", "yes", "yes", "yes", "yes"],
    detail: {
      general: "Track which cards you own and how many copies.",
    },
  },
  {
    kind: "row",
    feature: "Add by browsing the catalog",
    values: ["yes", "yes", "yes", "yes", "yes"],
    detail: {
      general: "Add cards to a collection by browsing the catalog and clicking to add.",
    },
  },
  {
    kind: "row",
    feature: "Quick card entry (keyboard palette)",
    values: ["yes", "no", "no", "no", "no"],
    detail: {
      general:
        "Add cards by name from a fast keyboard search palette, without browsing: type, press Enter to add, Shift+Enter to undo.",
    },
  },
  {
    kind: "row",
    feature: "Condition tracking",
    values: ["no", "yes", "no", "yes", "no"],
    detail: {
      general:
        "Track the physical condition of each copy (mint, played, damaged, etc.) alongside quantity.",
    },
  },
  {
    kind: "row",
    feature: "Multiple collections",
    values: ["yes", "yes", "no", "yes", "partial"],
    detail: {
      general:
        "Create named collections like 'Trade binder', 'Main deck staples', etc. Move cards between them.",
      piltoverArchive:
        "Called binders. The free tier allows 3; unlimited binders need a paid tier.",
      riftmana: "Called binders.",
      riftcore: "View-only binders generated from rules, not user-created named collections.",
    },
  },
  {
    kind: "row",
    feature: "Collection sharing",
    values: ["yes", "yes", "yes", "yes", "yes"],
    detail: {
      general: "Share a collection via public link.",
    },
  },
  {
    kind: "row",
    feature: "Shared group collections",
    values: ["yes", "no", "no", "no", "no"],
    detail: {
      general:
        "Pool cards into a collection shared with a private group of friends, so members see the combined pool.",
    },
  },
  {
    kind: "row",
    feature: "Collection stats",
    values: ["yes", "yes", "yes", "yes", "yes"],
    detail: {
      general: "Total value, completion tracking, and other statistics about your collection.",
      openrift:
        "Collection value plus completion by set, domain, rarity, and type, each custom-filterable.",
      piltoverArchive: "Deck value, completion by set, rarity, and type (per binder).",
      riftmana: "Deck value, missing value, completion by rarity and type.",
      riftboundGg: "Collection value, completion by set, domain, regular/promo/rune, and rarity.",
      riftcore:
        "Collection value, completion by rarity, domain, and set (per binder), domain distribution, and value over time.",
    },
  },
  {
    kind: "row",
    feature: "Portfolio value over time",
    values: ["yes", "no", "no", "no", "yes"],
    detail: {
      general: "Chart how your collection's total market value changes over time.",
    },
  },
  {
    kind: "row",
    feature: "Completion curve",
    values: ["yes", "no", "no", "no", "no"],
    detail: {
      general:
        "A chart showing which missing cards give you the most completion progress if added next, so you can see what to collect for the biggest gains.",
    },
  },
  {
    kind: "row",
    feature: "Activity history",
    values: ["yes", "no", "no", "no", "partial"],
    detail: {
      general: "A timeline of every add, remove, and move across your collections.",
      riftcore: "Has 'sessions' that track additions on demand, but not a continuous timeline.",
    },
  },
  {
    kind: "row",
    feature: "CSV import / export",
    values: ["yes", "yes", "yes", "yes", "yes"],
    detail: {
      general:
        "Import from spreadsheets or other tools. Export your full collection to CSV any time.",
    },
  },
  {
    kind: "row",
    feature: "Wishlists / tradelists",
    values: ["yes", "yes", "yes", "yes", "yes"],
    detail: {
      general:
        "Dedicated lists for cards you want, and sometimes cards you're willing to trade away.",
      openrift:
        "Multiple wishlists and tradelists, each shareable via public link or with a group.",
      piltoverArchive: "Single wishlist, not shareable.",
      riftmana: "One wishlist and one tradelist, not shareable.",
      riftboundGg: "One wishlist and one tradelist, both shareable.",
      riftcore: "Automatic trade binder plus multiple want lists.",
    },
  },
  {
    kind: "row",
    feature: "Dynamic wishlists / tradelists",
    values: ["yes", "no", "no", "no", "yes"],
    detail: {
      general:
        "Lists that fill and update themselves from rules (like a playset of every card) instead of being edited by hand.",
      openrift: "Any wishlist or tradelist can be made dynamic and stays current on its own.",
      riftcore: "Automatic trade binder plus dynamic want lists.",
    },
  },
  {
    kind: "row",
    feature: "Trade matching",
    values: ["yes", "no", "no", "no", "no"],
    detail: {
      general:
        "Matches your wishlists against what other members offer (and the reverse) inside a private group, with one-tap requests, price preferences, and email alerts.",
      openrift: "Built around small private groups rather than a public marketplace.",
    },
  },
  { kind: "section", title: "Deck Building" },
  {
    kind: "row",
    feature: "Deck builder",
    values: ["yes", "yes", "yes", "yes", "yes"],
    detail: {
      general: "Visual deck editor with card search to build decks.",
      riftmana: "No drag & drop for adding or moving cards.",
      riftboundGg: "No drag & drop for adding or moving cards.",
    },
  },
  {
    kind: "row",
    feature: "Format validation",
    values: ["yes", "yes", "no", "yes", "partial"],
    detail: {
      general: "Checks deck size, card limits, and ban lists for each format.",
      riftcore: "Checks deck size and card limits, but doesn't enforce the ban list.",
    },
  },
  {
    kind: "row",
    feature: "Deck statistics",
    values: ["yes", "yes", "yes", "yes", "yes"],
    detail: { general: "Energy curve, domain distribution, cost breakdown, and more." },
  },
  {
    kind: "row",
    feature: "Deck sharing",
    values: ["yes", "yes", "yes", "yes", "yes"],
    detail: {
      general: "Share a single deck via public link, so anyone can view it without signing in.",
      openrift:
        "Links unfurl into a full visual decklist (legend, runes, battlefields, and cards) in chats and social, with a high-resolution version to download.",
    },
  },
  {
    kind: "row",
    feature: "Deck code import / export",
    values: ["yes", "yes", "partial", "yes", "no"],
    detail: {
      general: "Share decks as compact text codes. Both import and export supported.",
      riftboundGg: "Export only, no import.",
    },
  },
  {
    kind: "row",
    feature: "Text import / export",
    values: ["yes", "yes", "yes", "yes", "yes"],
    detail: {
      general: "Import and export decks as human-readable text (one card per line).",
    },
  },
  {
    kind: "row",
    feature: "TTS import / export",
    values: ["yes", "yes", "no", "yes", "yes"],
    detail: {
      general: "Import and export decks in Tabletop Simulator format so you can play them online.",
      riftcore: "Also supports Pixelborn import and export.",
    },
  },
  {
    kind: "row",
    feature: "Play on RiftAtlas",
    values: ["yes", "yes", "no", "no", "no"],
    detail: {
      general: "One-click link that opens the deck in RiftAtlas's online playtester.",
    },
  },
  {
    kind: "row",
    feature: "Proxy printing (PDF)",
    values: ["yes", "yes", "no", "no", "no"],
    detail: {
      general:
        "Generate a printable PDF of proxy cards from a deck for playtesting, with card images or text placeholders.",
    },
  },
  {
    kind: "row",
    feature: "Deck plans / sideboard guides",
    values: ["yes", "yes", "no", "no", "no"],
    detail: {
      general:
        "Document how to pilot a deck (gameplan, opening hand, battlefield) with per-matchup sideboarding, shown on the shared deck page.",
      openrift: "Available on every deck and included when you share it.",
    },
  },
  {
    kind: "row",
    feature: "Sample hand simulator",
    values: ["no", "yes", "no", "no", "yes"],
    detail: {
      general: "Draw a sample opening hand from a deck to test its consistency.",
      openrift: "Not available yet.",
    },
  },
  {
    kind: "row",
    feature: "Deck versioning",
    values: ["no", "yes", "no", "no", "no"],
    detail: {
      general: "Keep a revision history of a deck and roll back to earlier versions.",
      openrift: "Not available yet.",
    },
  },
  {
    kind: "row",
    feature: "Deck building without login",
    values: ["yes", "partial", "yes", "partial", "partial"],
    detail: {
      general: "Build and edit a deck without an account.",
      openrift:
        "Saved on your device, survives a reload, and can optionally be moved to your account later.",
      piltoverArchive: "Can build without login, but saving requires an account.",
      riftboundGg: "Can build and save anonymous decks without an account.",
      riftmana: "Can build without login, but saving requires an account.",
      riftcore: "Can build without login, but saving requires an account.",
    },
  },
  { kind: "section", title: "User Experience" },
  {
    kind: "row",
    feature: "Native mobile app",
    values: ["no", "no", "no", "no", "partial"],
    detail: {
      general:
        "A native iOS or Android app installable from the app store, in addition to the website.",
      riftcore: "Android app available, no iOS version.",
    },
  },
  {
    kind: "row",
    feature: "Keyboard shortcuts",
    values: ["yes", "yes", "no", "no", "no"],
    detail: {
      general: "Cmd+K / Ctrl+K command palette for quick navigation and search.",
    },
  },
  {
    kind: "row",
    feature: "Card scanning",
    values: ["no", "no", "no", "no", "partial"],
    detail: {
      general: "Camera-based card recognition to add cards to your collection without searching.",
      riftcore: "Has card scanning, but recognition accuracy is limited in practice.",
    },
  },
  {
    kind: "row",
    feature: "Custom card designer",
    values: ["yes", "no", "no", "no", "no"],
    detail: {
      general:
        "Design your own Riftbound-style card with your own background image, then download it or copy it to share. Everything stays in your browser.",
    },
  },
  {
    kind: "row",
    feature: "Pack opener simulator",
    values: ["yes", "no", "no", "no", "no"],
    detail: {
      general:
        "Open virtual boosters at the real published pull rates, flip cards one at a time or crack a whole display, and see the rarity breakdown and best pulls.",
    },
  },
  {
    kind: "row",
    feature: "No account required to browse",
    values: ["yes", "yes", "yes", "partial", "yes"],
    detail: {
      general:
        "Browse the full card database, prices, and deck codes without signing up. An account is only needed to save collections.",
      openrift:
        "You can also build a deck without signing in (it saves on your device), and import a deck code while logged out.",
      riftmana: "Chinese printings are only viewable to logged-in users.",
    },
  },
  { kind: "section", title: "Openness & Transparency" },
  {
    kind: "row",
    feature: "Open source",
    values: ["yes", "no", "no", "no", "no"],
    detail: {
      general: "Full source code on GitHub under AGPL-3.0. Inspect, fork, or contribute.",
    },
  },
  {
    kind: "row",
    feature: "Self-hostable",
    values: ["yes", "no", "no", "no", "no"],
    detail: {
      general: "Run the entire stack yourself (frontend, API, and database). Fully documented.",
      openrift:
        "To be honest, I don't expect anyone to ever self-host this. But you COULD if you wanted.",
    },
  },
  {
    kind: "row",
    feature: "Ad-free",
    values: ["yes", "partial", "no", "partial", "partial"],
    detail: {
      general: "No banner ads, no sponsored content, no affiliate-gated features.",
      piltoverArchive:
        "No visible ads yet, but 'No ads on site' is listed as a perk of paid community tiers on Metafy.gg.",
      riftmana: "No visible ads yet, but ad network trackers are already in place.",
      riftboundGg: "Banner ads shown throughout the site. Removed by DotGG Premium.",
      riftcore: "No visible ads yet, but Google ad scripts are present.",
    },
  },
  {
    kind: "row",
    feature: "Third-party ad trackers",
    values: [0, 1, 43, 24, 3],
    detail: {
      general:
        "Number of third-party ad trackers detected by Blacklight (themarkup.org/blacklight). Lower is better, where 0 means none detected. Third-party cookies are listed per-site below.",
      openrift:
        "0 trackers, 0 third-party cookies. Uses first-party Umami for cookie-free analytics.",
      piltoverArchive: "1 tracker (Alphabet), 0 third-party cookies.",
      riftmana: "24 trackers (Verizon Media, Criteo, and 20 others), 21 third-party cookies.",
      riftboundGg: "43 trackers (Sovrn, YieldMo, and 38 others), 50 third-party cookies.",
      riftcore: "3 trackers (Alphabet), 1 third-party cookie.",
    },
  },
  {
    kind: "row",
    feature: "Fully free",
    values: ["yes", "partial", "partial", "yes", "partial"],
    detail: {
      general: "Every feature available without paying.",
      openrift: "Fully free. If this ever changes, I'll be upfront about it.",
      piltoverArchive:
        "Paid tiers on Metafy.gg from $1.99 to $99.99 per month unlock perks: no ads ($1.99), better deck image exports ($4.99), unlimited collection binders ($9.99), and an exclusive Discord ($99.99). Base site is free.",
      riftboundGg:
        "$4.99/month or $19.99/year DotGG Premium subscription removes ads across the DotGG Network. Base site is free.",
      riftcore:
        "Paid tiers from $5 to $20 per month gate AI tools (deck builder, judge, card scanner), voice input, and early access to new features.",
    },
  },
  {
    kind: "row",
    feature: "Public roadmap",
    values: ["yes", "yes", "no", "no", "no"],
    detail: {
      general: "A public roadmap on the site showing what's being worked on and what's planned.",
    },
  },
  { kind: "section", title: "Community & Freshness" },
  {
    kind: "row",
    feature: "Deck catalog",
    values: ["no", "yes", "yes", "yes", "yes"],
    detail: {
      general: "A public hub where users can browse community-submitted decks.",
      openrift: "Not planned.",
    },
  },
  {
    kind: "row",
    feature: "Public user profiles",
    values: ["no", "yes", "yes", "no", "yes"],
    detail: {
      general:
        "A shareable public profile page for a user, beyond a single collection or deck link.",
      openrift: "Not available yet.",
    },
  },
  {
    kind: "row",
    feature: "Meta / tournament data",
    values: ["no", "yes", "yes", "partial", "partial"],
    detail: {
      general: "Tournament results and meta analysis.",
      openrift: "Not available yet, but planned.",
      piltoverArchive: "Tournament decklists shown.",
      riftmana: "Tournament decklists available, but not organized per tournament.",
      riftboundGg: "Tournament data plus decklists.",
      riftcore: "A mix of tournament and community data, but sourcing is unclear.",
    },
  },
  {
    kind: "row",
    feature: "Tournament organizer tools",
    values: ["yes", "no", "no", "no", "no"],
    detail: {
      general:
        "Run an event yourself: free-for-all pod scoring and standings, player deck submission via a per-event link, and judge deck-check tools.",
      openrift:
        "Aimed at running casual leagues and pod events, not browsing other people's results.",
    },
  },
  {
    kind: "row",
    feature: "AI-powered tools",
    values: ["no", "no", "no", "no", "yes"],
    detail: {
      general: "AI features like deck suggestions, natural language search, or card scanning.",
      openrift: "Not currently planned.",
      riftcore:
        "AI deck builder, AI judge, AI card scanner, voice input, and an AI binder assistant. All gated behind paid tiers.",
    },
  },
  {
    kind: "row",
    feature: "Discord members",
    values: [7, 10_946, 1911, 213, 319],
    detail: {
      general:
        "Approximate member count of each site's official Discord server, as a rough proxy for community size.",
      riftboundGg:
        "Not a Riftbound-specific server. It covers the whole DotGG Network, so the count overstates Riftbound-specific reach.",
    },
  },
];

function ComparisonRow({
  feature,
  values,
  detail,
}: {
  feature: string;
  values: CellValue[];
  detail?: string | RowDetail;
}) {
  const [open, setOpen] = useState(false);
  const clickable = Boolean(detail);
  const detailObj: RowDetail | undefined =
    typeof detail === "string" ? { general: detail } : detail;
  const siteNotes = detailObj
    ? SITE_KEYS.map((key, index) => ({
        name: SITE_NAMES[index],
        note: detailObj[key],
      })).filter((entry) => entry.note)
    : [];

  return (
    <>
      <tr
        className={cn("hover:bg-muted/30", clickable && "cursor-pointer")}
        onClick={clickable ? () => setOpen(!open) : undefined}
      >
        <td className="px-3 py-2 text-left">
          <span className="flex items-center gap-1.5">
            {feature}
            {clickable && (
              <ChevronRightIcon
                className={cn(
                  "text-muted-foreground/50 size-3.5 shrink-0 transition-transform",
                  open && "rotate-90",
                )}
              />
            )}
          </span>
        </td>
        {values.map((value, index) => (
          <td key={index} className={cn("px-3 py-2 text-center", index === 0 && "bg-primary/5")}>
            <ComparisonCell value={value} />
          </td>
        ))}
      </tr>
      {open && detailObj && (
        <tr>
          <td colSpan={6} className="bg-muted/20 px-3 py-2">
            {detailObj.general && (
              <p className="text-muted-foreground leading-relaxed">{detailObj.general}</p>
            )}
            {siteNotes.length > 0 && (
              <ul
                className={cn(
                  "text-muted-foreground space-y-0.5 leading-relaxed",
                  detailObj.general && "mt-1.5",
                )}
              >
                {siteNotes.map((entry) => (
                  <li key={entry.name}>
                    <span className="text-foreground font-medium">{entry.name}:</span> {entry.note}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ComparisonSection({ title }: { title: string }) {
  return (
    <tr className="bg-muted/30">
      <td
        colSpan={6}
        className="text-muted-foreground px-3 py-1.5 font-medium tracking-wider uppercase"
      >
        {title}
      </td>
    </tr>
  );
}

function ComparisonMobileSection({ title }: { title: string }) {
  return (
    <h3 className="text-muted-foreground pt-2 font-medium tracking-wider uppercase">{title}</h3>
  );
}

function ComparisonMobileCard({
  feature,
  values,
  detail,
}: {
  feature: string;
  values: CellValue[];
  detail?: string | RowDetail;
}) {
  const [open, setOpen] = useState(false);
  const clickable = Boolean(detail);
  const detailObj: RowDetail | undefined =
    typeof detail === "string" ? { general: detail } : detail;
  const siteNotes = detailObj
    ? SITE_KEYS.map((key, index) => ({
        name: SITE_NAMES[index],
        note: detailObj[key],
      })).filter((entry) => entry.note)
    : [];

  return (
    <div className="border-border bg-background overflow-hidden rounded-lg border">
      {clickable ? (
        <Button
          type="button"
          variant="ghost"
          className="hover:bg-muted/30 dark:hover:bg-muted/30 h-auto w-full justify-between gap-2 rounded-none px-3 py-2.5 text-left font-normal"
          onClick={() => setOpen(!open)}
        >
          <span className="font-medium">{feature}</span>
          <ChevronRightIcon
            className={cn(
              "text-muted-foreground/50 size-3.5 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />
        </Button>
      ) : (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="font-medium">{feature}</span>
        </div>
      )}
      <div className="border-border divide-border divide-y border-t">
        {values.map((value, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center justify-between px-3 py-1.5",
              index === 0 && "bg-primary/5",
            )}
          >
            <span className={cn(index === 0 && "text-primary font-medium")}>
              {SITE_NAMES[index]}
            </span>
            <ComparisonCell value={value} />
          </div>
        ))}
      </div>
      {open && detailObj && (
        <div className="bg-muted/20 border-border border-t px-3 py-2">
          {detailObj.general && (
            <p className="text-muted-foreground leading-relaxed">{detailObj.general}</p>
          )}
          {siteNotes.length > 0 && (
            <ul
              className={cn(
                "text-muted-foreground space-y-0.5 leading-relaxed",
                detailObj.general && "mt-1.5",
              )}
            >
              {siteNotes.map((entry) => (
                <li key={entry.name}>
                  <span className="text-foreground font-medium">{entry.name}:</span> {entry.note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ComparisonCell({ value }: { value: CellValue }) {
  if (typeof value === "number") {
    return <span className="tabular-nums">{value.toLocaleString()}</span>;
  }
  if (value === "yes") {
    return <CheckCircle2Icon className="inline size-4 text-emerald-600 dark:text-emerald-400" />;
  }
  if (value === "partial") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="inline size-4 text-amber-500">
        <path d="M12 2a10 10 0 1 0 0 20z" />
      </svg>
    );
  }
  if (value === "unknown") {
    return <CircleHelpIcon className="text-muted-foreground/50 inline size-4" />;
  }
  return <XIcon className="inline size-4 text-red-600 dark:text-red-400" />;
}

function TechLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      {children}
    </a>
  );
}
