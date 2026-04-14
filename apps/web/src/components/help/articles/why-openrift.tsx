import {
  ArrowRightLeftIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleHelpIcon,
  Code2Icon,
  GaugeIcon,
  HeartIcon,
  SparklesIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

export default function WhyOpenRiftArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        A transparent comparison with other Riftbound card browsers. This reflects our opinions as
        of early 2026, not marketing. Features change and we may have missed things. If you run one
        of these sites and believe something is inaccurate, please{" "}
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
            description="No AI deck suggestions or natural language search. We don't think everything needs AI shoehorned into it — though we do use it to build the site."
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
            icon={<UsersIcon className="size-4" />}
            title="Community adoption"
            description="We're new and small. No network effects, no large user base yet. But hey — join now and you can tell your grandchildren you were here before it was cool."
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
        <p className="text-muted-foreground mb-3">
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
                detail={{
                  general: "Every card from every released set, updated when new sets drop.",
                }}
              />
              <ComparisonRow
                feature="All printings / variants"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "Each printing tracked separately — standard, foil, promos, alternate art, etc.",
                }}
              />
              <ComparisonRow
                feature="Multiple price sources"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "TCGPlayer, Cardmarket, and CardTrader prices side by side. Most sites only show one marketplace.",
                }}
              />
              <ComparisonRow
                feature="Price history charts"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "Daily price snapshots with charts. History goes back to when we started tracking (February 2026).",
                }}
              />
              <ComparisonRow
                feature="Multi-language printings"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "English, French, and Chinese card text where available. More languages as they're released.",
                }}
              />
              <ComparisonRow
                feature="Errata tracking"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "We show the printed card text but don't track official errata or rules corrections yet. On the roadmap.",
                }}
              />

              <ComparisonSection title="Collection" />
              <ComparisonRow
                feature="Collection tracking"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general: "Track which cards you own, how many copies, and in which condition.",
                }}
              />
              <ComparisonRow
                feature="Multiple collections"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "Create named collections like 'Trade binder', 'Main deck staples', etc. Move cards between them.",
                }}
              />
              <ComparisonRow
                feature="Collection sharing"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail={{ general: "Not yet — sharing collections via link is planned." }}
              />
              <ComparisonRow
                feature="Collection value"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "See the total market value of your collection across all three marketplaces.",
                }}
              />
              <ComparisonRow
                feature="Portfolio value over time"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "We show current value but don't chart how your collection's value changes over time yet.",
                }}
              />
              <ComparisonRow
                feature="Activity history"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general: "A timeline of every add, remove, and move across your collections.",
                }}
              />
              <ComparisonRow
                feature="CSV import / export"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "Import from spreadsheets or other tools. Export your full collection to CSV any time.",
                }}
              />
              <ComparisonRow
                feature="Wish list"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail={{ general: "A dedicated want list for cards you're looking for. Planned." }}
              />

              <ComparisonSection title="Deck Building" />
              <ComparisonRow
                feature="Deck builder"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "Visual deck editor with drag & drop, card search, and real-time updates.",
                }}
              />
              <ComparisonRow
                feature="Format validation"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general: "Checks deck size, card limits, and ban lists for each format.",
                }}
              />
              <ComparisonRow
                feature="Deck statistics"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{ general: "Energy curve, domain distribution, cost breakdown, and more." }}
              />
              <ComparisonRow
                feature="Deck code sharing"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{ general: "Export and import decks as compact text codes." }}
              />

              <ComparisonSection title="User Experience" />
              <ComparisonRow
                feature="Fast performance"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "Virtualized scrolling, minimal bundle size, and snappy filters. No loading spinners where they aren't needed.",
                }}
              />
              <ComparisonRow
                feature="Dark mode"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
              />
              <ComparisonRow
                feature="Mobile-friendly"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{ general: "Fully responsive — works on phones, tablets, and desktops." }}
              />
              <ComparisonRow
                feature="Native mobile app"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "No native iOS or Android app. The website is mobile-friendly, but there's no app store presence.",
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
                feature="Accessibility"
                values={["partial", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "We use semantic HTML and ARIA attributes via shadcn/ui, but haven't done a dedicated accessibility audit yet.",
                }}
              />
              <ComparisonRow
                feature="Card scanning"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general: "No camera-based card recognition. You add cards by searching.",
                }}
              />
              <ComparisonRow
                feature="No account required to browse"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "Browse the full card database, prices, and deck codes without signing up. Accounts are only needed for collections and decks.",
                }}
              />

              <ComparisonSection title="Openness & Transparency" />
              <ComparisonRow
                feature="Open source"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "Full source code on GitHub under AGPL-3.0. Inspect, fork, or contribute.",
                }}
              />
              <ComparisonRow
                feature="Self-hostable"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "Run the entire stack yourself — frontend, API, and database. Fully documented.",
                }}
              />
              <ComparisonRow
                feature="Public API"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "No documented public API yet. The internal API exists but isn't versioned or stable for third-party use.",
                }}
              />
              <ComparisonRow
                feature="Ad-free"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general: "No banner ads, no sponsored content, no affiliate-gated features.",
                }}
              />
              <ComparisonRow
                feature="No tracking"
                values={["partial", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "We use Umami for privacy-focused, cookie-free analytics. No third-party trackers, no data sold.",
                }}
              />
              <ComparisonRow
                feature="Free data export"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "Export your collections and decks any time. Your data is never held hostage.",
                }}
              />
              <ComparisonRow
                feature="Transparent pricing"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general: "OpenRift is free. If that ever changes, we'll be upfront about it.",
                }}
              />
              <ComparisonRow
                feature="Public roadmap"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "Our roadmap is public on the site. You can see what we're working on and what's next.",
                }}
              />
              <ComparisonRow
                feature="Community contributions welcome"
                values={["yes", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general: "Open to issues, feature requests, and pull requests on GitHub.",
                }}
              />

              <ComparisonSection title="Community & Freshness" />
              <ComparisonRow
                feature="Shared decklists"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "No public decklist hub yet. Deck code sharing works, but there's no browsable community list.",
                }}
              />
              <ComparisonRow
                feature="Meta / tournament data"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail={{ general: "No tournament results or meta analysis. Planned for later." }}
              />
              <ComparisonRow
                feature="AI-powered tools"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "No AI deck suggestions or natural language search. Not currently planned.",
                }}
              />
              <ComparisonRow
                feature="User community"
                values={["no", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "No forums, no Discord, no social features. We're a tool, not a social network.",
                }}
              />
              <ComparisonRow
                feature="New set support speed"
                values={["unknown", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "We add new sets as they release, but we're too new to have a track record here.",
                }}
              />
              <ComparisonRow
                feature="Ban list update speed"
                values={["unknown", "unknown", "unknown", "unknown", "unknown"]}
                detail={{
                  general:
                    "Same — we update ban lists, but can't promise a specific turnaround time yet.",
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

type CellValue = "yes" | "no" | "partial" | "unknown";

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
