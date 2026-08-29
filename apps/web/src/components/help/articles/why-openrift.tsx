import { Link } from "@tanstack/react-router";
import {
  ArrowRightLeftIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleHelpIcon,
  Code2Icon,
  HammerIcon,
  HeartIcon,
  SproutIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { FeatureCard } from "@/components/help/article-cards";
import { DefinitionList, DefinitionRow } from "@/components/help/definition-list";
import { Button } from "@/components/ui/button";
import { SOCIAL_LINKS } from "@/lib/social-links";
import { cn } from "@/lib/utils";

export default function WhyOpenRiftArticle() {
  return (
    <div className="space-y-8">
      <section>
        <Heading className="mb-3">Why this exists</Heading>
        <div className="text-muted-foreground space-y-3">
          <p>Honestly? I just wanted to track my collection.</p>
          <p>
            I used the existing Riftbound trackers for months, and each one was missing something I
            needed. Eventually I stopped waiting for someone else to build it and built the tool I
            wanted. It has become the app I use every day for my own cards.
          </p>
          <p>
            I know how that sounds: the world didn&apos;t ask for yet another collection tracker.
            The honest answer to &quot;why not improve an existing one instead?&quot; is that none
            of them are open source, so there was nothing to contribute to. OpenRift is, and it
            imports from and exports to the formats the other tools use, so you can bring your
            collection over in minutes, and take it back out just as easily.
          </p>
          <p>
            It&apos;s not just me, either. My local game store group uses it every day, for example
            to run our shared &quot;bulk box&quot;: a group collection of spare cards where taking a
            card out moves it straight into your own collection. A good part of the{" "}
            <Link to="/roadmap" className="text-primary hover:underline">
              roadmap
            </Link>{" "}
            started as their feature requests.
          </p>
          <p>
            The fair question to ask any new fan project is whether it will still be around next
            year. I can&apos;t promise the future, but I can point at a track record: the{" "}
            <Link to="/changelog" className="text-primary hover:underline">
              changelog
            </Link>{" "}
            shows what has shipped week by week since launch, my play group depends on the app
            daily, and my own collection lives here too. As long as I play Riftbound, OpenRift gets
            maintained.
          </p>
        </div>
      </section>

      {/* What this site is (and isn't) */}
      <section>
        <Heading className="mb-3">What this site is (and isn&apos;t)</Heading>
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
            title="Private groups"
            description="Form a private group with friends or your local store crew: shared collections (my play group runs its bulk box of spares this way) and trade matching that shows who has cards from your wishlists. The trade itself happens in person."
          />
          <FeatureCard
            icon={<ZapIcon className="size-4" />}
            title="Built for speed"
            description="Speed is the main design goal: browsing the catalog and editing decks should feel instant, on desktop and on your phone. If you catch a slow screen anywhere, that's a bug I want to hear about."
          />
        </div>
      </section>

      {/* Where OpenRift is catching up */}
      <section>
        <Heading className="mb-3">Where OpenRift is catching up</Heading>
        <p className="text-muted-foreground mb-3">
          Beyond the feature gaps in the table below, there are two things a checkmark can&apos;t
          capture:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FeatureCard
            variant="dashed"
            icon={<SproutIcon className="size-4" />}
            title="New kid on the block"
            description="OpenRift is new and small. Most Riftbound players are on Piltover Archive today, and that's earned. The upside of being early here: your feature request isn't one voice among thousands. It gets read, and if it fits, it shapes the roadmap."
          />
          <FeatureCard
            variant="dashed"
            icon={<HammerIcon className="size-4" />}
            title="Less time in the wild"
            description="More than 12,000 automated tests and daily use keep the quality up, but years of real users find edge cases no test suite does. If you hit one, tell me: fixes ship fast."
          />
        </div>
        <p className="text-muted-foreground mt-4 mb-2">
          And credit where it&apos;s due: the other tools genuinely do some things better.
        </p>
        <ul className="text-muted-foreground list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-foreground font-medium">Piltover Archive</span> has bulk adding of
            cards, a massive library of user and tournament decklists, and by far the biggest
            community.
          </li>
          <li>
            <span className="text-foreground font-medium">Riftbound.gg</span> has tournament meta
            data plus a steady stream of articles and guides, which OpenRift doesn&apos;t have.
          </li>
          <li>
            <span className="text-foreground font-medium">RiftCore</span> has AI-powered tools and
            an Android app in the Play Store.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3">
          If one of those is the feature you need today, use that tool. OpenRift imports and exports
          in compatible formats, so you can run it alongside another tracker, or switch back and
          forth, whenever you like.
        </p>
      </section>

      {/* Comparison table */}
      <section>
        <Heading className="mb-3">Feature comparison</Heading>
        <p className="text-muted-foreground mb-3">
          This comparison is my own assessment as of mid-2026. Features change and I may have missed
          things. If you believe something is inaccurate, please{" "}
          <a
            href="mailto:support@openrift.app"
            className="text-primary hover:underline"
            rel="noreferrer"
          >
            send me an email
          </a>{" "}
          so I can correct it or add more info.
        </p>
        <p className="text-muted-foreground mb-3">
          The table compares OpenRift against the four Riftbound card browsers I know best, the ones
          I used myself before building this. A checkmark means the feature is available, a half
          circle means partial support, an X means not available, and a question mark means I&apos;m
          not sure. Features that only OpenRift has are listed separately below the table.
        </p>
        <p className="text-muted-foreground mb-3">
          OpenRift&apos;s own rows were last refreshed on 2026-08-15. The other sites&apos; counts
          and features were last verified on 2026-05-27 and may have drifted since. The two printing
          counts are the exception: they stay at the 2026-04-29 measurement for every site, so the
          numbers compare like for like. OpenRift&apos;s catalog has grown well past its figure
          since then, and the others&apos; probably have too. When you&apos;re reading this,
          it&apos;s probably already slightly out of date, as counts and features change regularly.
          You can follow what changes on OpenRift&apos;s side in the{" "}
          <Link to="/changelog" className="text-primary hover:underline">
            changelog
          </Link>
          .
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
                <th className="px-3 py-2.5 text-center font-medium">RiftMana</th>
                <th className="px-3 py-2.5 text-center font-medium">RiftCore</th>
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

      {/* OpenRift-only features, kept out of the scored table on purpose */}
      <section>
        <Heading className="mb-3">Not in the table</Heading>
        <p className="text-muted-foreground mb-3">
          These are OpenRift features with no counterpart on the other sites. Everything unique to
          OpenRift is listed here instead of scored in the table. The exception is the two openness
          rows (open source, self-hostable): those stay in the table, because openness is why
          OpenRift exists at all.
        </p>
        <ul className="text-muted-foreground list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-foreground font-medium">Trade matching:</span> inside a private
            group, see who has cards from your wishlists (and who wants your spares), with one-tap
            requests and email alerts. The trade itself happens in person.
          </li>
          <li>
            <span className="text-foreground font-medium">Shared group collections:</span> pool
            spare cards into a collection the whole group can see and take from.
          </li>
          <li>
            <span className="text-foreground font-medium">Card lending:</span> lend a card to a
            friend and it stays in your collection, but stops counting for decks and trades until it
            comes back. A lending page tracks who has what, including cards you&apos;re borrowing.
          </li>
          <li>
            <span className="text-foreground font-medium">Deck boxes:</span> point a deck at the
            collection its cards physically live in. The deck page then fills the box from your
            copies, and flags what the box still holds that the deck no longer needs.
          </li>
          <li>
            <span className="text-foreground font-medium">
              <Link
                to="/help/$slug"
                params={{ slug: "deck-importer-extension" }}
                className="text-primary hover:underline"
              >
                Deck importer extension
              </Link>
              :
            </span>{" "}
            a Firefox add-on that reads the decklist on whatever site you are looking at and hands
            it to the import page, name and source link included. No copying, no export step, and it
            works while you are logged out.
          </li>
          <li>
            <span className="text-foreground font-medium">Tournament organizer tools:</span> run a
            casual event yourself, with pod scoring and standings, deck submission via a per-event
            link, and judge deck-check tools.
          </li>
          <li>
            <span className="text-foreground font-medium">Match tracker:</span> keep score for two
            to four players during a game on your phone, with points, XP, and an undo for the
            mis-tapped ones. It works offline and saves nothing to your account.
          </li>
          <li>
            <span className="text-foreground font-medium">Discord bot:</span> look up a card, a
            deck, or a rule in your own server with a slash command or by writing{" "}
            <span className="font-mono">[[card name]]</span>, and post a group&apos;s tradelists
            into a channel.
          </li>
          <li>
            <span className="text-foreground font-medium">Quick card entry:</span> add cards by name
            from a fast keyboard palette, without browsing: type, press Enter to add, Shift+Enter to
            undo.
          </li>
          <li>
            <span className="text-foreground font-medium">Completion curve:</span> a chart showing
            which missing cards give you the most completion progress if added next.
          </li>
          <li>
            <span className="text-foreground font-medium">Pack opener simulator:</span> open virtual
            boosters at the real published pull rates, one card at a time or a whole display.
          </li>
          <li>
            <span className="text-foreground font-medium">Custom card designer:</span> design your
            own Riftbound-style card with your own artwork, entirely in your browser.
          </li>
        </ul>
      </section>

      {/* Tech stack */}
      <section>
        <Heading className="mb-3">Tech stack</Heading>
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

type CellValue = "yes" | "no" | "partial" | "unknown" | number;

const SITE_NAMES = ["OpenRift", "Piltover Archive", "Riftbound.gg", "RiftMana", "RiftCore"];

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
    feature: "Bulk adding",
    values: ["no", "yes", "no", "no", "no"],
    detail: {
      general: "Add many cards at once by pasting or typing a list, without browsing card by card.",
      openrift:
        "Not available yet. CSV import, the card scanner, and the quick card entry palette cover parts of this, but there's no paste-a-list flow.",
    },
  },
  {
    kind: "row",
    feature: "Condition tracking",
    values: ["yes", "yes", "no", "yes", "no"],
    detail: {
      general:
        "Track the physical condition of each copy (mint, played, damaged, etc.) alongside quantity.",
      openrift:
        "Each copy can carry a condition or professional grade, an altered flag, notes, and photo links. All of it survives CSV import and export.",
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
  { kind: "section", title: "Trading & Groups" },
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
    feature: "Collection sharing",
    values: ["yes", "yes", "yes", "yes", "yes"],
    detail: {
      general: "Share a collection via public link.",
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
    values: ["yes", "yes", "no", "no", "yes"],
    detail: {
      general: "Draw a sample opening hand from a deck to test its consistency.",
      openrift:
        "A Test tab on every deck draws an opening hand, lets you mulligan it, and reshuffles as often as you like. A plan's swaps can be applied first, so you test the list you would actually sleeve.",
    },
  },
  {
    kind: "row",
    feature: "Draw odds (hypergeometric)",
    values: ["yes", "unknown", "unknown", "unknown", "unknown"],
    detail: {
      general:
        "Exact hypergeometric odds of drawing what you need: the chance a deck sees a given card or group of cards in the opening hand and the draws after it.",
      openrift:
        "Ready-made groups for curve, interaction, economy, and card types, plus your own groups by type and energy range. A second table gives the chance of holding enough runes of each domain by turns one to four, going first or second, and a plan's swaps apply before the numbers do.",
    },
  },
  {
    kind: "row",
    feature: "Deck versioning",
    values: ["yes", "yes", "no", "no", "no"],
    detail: {
      general: "Keep a revision history of a deck and roll back to earlier versions.",
      openrift:
        "Save a named variant before a rebuild, branch a new one off any earlier version, and compare any two side by side. Versions are the ones you make yourself, not an automatic edit log.",
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
    values: ["no", "no", "no", "partial", "partial"],
    detail: {
      general:
        "A native iOS or Android app installable from the app store, in addition to the website.",
      openrift:
        "No native app, by design: the site is built to be fast on phones, and 'Add to Home Screen' runs it full-screen like an app on both Android and iOS.",
      riftmana: "Android app available, syncing with the site. I could not find an iOS version.",
      riftcore: "Android app available, no iOS version.",
    },
  },
  {
    kind: "row",
    feature: "Keyboard shortcuts",
    values: ["yes", "yes", "no", "no", "no"],
    detail: {
      general:
        "Ctrl+K opens a command palette that searches cards, jumps to any page, and adds cards to a collection or deck.",
    },
  },
  {
    kind: "row",
    feature: "Card scanning",
    values: ["yes", "no", "no", "yes", "yes"],
    detail: {
      general: "Camera-based card recognition to add cards to your collection without searching.",
      openrift:
        "Runs in the browser with nothing to install, and recognises cards on your own device, so no pictures are uploaded.",
      riftmana: "In the mobile app, recognised on the device.",
      riftcore: "Part of the paid AI tiers.",
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
  // Per-site Blacklight tracker counts are kept out of the rendered
  // table on purpose: the comparison should present OpenRift, not shame other
  // hobby projects. Preserved here so the next refresh doesn't re-measure
  // from scratch. Blacklight (themarkup.org/blacklight), measured 2026-05-27:
  //   OpenRift: 0 trackers, 0 third-party cookies (first-party Umami only)
  //   Piltover Archive: 1 tracker (Alphabet), 0 third-party cookies
  //   Riftbound.gg: 43 trackers (Sovrn, YieldMo, and 38 others), 50 third-party cookies
  //   RiftMana: 24 trackers (Verizon Media, Criteo, and 20 others), 21 third-party cookies
  //   RiftCore: 3 trackers (Alphabet), 1 third-party cookie
  {
    kind: "row",
    feature: "Ad-free, no third-party trackers",
    values: ["yes", "partial", "no", "partial", "partial"],
    detail: {
      general:
        "No banner ads, no sponsored content, no third-party ad trackers or cookies. You can check any site yourself with Blacklight (themarkup.org/blacklight).",
      openrift:
        "No ads, zero third-party trackers, and zero third-party cookies, verified with Blacklight. Analytics is first-party, cookie-free Umami.",
      piltoverArchive:
        "No visible ads. Ad-free browsing is listed as a perk of paid supporter tiers.",
      riftmana: "No visible ads. Blacklight reports third-party trackers and cookies on the site.",
      riftboundGg: "Banner ads shown throughout the site, removable with a paid subscription.",
      riftcore: "No visible ads. Blacklight reports a few third-party trackers.",
    },
  },
  // Paid-tier specifics are kept out of the rendered details on purpose: the
  // yes/partial values tell the story without itemizing anyone's pricing.
  // As of 2026-05-27:
  //   Piltover Archive: Metafy.gg tiers $1.99/mo (no ads), $4.99/mo (better
  //     deck image exports), $9.99/mo (unlimited binders), $99.99/mo
  //     (exclusive Discord)
  //   Riftbound.gg: DotGG Premium $4.99/mo or $19.99/yr (ad removal)
  //   RiftCore: $5-$20/mo (AI deck builder / judge / card scanner, voice
  //     input, early access to new features)
  {
    kind: "row",
    feature: "Fully free",
    values: ["yes", "partial", "partial", "yes", "partial"],
    detail: {
      general: "Every feature available without paying.",
      openrift: "Fully free. If this ever changes, I'll be upfront about it.",
      piltoverArchive: "Paid supporter tiers unlock extra perks. The base site is free.",
      riftboundGg:
        "A paid subscription removes ads across the DotGG Network. The base site is free.",
      riftcore:
        "Paid tiers gate the AI tools and early access to new features. The base site is free.",
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
  { kind: "section", title: "Community" },
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
    values: ["partial", "yes", "yes", "no", "yes"],
    detail: {
      general:
        "A shareable public profile page for a user, beyond a single collection or deck link.",
      openrift:
        "One link shows your name with every wishlist and tradelist you share. There is no browsable profile gathering your decks and collection.",
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
      riftcore: "A mix of tournament and community data.",
    },
  },
  {
    kind: "row",
    feature: "AI-powered tools",
    values: ["no", "no", "no", "no", "yes"],
    detail: {
      general: "AI features like deck suggestions, a rules judge, or natural language search.",
      openrift: "Not currently planned.",
      riftcore:
        "AI deck builder, AI judge, AI card scanner, voice input, and an AI binder assistant. All gated behind paid tiers.",
    },
  },
  {
    kind: "row",
    feature: "Discord members",
    values: [13, 10_946, 1911, 213, 319],
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
    // Pinned locale: this article SSRs, and a visitor-locale thousands
    // separator ("1.000" vs "1,000") would mismatch the server HTML.
    return <span className="tabular-nums">{value.toLocaleString("en-US")}</span>;
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
