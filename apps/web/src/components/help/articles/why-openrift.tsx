import {
  AlertTriangleIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  Code2Icon,
  DollarSignIcon,
  EyeIcon,
  EyeOffIcon,
  GaugeIcon,
  GlobeIcon,
  HeartIcon,
  LibraryIcon,
  MailIcon,
  MinusIcon,
  ServerIcon,
  ShieldIcon,
  SparklesIcon,
  SwordsIcon,
  UsersIcon,
  WrenchIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";

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
            title="No ads, no tracking"
            description="No banner ads, no analytics trackers, no data sold. Your collection data stays yours."
          />
          <FeatureCard
            icon={<DollarSignIcon className="size-4" />}
            title="3 price sources"
            description="TCGPlayer, Cardmarket, and CardTrader side by side. Most sites show one marketplace at best."
          />
          <FeatureCard
            icon={<ZapIcon className="size-4" />}
            title="Fast & offline-capable"
            description="Virtualized scrolling, snappy filters, and a PWA you can install and use offline."
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
            description="We're new and small. No network effects, no large user base yet. You'd be an early adopter."
          />
          <GapCard
            icon={<SparklesIcon className="size-4" />}
            title="AI-powered tools"
            description="No AI deck suggestions, no 'cards like this' recommendations, no natural language search."
          />
          <GapCard
            icon={<HeartIcon className="size-4" />}
            title="Social features"
            description="No shared decklists hub, no user profiles, no trade matching, no community forums."
          />
          <GapCard
            icon={<EyeIcon className="size-4" />}
            title="Meta & tournament data"
            description="No top decks, no tournament results, no meta tracking. We're a collection tool, not a meta tracker."
          />
          <GapCard
            icon={<BookOpenIcon className="size-4" />}
            title="Card rulings"
            description="We show rules text but don't have judge rulings, FAQs, or interaction explanations."
          />
          <GapCard
            icon={<GaugeIcon className="size-4" />}
            title="Brand recognition"
            description="'OpenRift' doesn't have the name recognition of established sites. We're still building trust."
          />
        </div>
      </section>

      {/* Comparison table */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Feature comparison</h2>
        <p className="text-muted-foreground mb-3 text-sm">
          Compared against other Riftbound card browsers we&apos;re aware of. A checkmark means the
          feature is available; a dash means partial support; an X means it&apos;s not available to
          our knowledge.
        </p>

        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th className="px-3 py-2.5 text-left font-medium">Feature</th>
                <th className="px-3 py-2.5 text-center font-medium">
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
              <ComparisonRow feature="Card database" values={["yes", "yes", "yes", "yes", "yes"]} />
              <ComparisonRow
                feature="Multiple price sources"
                values={["yes", "no", "partial", "no", "no"]}
              />
              <ComparisonRow
                feature="Price history charts"
                values={["yes", "no", "no", "no", "no"]}
              />
              <ComparisonRow
                feature="Multi-language printings"
                values={["yes", "partial", "no", "no", "no"]}
              />

              <ComparisonSection title="Collection" />
              <ComparisonRow
                feature="Collection tracking"
                values={["yes", "yes", "yes", "no", "no"]}
              />
              <ComparisonRow
                feature="Multiple collections"
                values={["yes", "no", "no", "no", "no"]}
              />
              <ComparisonRow feature="Activity history" values={["yes", "no", "no", "no", "no"]} />
              <ComparisonRow
                feature="Collection value"
                values={["yes", "no", "partial", "no", "no"]}
              />
              <ComparisonRow
                feature="CSV import / export"
                values={["yes", "no", "no", "no", "no"]}
              />

              <ComparisonSection title="Deck Building" />
              <ComparisonRow feature="Deck builder" values={["yes", "yes", "yes", "no", "no"]} />
              <ComparisonRow
                feature="Format validation"
                values={["yes", "yes", "partial", "no", "no"]}
              />
              <ComparisonRow
                feature="Deck statistics"
                values={["yes", "partial", "partial", "no", "no"]}
              />
              <ComparisonRow
                feature="Deck code sharing"
                values={["yes", "yes", "no", "no", "no"]}
              />

              <ComparisonSection title="User Experience" />
              <ComparisonRow feature="PWA / installable" values={["yes", "no", "no", "no", "no"]} />
              <ComparisonRow feature="Offline support" values={["yes", "no", "no", "no", "no"]} />
              <ComparisonRow feature="Dark mode" values={["yes", "yes", "yes", "yes", "no"]} />
              <ComparisonRow
                feature="Mobile-friendly"
                values={["yes", "partial", "yes", "yes", "partial"]}
              />

              <ComparisonSection title="Openness" />
              <ComparisonRow feature="Open source" values={["yes", "no", "no", "no", "no"]} />
              <ComparisonRow feature="Self-hostable" values={["yes", "no", "no", "no", "no"]} />
              <ComparisonRow feature="Ad-free" values={["yes", "yes", "no", "yes", "yes"]} />
              <ComparisonRow feature="No tracking" values={["yes", "no", "no", "no", "no"]} />
              <ComparisonRow feature="Free data export" values={["yes", "no", "no", "no", "no"]} />

              <ComparisonSection title="Community" />
              <ComparisonRow feature="Shared decklists" values={["no", "yes", "yes", "no", "no"]} />
              <ComparisonRow
                feature="Meta / tournament data"
                values={["no", "no", "yes", "no", "no"]}
              />
              <ComparisonRow feature="AI-powered tools" values={["no", "no", "no", "no", "no"]} />
              <ComparisonRow feature="User community" values={["no", "yes", "yes", "no", "no"]} />
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
  description: string;
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
  description: string;
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

type CellValue = "yes" | "no" | "partial";

function ComparisonRow({ feature, values }: { feature: string; values: CellValue[] }) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2 text-left">{feature}</td>
      {values.map((value, index) => (
        <td key={index} className="px-3 py-2 text-center">
          <ComparisonCell value={value} highlight={index === 0} />
        </td>
      ))}
    </tr>
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

function ComparisonCell({ value, highlight }: { value: CellValue; highlight: boolean }) {
  if (value === "yes") {
    return (
      <CheckCircle2Icon
        className={cn(
          "inline size-4",
          highlight ? "text-primary" : "text-emerald-600 dark:text-emerald-400",
        )}
      />
    );
  }
  if (value === "partial") {
    return <MinusIcon className="text-muted-foreground inline size-4" />;
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
