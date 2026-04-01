import { Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleHelpIcon,
  Code2Icon,
  DollarSignIcon,
  EyeIcon,
  EyeOffIcon,
  GaugeIcon,
  GlobeIcon,
  HeartIcon,
  LibraryIcon,
  MailIcon,
  ServerIcon,
  ShieldIcon,
  SparklesIcon,
  SwordsIcon,
  UsersIcon,
  WrenchIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";

export default function WhyOpenRiftArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        A transparent look at how OpenRift compares to other Riftbound card browsers. This is based
        on our honest assessment as of early 2026 &mdash; not marketing. If you run one of these
        sites and feel misrepresented, please{" "}
        <a
          href="mailto:openrift@eiko.dev"
          className="text-primary hover:underline"
          rel="noreferrer"
        >
          send us an email
        </a>{" "}
        and we&apos;ll correct it or add your statement.
      </p>

      <div className="border-border rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <span>
            These comparisons reflect <strong className="text-foreground">our opinions</strong> and
            may not be perfectly accurate. Features change, and we may have missed something. Take
            this as a starting point, not gospel.
          </span>
        </p>
      </div>

      {/* Where we shine */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Where we shine</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<Code2Icon className="size-4" />}
            title="Open source"
            description="Full source code on GitHub (AGPL-3.0). Inspect, fork, self-host, contribute — no black boxes."
          />
          <FeatureCard
            icon={<EyeOffIcon className="size-4" />}
            title="No ads, privacy-first"
            description={
              <>
                No banner ads, no data sold. Analytics are cookie-free and privacy-focused (
                <a
                  href="https://umami.is"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Umami
                </a>
                ). Your collection data stays yours.
              </>
            }
          />
          <FeatureCard
            icon={<DollarSignIcon className="size-4" />}
            title="3 price sources"
            description={
              <>
                <a
                  href="https://partner.tcgplayer.com/openrift"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  TCGPlayer
                </a>
                ,{" "}
                <a
                  href="https://www.cardmarket.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Cardmarket
                </a>
                , and{" "}
                <a
                  href="https://www.cardtrader.com?share_code=openrift"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  CardTrader
                </a>{" "}
                side by side. Most sites show one marketplace at best.
              </>
            }
          />
          <FeatureCard
            icon={<ZapIcon className="size-4" />}
            title="Fast & responsive"
            description="Virtualized scrolling, snappy filters, and a lightweight UI that feels instant."
          />
          <FeatureCard
            icon={<LibraryIcon className="size-4" />}
            title="Rich collection management"
            description="Multiple named collections, drag & drop, activity history, import/export, and market value tracking."
          />
          <FeatureCard
            icon={<SwordsIcon className="size-4" />}
            title="Full deck builder"
            description="Format validation, energy curves, domain distribution, deck codes — not just a card list."
          />
          <FeatureCard
            icon={<ShieldIcon className="size-4" />}
            title="No vendor lock-in"
            description="Export your data any time. Self-host if you want. Your collection isn't held hostage."
          />
          <FeatureCard
            icon={<GlobeIcon className="size-4" />}
            title="Multi-language"
            description="View card printings in English, French, and Chinese — with more languages as they're released."
          />
        </div>
      </section>

      {/* Where we're catching up */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Where we&apos;re catching up</h2>
        <p className="text-muted-foreground mb-3">
          We believe in being honest about our gaps. Here&apos;s what we don&apos;t have yet:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <GapCard
            icon={<UsersIcon className="size-4" />}
            title="Community adoption"
            description="We're new and small. No network effects, no large user base yet. But hey — join now and you can tell your grandchildren you were here before it was cool."
          />
          <GapCard
            icon={<EyeIcon className="size-4" />}
            title="Meta & tournament data"
            description={
              <>
                No top decks or tournament results yet. We&apos;re planning to add tournament
                decklists — see our{" "}
                <Link to="/roadmap" className="text-primary hover:underline">
                  roadmap
                </Link>
                .
              </>
            }
          />
          <GapCard
            icon={<BookOpenIcon className="size-4" />}
            title="Card rulings"
            description={
              <>
                We show card text but don&apos;t have a searchable rules reference or errata yet.
                It&apos;s on the{" "}
                <Link to="/roadmap" className="text-primary hover:underline">
                  roadmap
                </Link>
                .
              </>
            }
          />
          <GapCard
            icon={<HeartIcon className="size-4" />}
            title="Social features"
            description={
              <>
                Shared decklists and wishlists are{" "}
                <Link to="/roadmap" className="text-primary hover:underline">
                  coming
                </Link>
                . We won&apos;t do forums or other features that need content moderation —
                that&apos;s a full-time job.
              </>
            }
          />
          <GapCard
            icon={<SparklesIcon className="size-4" />}
            title="AI-powered tools"
            description="No AI deck suggestions or natural language search. We don't think everything needs AI shoehorned into it — though we do use it to build the site."
          />
          <GapCard
            icon={<GaugeIcon className="size-4" />}
            title="Brand recognition"
            description="'OpenRift' doesn't have the name recognition of established sites. We're earning it one feature at a time."
          />
        </div>
      </section>

      {/* Comparison table */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Feature comparison</h2>
        <p className="text-muted-foreground mb-3 text-sm">
          Compared against other Riftbound card browsers we&apos;re aware of. A checkmark means the
          feature is available; a half circle means partial support; an X means not available; a
          question mark means we&apos;re not sure.
        </p>

        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th className="px-3 py-2.5 text-left font-medium">Feature</th>
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
                feature="Card database"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Every card from every released set, updated when new sets drop."
              />
              <ComparisonRow
                feature="All printings / variants"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Each printing tracked separately — standard, foil, promos, alternate art, etc."
              />
              <ComparisonRow
                feature="Multiple price sources"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="TCGPlayer, Cardmarket, and CardTrader prices side by side. Most sites only show one marketplace."
              />
              <ComparisonRow
                feature="Price history charts"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Daily price snapshots with charts. History goes back to when we started tracking (February 2026)."
              />
              <ComparisonRow
                feature="Multi-language printings"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="English, French, and Chinese card text where available. More languages as they're released."
              />
              <ComparisonRow
                feature="Errata tracking"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail="We show the printed card text but don't track official errata or rules corrections yet. On the roadmap."
              />

              <ComparisonSection title="Collection" />
              <ComparisonRow
                feature="Collection tracking"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Track which cards you own, how many copies, and in which condition."
              />
              <ComparisonRow
                feature="Multiple collections"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Create named collections like 'Trade binder', 'Main deck staples', etc. Move cards between them."
              />
              <ComparisonRow
                feature="Collection sharing"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail="Not yet — sharing collections via link is planned."
              />
              <ComparisonRow
                feature="Collection value"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="See the total market value of your collection across all three marketplaces."
              />
              <ComparisonRow
                feature="Portfolio value over time"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail="We show current value but don't chart how your collection's value changes over time yet."
              />
              <ComparisonRow
                feature="Activity history"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="A timeline of every add, remove, and move across your collections."
              />
              <ComparisonRow
                feature="CSV import / export"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Import from spreadsheets or other tools. Export your full collection to CSV any time."
              />
              <ComparisonRow
                feature="Wish list"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail="A dedicated want list for cards you're looking for. Planned."
              />

              <ComparisonSection title="Deck Building" />
              <ComparisonRow
                feature="Deck builder"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Visual deck editor with drag & drop, card search, and real-time updates."
              />
              <ComparisonRow
                feature="Format validation"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Checks deck size, card limits, and ban lists for each format."
              />
              <ComparisonRow
                feature="Deck statistics"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Energy curve, domain distribution, cost breakdown, and more."
              />
              <ComparisonRow
                feature="Deck code sharing"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Export and import decks as compact text codes."
              />

              <ComparisonSection title="User Experience" />
              <ComparisonRow
                feature="Fast performance"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Virtualized scrolling, minimal bundle size, and snappy filters. No loading spinners where they aren't needed."
              />
              <ComparisonRow
                feature="Dark mode"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
              />
              <ComparisonRow
                feature="Mobile-friendly"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Fully responsive — works on phones, tablets, and desktops."
              />
              <ComparisonRow
                feature="Native mobile app"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail="No native iOS or Android app. The website is mobile-friendly, but there's no app store presence."
              />
              <ComparisonRow
                feature="Keyboard shortcuts"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Cmd+K / Ctrl+K command palette for quick navigation and search."
              />
              <ComparisonRow
                feature="Accessibility"
                values={["partial", "unknown", "unknown", "unknown", "unknown"]}
                detail="We use semantic HTML and ARIA attributes via shadcn/ui, but haven't done a dedicated accessibility audit yet."
              />
              <ComparisonRow
                feature="Card scanning"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail="No camera-based card recognition. You add cards by searching."
              />
              <ComparisonRow
                feature="No account required to browse"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Browse the full card database, prices, and deck codes without signing up. Accounts are only needed for collections and decks."
              />

              <ComparisonSection title="Openness & Transparency" />
              <ComparisonRow
                feature="Open source"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Full source code on GitHub under AGPL-3.0. Inspect, fork, or contribute."
              />
              <ComparisonRow
                feature="Self-hostable"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Run the entire stack yourself — frontend, API, and database. Fully documented."
              />
              <ComparisonRow
                feature="Public API"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail="No documented public API yet. The internal API exists but isn't versioned or stable for third-party use."
              />
              <ComparisonRow
                feature="Ad-free"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="No banner ads, no sponsored content, no affiliate-gated features."
              />
              <ComparisonRow
                feature="No tracking"
                values={["partial", "unknown", "unknown", "unknown", "unknown"]}
                detail="We use Umami for privacy-focused, cookie-free analytics. No third-party trackers, no data sold."
              />
              <ComparisonRow
                feature="Free data export"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Export your collections and decks any time. Your data is never held hostage."
              />
              <ComparisonRow
                feature="Transparent pricing"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="OpenRift is free. If that ever changes, we'll be upfront about it."
              />
              <ComparisonRow
                feature="Public roadmap"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Our roadmap is public on the site. You can see what we're working on and what's next."
              />
              <ComparisonRow
                feature="Community contributions welcome"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail="Open to issues, feature requests, and pull requests on GitHub."
              />

              <ComparisonSection title="Community & Freshness" />
              <ComparisonRow
                feature="Shared decklists"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail="No public decklist hub yet. Deck code sharing works, but there's no browsable community list."
              />
              <ComparisonRow
                feature="Meta / tournament data"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail="No tournament results or meta analysis. Planned for later."
              />
              <ComparisonRow
                feature="AI-powered tools"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail="No AI deck suggestions or natural language search. Not currently planned."
              />
              <ComparisonRow
                feature="User community"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail="No forums, no Discord, no social features. We're a tool, not a social network."
              />
              <ComparisonRow
                feature="New set support speed"
                values={["unknown", "unknown", "unknown", "unknown", "unknown"]}
                detail="We add new sets as they release, but we're too new to have a track record here."
              />
              <ComparisonRow
                feature="Ban list update speed"
                values={["unknown", "unknown", "unknown", "unknown", "unknown"]}
                detail="Same — we update ban lists, but can't promise a specific turnaround time yet."
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* Tech stack */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Our tech stack</h2>
        <p className="text-muted-foreground mb-3">
          For the technically curious &mdash; or if you&apos;re thinking about contributing:
        </p>
        <div className="border-border divide-border divide-y rounded-lg border text-sm">
          <TechRow label="Runtime" value="Bun" />
          <TechRow label="Language" value="TypeScript end-to-end" />
          <TechRow label="Frontend" value="React + Vite" />
          <TechRow label="API" value="Hono" />
          <TechRow label="Database" value="PostgreSQL" />
          <TechRow label="Styling" value="Tailwind CSS + shadcn/ui" />
          <TechRow label="Monorepo" value="Turborepo (web, api, shared)" />
          <TechRow label="Linting" value="oxlint + oxfmt" />
        </div>
        <p className="text-muted-foreground mt-3 text-sm">
          Modern, fast, and TypeScript all the way through. The tradeoff: some of these tools (Bun,
          Hono, oxlint) are newer and less widely known, which may raise the bar for contributors
          compared to Express/ESLint stacks.
        </p>
      </section>

      {/* Help us improve */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Help us improve</h2>
        <p className="text-muted-foreground">
          OpenRift is built in the open. If you find a bug, want a feature, or want to contribute
          code:
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<WrenchIcon className="size-4" />}
            title="Report issues & ideas"
            description="Open an issue on GitHub. We read every one."
          />
          <FeatureCard
            icon={<ServerIcon className="size-4" />}
            title="Self-host"
            description="Run your own instance. The full stack is open and documented."
          />
        </div>
      </section>

      {/* Disclaimer */}
      <div className="border-border bg-muted/30 rounded-lg border p-3">
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <MailIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>
            This comparison reflects our honest opinions as of early 2026. If you run one of the
            sites listed here and believe something is inaccurate, please{" "}
            <a
              href="mailto:openrift@eiko.dev"
              className="text-primary hover:underline"
              rel="noreferrer"
            >
              reach out
            </a>{" "}
            &mdash; we&apos;ll happily correct it or include your response.
          </span>
        </p>
      </div>
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
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
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
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
    </div>
  );
}

type CellValue = "yes" | "no" | "partial" | "unknown";

function ComparisonRow({
  feature,
  values,
  detail,
}: {
  feature: string;
  values: CellValue[];
  detail?: string;
}) {
  const [open, setOpen] = useState(false);
  const clickable = Boolean(detail);

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
              <ChevronDownIcon
                className={cn(
                  "text-muted-foreground/50 size-3.5 shrink-0 transition-transform",
                  open && "rotate-180",
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
      {open && detail && (
        <tr>
          <td colSpan={6} className="bg-muted/20 px-3 py-2">
            <p className="text-muted-foreground text-xs leading-relaxed">{detail}</p>
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
        className="text-muted-foreground px-3 py-1.5 text-[11px] font-medium tracking-wider uppercase"
      >
        {title}
      </td>
    </tr>
  );
}

function ComparisonCell({ value }: { value: CellValue }) {
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
  return <XIcon className="text-muted-foreground/50 inline size-4" />;
}

function TechRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 px-3 py-2.5">
      <span className="w-24 shrink-0 font-medium">{label}</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
