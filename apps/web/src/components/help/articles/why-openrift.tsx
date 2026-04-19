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
            And nothing really worked well on both desktop and mobile. There are good mobile apps,
            but they don&apos;t sync with anything you can use at a desk.
          </p>
          <p>
            So naturally, after a full week of patient, rigorous evaluation, I did the only
            reasonable thing and built a competing product from scratch. OpenRift is on its way to
            being the card browser I wanted to use. The comparison below is an honest look at where
            it stands against the alternatives, which you can judge for yourself.
          </p>
        </div>
      </section>

      <p className="text-muted-foreground">
        This comparison reflects our opinions as of early 2026, not marketing. Features change and
        we may have missed things. If you run one of these sites and believe something is
        inaccurate, please{" "}
        <a
          href="mailto:support@openrift.app"
          className="text-primary hover:underline"
          rel="noreferrer"
        >
          send us an email
        </a>{" "}
        and we&apos;ll correct it or add your statement.
      </p>

      {/* Our philosophy */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Our philosophy</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<Code2Icon className="size-4" />}
            title="Open source"
            description={
              <>
                Full source code on{" "}
                <a
                  href="https://github.com/eikowagenknecht/openrift"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  GitHub
                </a>{" "}
                under AGPL-3.0. Inspect, fork, self-host, or open an issue. We read every one.
              </>
            }
          />
          <FeatureCard
            icon={<ArrowRightLeftIcon className="size-4" />}
            title="Data import / export"
            description="Bring your collection in via CSV and take it out the same way. Your data is never held hostage."
          />
          <FeatureCard
            icon={<HeartIcon className="size-4" />}
            title="No forums, no social network"
            description="Shared decklists and wishlists are coming, but we won't run forums or other features that need full-time content moderation. We're a tool, not a social space."
          />
          <FeatureCard
            icon={<SparklesIcon className="size-4" />}
            title="No AI gimmicks"
            description="No AI deck suggestions or natural language search. We don't think everything needs AI shoehorned into it, though we do use it to build the site."
          />
        </div>
      </section>

      {/* Where we're catching up */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Where we&apos;re catching up</h2>
        <p className="text-muted-foreground mb-3">
          Beyond the feature gaps below, there are two things a table can&apos;t capture:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <GapCard
            icon={<SproutIcon className="size-4" />}
            title="We're the new kid"
            description="Every Riftbound player knows Piltover Archive. We don't have that recognition or the network effects yet. Give us a minute. Join now and you can tell your grandchildren you were here before it was cool."
          />
          <GapCard
            icon={<HammerIcon className="size-4" />}
            title="Not battle-tested"
            description="Every feature here works, but 'works' and 'has been stress-tested by 10,000 users for one year' are not the same thing. Expect the occasional rough edge."
          />
        </div>
      </section>

      {/* Comparison table */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Feature comparison</h2>
        <p className="text-muted-foreground mb-3">
          Compared against the most popular Riftbound card browsers. We picked these four because
          they&apos;re the ones you&apos;re most likely to have tried. A checkmark means the feature
          is available; a half circle means partial support; an X means not available; a question
          mark means we&apos;re not sure.
        </p>
        <p className="text-muted-foreground mb-3">
          Last verified on 2026-04-14. When you&apos;re reading this it&apos;s probably already
          slightly out of date, as counts and features change regularly.
        </p>

        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th className="w-2/5 px-3 py-2.5 text-left font-medium">Feature</th>
                <th className="bg-primary/5 px-3 py-2.5 text-center font-medium">
                  <span className="text-primary">OpenRift</span>
                </th>
                <th className="px-3 py-2.5 text-center font-medium">Piltover Archive</th>
                <th className="px-3 py-2.5 text-center font-medium">Riftmana</th>
                <th className="px-3 py-2.5 text-center font-medium">Riftbound.gg</th>
                <th className="px-3 py-2.5 text-center font-medium">Riftcore</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              <ComparisonSection title="Data & Pricing" />
              <ComparisonRow
                feature="English printings tracked"
                values={[1504, 1365, 1085, 1085, 1032]}
                detail={{
                  general:
                    "Count of English-language printings in each site's catalog as of 2026-04-14. Covers all sets released to date; higher is more complete.",
                  riftmana:
                    "Common/uncommon normal and foil variants are merged into single entries, so the effective count is higher.",
                }}
              />
              <ComparisonRow
                feature="Multi-language printings"
                values={[1411, "partial", "partial", "partial", "no"]}
                detail={{
                  general:
                    "Printings in languages other than English tracked by each site, as of 2026-04-14.",
                  openrift: "1410 Chinese printings plus 1 French printing.",
                  piltoverArchive: "A few Chinese printings available, like the ARC set.",
                  riftmana:
                    "Chinese printings are available in collections but not in the card browser.",
                  riftboundGg: "A few Chinese printings available, like the ARC set.",
                }}
              />
              <ComparisonRow
                feature="All printings / variants"
                values={["yes", "yes", "partial", "partial", "partial"]}
                detail={{
                  general:
                    "Each printing tracked separately (standard, foil, promos, alternate art, etc.).",
                  piltoverArchive: "Can filter by Foil, Alt Art, Overnumbered, Signed, and Promo.",
                  riftmana:
                    "Can filter by Foil, Alt Art, Overnumbered, Signed, and Promo, but common/uncommon normal and foil variants are merged into single entries.",
                  riftboundGg: "Can filter by Alt Art and Promo only.",
                  riftcore:
                    "Only Promo is distinguished in the card browser. Foil is tracked in collections but not in the browser.",
                }}
              />
              <ComparisonRow
                feature="Price sources"
                values={[3, 2, 2, 2, 1]}
                detail={{
                  general: "Number of marketplaces shown side by side for each printing.",
                  openrift: "TCGplayer, Cardmarket, and CardTrader.",
                  piltoverArchive: "TCGplayer and Cardmarket.",
                  riftmana: "TCGplayer and Cardmarket.",
                  riftboundGg: "TCGplayer and Cardmarket.",
                  riftcore: "Cardmarket only.",
                }}
              />
              <ComparisonRow
                feature="Price history charts"
                values={["yes", "no", "yes", "yes", "yes"]}
                detail={{
                  general: "Daily price snapshots shown as a chart.",
                  openrift:
                    "History goes back to February 2026 when we started tracking, with some earlier data backfilled from external sources.",
                  piltoverArchive: "Shows a trend value, but no chart.",
                }}
              />
              <ComparisonRow
                feature="Card text coverage"
                values={["yes", "yes", "yes", "partial", "yes"]}
                detail={{
                  general:
                    "Which parts of a card's text are shown: rules text, effect text, and flavor text.",
                  openrift:
                    "Rules, effect, and flavor text, with consistent formatting, OCR-verified from actual card scans.",
                  riftboundGg: "Rules and effect text; no flavor text.",
                }}
              />
              <ComparisonRow
                feature="Errata tracking"
                values={["yes", "partial", "no", "no", "yes"]}
                detail={{
                  general:
                    "Tracking official errata and rules corrections as separate data, beyond just showing the current text.",
                  openrift:
                    "All published errata, a filter for cards with errata, and a side-by-side comparison of old and new text.",
                  piltoverArchive:
                    "Flags cards that have been erratad, but doesn't show the pre-errata text.",
                  riftmana:
                    "Shows the current (post-errata) text but doesn't flag which cards were erratad.",
                  riftboundGg:
                    "Shows the current (post-errata) text but doesn't flag which cards were erratad.",
                }}
              />

              <ComparisonSection title="Collection" />
              <ComparisonRow
                feature="Collection tracking"
                values={["yes", "yes", "yes", "yes", "yes"]}
                detail={{
                  general: "Track which cards you own and how many copies.",
                }}
              />
              <ComparisonRow
                feature="Condition tracking"
                values={["no", "yes", "yes", "no", "no"]}
                detail={{
                  general:
                    "Track the physical condition of each copy (mint, played, damaged, etc.) alongside quantity.",
                }}
              />
              <ComparisonRow
                feature="Multiple collections"
                values={["yes", "yes", "yes", "no", "partial"]}
                detail={{
                  general:
                    "Create named collections like 'Trade binder', 'Main deck staples', etc. Move cards between them.",
                  piltoverArchive: "Called binders.",
                  riftmana: "Called binders.",
                  riftcore:
                    "View-only binders generated from rules, not user-created named collections.",
                }}
              />
              <ComparisonRow
                feature="Collection sharing"
                values={["no", "yes", "yes", "yes", "yes"]}
                detail={{
                  general: "Share a collection via public link.",
                  openrift: "Not supported yet; planned.",
                }}
              />
              <ComparisonRow
                feature="Collection stats"
                values={["yes", "yes", "yes", "yes", "yes"]}
                detail={{
                  general:
                    "Total value, completion tracking, and other statistics about your collection.",
                  openrift:
                    "Exhaustive, custom-filterable stats: deck value and more on the stats page.",
                  piltoverArchive: "Deck value, completion by set, rarity, and type (per binder).",
                  riftmana: "Deck value, missing value, completion by rarity and type.",
                  riftboundGg:
                    "Collection value, completion by set, domain, regular/promo/rune, and rarity.",
                  riftcore:
                    "Collection value, completion by rarity, domain, and set (per binder), domain distribution, and value over time.",
                }}
              />
              <ComparisonRow
                feature="Portfolio value over time"
                values={["yes", "no", "no", "no", "yes"]}
                detail={{
                  general: "Chart how your collection's total market value changes over time.",
                }}
              />
              <ComparisonRow
                feature="Completion curve"
                values={["yes", "no", "no", "no", "no"]}
                detail={{
                  general:
                    "A chart showing which missing cards give you the most completion progress if added next, so you can see what to collect for the biggest gains.",
                }}
              />
              <ComparisonRow
                feature="Activity history"
                values={["yes", "no", "no", "no", "partial"]}
                detail={{
                  general: "A timeline of every add, remove, and move across your collections.",
                  riftcore:
                    "Has 'sessions' that track additions on demand, but not a continuous timeline.",
                }}
              />
              <ComparisonRow
                feature="CSV import / export"
                values={["yes", "yes", "yes", "yes", "yes"]}
                detail={{
                  general:
                    "Import from spreadsheets or other tools. Export your full collection to CSV any time.",
                }}
              />
              <ComparisonRow
                feature="Wish / trade lists"
                values={["no", "yes", "yes", "yes", "yes"]}
                detail={{
                  general:
                    "Dedicated lists for cards you want, and sometimes cards you're willing to trade away.",
                  openrift: "Not supported yet; planned.",
                  piltoverArchive: "Single wish list, not shareable.",
                  riftmana: "One wish list and one trade list, not shareable.",
                  riftboundGg: "One wish list and one trade list, both shareable.",
                  riftcore: "Automatic trade binder plus multiple manual and dynamic want lists.",
                }}
              />

              <ComparisonSection title="Deck Building" />
              <ComparisonRow
                feature="Deck builder"
                values={["yes", "yes", "yes", "yes", "yes"]}
                detail={{
                  general: "Visual deck editor with card search to build decks.",
                  riftmana: "No drag & drop for adding or moving cards.",
                  riftboundGg: "No drag & drop for adding or moving cards.",
                }}
              />
              <ComparisonRow
                feature="Format validation"
                values={["yes", "yes", "yes", "no", "partial"]}
                detail={{
                  general: "Checks deck size, card limits, and ban lists for each format.",
                  riftcore: "Checks deck size and card limits, but doesn't enforce the ban list.",
                }}
              />
              <ComparisonRow
                feature="Deck statistics"
                values={["yes", "yes", "yes", "yes", "yes"]}
                detail={{ general: "Energy curve, domain distribution, cost breakdown, and more." }}
              />
              <ComparisonRow
                feature="Deck code import / export"
                values={["yes", "yes", "yes", "partial", "no"]}
                detail={{
                  general: "Share decks as compact text codes. Both import and export supported.",
                  riftboundGg: "Export only; no import.",
                }}
              />
              <ComparisonRow
                feature="Text import / export"
                values={["yes", "yes", "yes", "yes", "yes"]}
                detail={{
                  general: "Import and export decks as human-readable text (one card per line).",
                }}
              />
              <ComparisonRow
                feature="TTS import / export"
                values={["yes", "yes", "yes", "no", "yes"]}
                detail={{
                  general:
                    "Import and export decks in Tabletop Simulator format so you can play them online.",
                  riftcore: "Also supports Pixelborn import and export.",
                }}
              />

              <ComparisonSection title="User Experience" />
              <ComparisonRow
                feature="Native mobile app"
                values={["no", "no", "no", "no", "partial"]}
                detail={{
                  general:
                    "A native iOS or Android app installable from the app store, in addition to the website.",
                  riftcore: "Android app available; no iOS version.",
                }}
              />
              <ComparisonRow
                feature="Keyboard shortcuts"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general: "Cmd+K / Ctrl+K command palette for quick navigation and search.",
                }}
              />
              <ComparisonRow
                feature="Card scanning"
                values={["no", "no", "no", "no", "partial"]}
                detail={{
                  general:
                    "Camera-based card recognition to add cards to your collection without searching.",
                  riftcore: "Has card scanning, but recognition accuracy is limited in practice.",
                }}
              />
              <ComparisonRow
                feature="No account required to browse"
                values={["yes", "yes", "partial", "yes", "yes"]}
                detail={{
                  general:
                    "Browse the full card database, prices, and deck codes without signing up. Accounts are only needed for collections and decks.",
                  riftmana: "Chinese printings are only viewable to logged-in users.",
                }}
              />

              <ComparisonSection title="Openness & Transparency" />
              <ComparisonRow
                feature="Open source"
                values={["yes", "no", "no", "no", "no"]}
                detail={{
                  general:
                    "Full source code on GitHub under AGPL-3.0. Inspect, fork, or contribute.",
                }}
              />
              <ComparisonRow
                feature="Self-hostable"
                values={["yes", "no", "no", "no", "no"]}
                detail={{
                  general:
                    "Run the entire stack yourself (frontend, API, and database). Fully documented.",
                  openrift:
                    "To be honest, I don't expect anyone to ever self-host this. But you COULD if you wanted.",
                }}
              />
              <ComparisonRow
                feature="Ad-free"
                values={["yes", "partial", "partial", "partial", "partial"]}
                detail={{
                  general: "No banner ads, no sponsored content, no affiliate-gated features.",
                  piltoverArchive:
                    "No visible ads yet, but 'No ads on site' is listed as a perk of paid community tiers on Metafy.gg.",
                  riftmana: "No visible ads yet, but ad network trackers are already in place.",
                  riftboundGg: "No visible ads yet, but ad network trackers are already in place.",
                  riftcore: "No visible ads yet, but Google ad scripts are present.",
                }}
              />
              <ComparisonRow
                feature="Third-party ad trackers"
                values={[0, 1, 24, 43, 3]}
                detail={{
                  general:
                    "Number of third-party ad trackers detected by Blacklight (themarkup.org/blacklight). Lower is better; 0 means none detected. Third-party cookies are listed per-site below.",
                  openrift:
                    "0 trackers, 0 third-party cookies. Uses first-party Umami for cookie-free analytics.",
                  piltoverArchive: "1 tracker (Alphabet), 0 third-party cookies.",
                  riftmana:
                    "24 trackers (Verizon Media, Criteo, and 20 others), 21 third-party cookies.",
                  riftboundGg:
                    "43 trackers (Sovrn, YieldMo, and 38 others), 50 third-party cookies.",
                  riftcore: "3 trackers (Alphabet), 1 third-party cookie.",
                }}
              />
              <ComparisonRow
                feature="Fully free"
                values={["yes", "partial", "yes", "partial", "partial"]}
                detail={{
                  general: "Every feature available without paying.",
                  openrift: "Fully free. If this ever changes, we'll be upfront about it.",
                  piltoverArchive:
                    "Pay-what-you-want community tiers on Metafy.gg unlock perks like 'no ads' and profile badges. Base site is free.",
                  riftboundGg:
                    "$4.99/month or $19.99/year DotGG Premium subscription removes ads across the DotGG Network. Base site is free.",
                  riftcore:
                    "Paid tiers from $5 to $20 per month gate AI tools (deck builder, judge, card scanner), voice input, and early access to new features.",
                }}
              />
              <ComparisonRow
                feature="Public roadmap"
                values={["yes", "yes", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "A public roadmap on the site showing what's being worked on and what's planned.",
                }}
              />

              <ComparisonSection title="Community & Freshness" />
              <ComparisonRow
                feature="Shared decklists"
                values={["no", "yes", "yes", "yes", "yes"]}
                detail={{
                  general: "A public hub where users can browse community-submitted decks.",
                  openrift: "Deck code sharing works but no browsable community list yet.",
                }}
              />
              <ComparisonRow
                feature="Meta / tournament data"
                values={["no", "yes", "partial", "yes", "partial"]}
                detail={{
                  general: "Tournament results and meta analysis.",
                  openrift: "Not available yet; planned.",
                  piltoverArchive: "Tournament decklists shown.",
                  riftmana: "Tournament decklists available, but not organized per tournament.",
                  riftboundGg: "Tournament data plus decklists.",
                  riftcore: "A mix of tournament and community data; sourcing is unclear.",
                }}
              />
              <ComparisonRow
                feature="AI-powered tools"
                values={["no", "no", "no", "no", "yes"]}
                detail={{
                  general:
                    "AI features like deck suggestions, natural language search, or card scanning.",
                  openrift: "Not currently planned.",
                  riftcore:
                    "AI deck builder, AI judge, AI card scanner, voice input, and an AI binder assistant. All gated behind paid tiers.",
                }}
              />
              <ComparisonRow
                feature="Discord members"
                values={[2, 9772, 182, 1624, 307]}
                detail={{
                  general:
                    "Approximate member count of each site's official Discord server, as a rough proxy for community size.",
                  riftboundGg:
                    "Not a Riftbound-specific server; covers the whole DotGG Network, so the count overstates Riftbound-specific reach.",
                }}
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* Tech stack */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Our tech stack</h2>
        <p className="text-muted-foreground mb-3">
          For the technically curious, or if you&apos;re thinking about contributing:
        </p>
        <div className="border-border divide-border divide-y rounded-lg border">
          <TechRow label="Runtime">
            <TechLink href="https://bun.com">Bun</TechLink>
          </TechRow>
          <TechRow label="Language">
            <TechLink href="https://www.typescriptlang.org">TypeScript</TechLink> end-to-end
          </TechRow>
          <TechRow label="Frontend">
            <TechLink href="https://react.dev">React</TechLink> +{" "}
            <TechLink href="https://vite.dev">Vite</TechLink>
          </TechRow>
          <TechRow label="API">
            <TechLink href="https://hono.dev">Hono</TechLink>
          </TechRow>
          <TechRow label="Database">
            <TechLink href="https://www.postgresql.org">PostgreSQL</TechLink>
          </TechRow>
          <TechRow label="Styling">
            <TechLink href="https://tailwindcss.com">Tailwind CSS</TechLink> +{" "}
            <TechLink href="https://ui.shadcn.com">shadcn/ui</TechLink>
          </TechRow>
          <TechRow label="Monorepo">
            <TechLink href="https://turborepo.com">Turborepo</TechLink> (web, api, shared)
          </TechRow>
          <TechRow label="Linting">
            <TechLink href="https://oxc.rs">oxlint + oxfmt</TechLink>
          </TechRow>
        </div>
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
    <div className="border-border bg-background rounded-lg border p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <span className="font-medium">{title}</span>
      </div>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
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
    <div className="border-border bg-background rounded-lg border border-dashed p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="font-medium">{title}</span>
      </div>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

type CellValue = "yes" | "no" | "partial" | "unknown" | number;

const SITE_NAMES = ["OpenRift", "Piltover Archive", "Riftmana", "Riftbound.gg", "Riftcore"];

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
  "riftmana",
  "riftboundGg",
  "riftcore",
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

function TechRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-3 py-2.5">
      <span className="w-24 shrink-0 font-medium">{label}</span>
      <span className="text-muted-foreground">{children}</span>
    </div>
  );
}

function TechLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      {children}
    </a>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
