import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CopyIcon,
  GripVerticalIcon,
  LayersIcon,
  MousePointerClickIcon,
  PlusIcon,
  ShuffleIcon,
  SwordsIcon,
  Wand2Icon,
} from "lucide-react";

export default function DeckBuildingArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        The deck builder lets you construct, validate, and manage decks for the Riftbound trading
        card game. Pick a legend, fill your zones, and the editor checks the rules as you go.
      </p>

      {/* Decks vs Collections concept */}
      <div className="border-border bg-muted/30 rounded-lg border p-4">
        <h3 className="mb-2 text-sm font-semibold">Decks are blueprints, not physical locations</h3>
        <p className="text-muted-foreground text-sm">
          A deck is a list of <strong className="text-foreground">cards</strong>, not specific
          printings or copies. It doesn&apos;t matter whether you play the English version, the
          Chinese version, or the signed foil promo. The deck just says &quot;3x Fury Rune&quot; and
          any printing of that card will do.
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          This is different from{" "}
          <a href="/help/collections" className="text-primary hover:underline">
            collections
          </a>
          , which track where your physical copies are. A deck is the recipe; your collection is the
          pantry.
        </p>
      </div>

      {/* Deck structure diagram */}
      <div className="border-border bg-muted/30 rounded-lg border p-4">
        <p className="text-muted-foreground mb-3 text-center text-xs font-medium tracking-wider uppercase">
          Deck structure
        </p>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <ZoneCard
            name="Legend"
            count="1"
            description="Your commander — determines which domains you can use"
            color="text-amber-600 dark:text-amber-400"
          />
          <ZoneCard
            name="Chosen Champion"
            count="1"
            description="A champion unit that shares a tag with your legend"
            color="text-purple-600 dark:text-purple-400"
          />
          <ZoneCard
            name="Runes"
            count="12"
            description="Resource cards that match your legend's domains"
            color="text-blue-600 dark:text-blue-400"
          />
          <ZoneCard
            name="Battlefield"
            count="3"
            description="Three unique battlefield cards"
            color="text-emerald-600 dark:text-emerald-400"
          />
          <ZoneCard
            name="Main Deck"
            count="40+"
            description="Units, spells, and gear — includes your champion toward the minimum"
            color="text-foreground"
          />
          <ZoneCard
            name="Sideboard"
            count="0–8"
            description="Optional cards you can swap in between games"
            color="text-muted-foreground"
          />
        </div>
      </div>

      {/* Getting started */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Getting started</h2>
        <p className="text-muted-foreground">
          Open <strong className="text-foreground">Decks</strong> from the top navigation and click{" "}
          <strong className="text-foreground">New Deck</strong>. Choose a name and a format:{" "}
          <strong className="text-foreground">Standard</strong> enforces all deck-building rules,
          while <strong className="text-foreground">Freeform</strong> removes all restrictions so
          you can experiment freely.
        </p>
        <p className="text-muted-foreground mt-2">
          The editor opens with two panels: a{" "}
          <strong className="text-foreground">zone sidebar</strong> on the left showing your
          deck&apos;s contents, and a <strong className="text-foreground">card browser</strong> on
          the right where you find and add cards. A validation banner at the top tells you whether
          your deck is legal.
        </p>
      </section>

      {/* Building your deck */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Building your deck step by step</h2>
        <p className="text-muted-foreground">
          The browser guides you through each zone automatically. As you fill one zone, it suggests
          cards for the next.
        </p>

        <div className="mt-3 space-y-2">
          <StepRow
            step={1}
            title="Pick a Legend"
            description="The browser starts filtered to legends. Choose one to set your deck's domains. Runes are auto-populated to get you started."
          />
          <StepRow
            step={2}
            title="Choose a Champion"
            description="The browser suggests champions that share a tag with your legend. Pick one to fill the champion slot."
          />
          <StepRow
            step={3}
            title="Add Battlefields"
            description="Next, browse battlefield cards and pick three unique ones."
          />
          <StepRow
            step={4}
            title="Fill the Main Deck"
            description="The browser now shows units, spells, and gear in your legend's domains. Add at least 40 cards total (including your champion)."
          />
        </div>

        <p className="text-muted-foreground mt-3">
          You can always click a zone in the sidebar to change which zone you&apos;re adding to, or
          adjust the browser filters manually.
        </p>
      </section>

      {/* Adding cards */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Adding cards</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<PlusIcon className="size-4" />}
            title="Quick add"
            description='Click the + button on any card in the browser to add it to the active zone. Single-card zones like Legend and Champion show a "Choose" button instead. Cards you own show an owned count, so you can build with cards you actually have.'
          />
          <FeatureCard
            icon={<GripVerticalIcon className="size-4" />}
            title="Drag & drop"
            description="Drag a card from the browser directly onto a zone in the sidebar. You can also drag cards between zones to reorganize."
          />
          <FeatureCard
            icon={<MousePointerClickIcon className="size-4" />}
            title="Quantity controls"
            description="Once a card is in a zone, use the +/− buttons next to it to adjust the quantity. Maximum 3 copies per card across main, sideboard, and overflow."
          />
          <FeatureCard
            icon={<ShuffleIcon className="size-4" />}
            title="Shift + drag"
            description="Hold Shift while dragging a multi-copy card to move all copies at once instead of just one."
          />
        </div>
        <p className="text-muted-foreground mt-3">
          Use the <strong className="text-foreground">Overflow</strong> zone as a stash for cards
          you&apos;re considering but haven&apos;t committed to a zone yet.
        </p>
      </section>

      {/* Validation rules */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Validation rules (Standard format)</h2>
        <p className="text-muted-foreground">
          In Standard format, the editor validates your deck in real time. A green checkmark means
          your deck is legal. A yellow banner shows the most actionable issue to fix next.
        </p>

        <div className="border-border divide-border mt-3 divide-y rounded-lg border text-sm">
          <RuleRow
            icon={<SwordsIcon className="size-3.5 text-amber-600 dark:text-amber-400" />}
            zone="Legend"
            rule="Exactly 1 legend"
          />
          <RuleRow
            icon={<Wand2Icon className="size-3.5 text-purple-600 dark:text-purple-400" />}
            zone="Champion"
            rule="Exactly 1 champion that shares a tag with your legend"
          />
          <RuleRow
            icon={<LayersIcon className="size-3.5 text-blue-600 dark:text-blue-400" />}
            zone="Runes"
            rule="Exactly 12 runes, all matching the legend's domains"
          />
          <RuleRow
            icon={<CheckCircle2Icon className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
            zone="Battlefield"
            rule="Exactly 3 unique battlefields"
          />
          <RuleRow
            icon={<CopyIcon className="size-3.5" />}
            zone="Main"
            rule="At least 40 cards (including champion). All card domains must be within the legend's domains or colorless."
          />
          <RuleRow
            icon={<AlertTriangleIcon className="text-muted-foreground size-3.5" />}
            zone="Sideboard"
            rule="Up to 8 cards. Max 3 copies of any card across main, sideboard, and overflow."
          />
        </div>

        <p className="text-muted-foreground mt-3 text-sm">
          In Freeform format, none of these rules are enforced, so you can build however you like.
          You can switch to Freeform to theorycraft freely, then switch back to Standard to
          validate. The zone sidebar highlights violations per zone, so you can quickly see what
          still needs attention.
        </p>
      </section>

      {/* Rune auto-population */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Rune auto-population</h2>
        <p className="text-muted-foreground">
          When you pick a legend, the editor automatically fills the rune zone with 12 runes split
          evenly across the legend&apos;s two domains (6 per domain). You can then swap individual
          runes or adjust the split. If you remove a rune and the count drops below 12, the editor
          tries to add a replacement from the other domain to keep the balance.
        </p>
      </section>

      {/* Domain filtering */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Domain filtering</h2>
        <p className="text-muted-foreground">
          Once you&apos;ve selected a legend, the card browser automatically filters to only show
          cards that match your legend&apos;s domains (plus colorless cards). This means you
          won&apos;t accidentally add cards your deck can&apos;t use. The filter is applied in real
          time as you browse.
        </p>
      </section>

      {/* Stats panel */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Deck stats</h2>
        <p className="text-muted-foreground">
          Below the zone list in the sidebar, a collapsible stats panel shows a breakdown of your
          deck:
        </p>
        <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
          <li>
            <strong className="text-foreground">Domain distribution:</strong> how many cards per
            domain in main vs. sideboard
          </li>
          <li>
            <strong className="text-foreground">Energy curve:</strong> distribution of energy costs
            across your deck
          </li>
          <li>
            <strong className="text-foreground">Power curve:</strong> distribution of power values
          </li>
          <li>
            <strong className="text-foreground">Type breakdown:</strong> count of units, spells,
            gear, and other card types
          </li>
        </ul>
      </section>

      {/* Managing decks */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Managing decks</h2>
        <p className="text-muted-foreground">
          The <strong className="text-foreground">Decks</strong> page lists all your decks with
          their format, domain colors, card count, and validation status. From here you can:
        </p>
        <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
          <li>Click a deck to open it in the editor</li>
          <li>
            <strong className="text-foreground">Clone</strong> a deck to create an exact copy for
            experimenting with variants
          </li>
          <li>
            <strong className="text-foreground">Delete</strong> a deck you no longer need (with
            confirmation)
          </li>
        </ul>
      </section>

      {/* Auto-save */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Auto-save</h2>
        <p className="text-muted-foreground">
          Changes are saved automatically as you edit. If you try to leave with unsaved changes,
          you&apos;ll see a warning. There&apos;s no manual save button, just build and go.
        </p>
      </section>
    </div>
  );
}

function ZoneCard({
  name,
  count,
  description,
  color,
}: {
  name: string;
  count: string;
  description: string;
  color: string;
}) {
  return (
    <div className="bg-background border-border rounded-lg border p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className={`text-sm font-semibold ${color}`}>{name}</span>
        <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-[10px] tabular-nums">
          {count}
        </span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
    </div>
  );
}

function StepRow({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="border-border bg-background flex gap-3 rounded-lg border p-3">
      <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {step}
      </span>
      <div>
        <span className="text-sm font-medium">{title}</span>
        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{description}</p>
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

function RuleRow({ icon, zone, rule }: { icon: React.ReactNode; zone: string; rule: string }) {
  return (
    <div className="flex gap-3 px-3 py-2.5">
      <div className="flex w-24 shrink-0 items-start gap-2">
        {icon}
        <span className="font-medium">{zone}</span>
      </div>
      <span className="text-muted-foreground">{rule}</span>
    </div>
  );
}
