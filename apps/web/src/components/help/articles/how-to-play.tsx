import { CoinsIcon, FlagIcon, SwordIcon, TimerIcon, TrophyIcon, ZapIcon } from "lucide-react";

export default function HowToPlayArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        Riftbound is a two-player trading card game from Riot Games. Two champions clash across a
        row of battlefields, and the first to score enough points wins. This is a quick primer, not
        the full rulebook. For the official rules, see the links at the bottom.
      </p>

      {/* The goal */}
      <div className="border-border bg-muted/30 rounded-lg border p-4">
        <div className="mb-2 flex items-center gap-2">
          <TrophyIcon className="size-4 text-amber-600 dark:text-amber-400" />
          <h3 className="text-sm font-semibold">The goal</h3>
        </div>
        <p className="text-muted-foreground text-sm">
          Score <strong className="text-foreground">8 points</strong> (11 in team play) to win. You
          score by controlling battlefields. Take a battlefield to bank a point, then earn one more
          point each turn you keep it.
        </p>
      </div>

      {/* The kit */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">What you bring to the table</h2>
        <p className="text-muted-foreground">
          Each player builds a kit around a single legend. The legend sets your two domains
          (colors), and every other card has to fit those domains.
        </p>

        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <ZoneCard
            name="Legend"
            count="1"
            description="Your champion legend. Defines the deck's two domains."
            color="text-amber-600 dark:text-amber-400"
          />
          <ZoneCard
            name="Champion"
            count="1"
            description="A champion unit that shares a tag with your legend."
            color="text-purple-600 dark:text-purple-400"
          />
          <ZoneCard
            name="Battlefields"
            count="3"
            description="Three unique battlefields. Brought to the table by both players."
            color="text-emerald-600 dark:text-emerald-400"
          />
          <ZoneCard
            name="Runes"
            count="12"
            description="A separate side deck of resources, not your main draw pile."
            color="text-blue-600 dark:text-blue-400"
          />
          <ZoneCard
            name="Main Deck"
            count="40"
            description="Units, spells, and gear. Your champion counts toward the 40."
            color="text-foreground"
          />
        </div>

        <p className="text-muted-foreground mt-3 text-sm">
          OpenRift&apos;s{" "}
          <a href="/help/deck-building" className="text-primary hover:underline">
            deck builder
          </a>{" "}
          enforces all of this for you in Constructed format.
        </p>
      </section>

      {/* The board */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">The board</h2>
        <p className="text-muted-foreground">
          Each player has a <strong className="text-foreground">base</strong> where their units
          deploy. Between the players sits a row of battlefields, contributed from both kits but up
          for grabs by either player once the game starts.
        </p>

        <div className="border-border bg-muted/30 mt-3 rounded-lg border p-4">
          <p className="text-muted-foreground mb-2 text-center text-[11px] font-medium tracking-wider uppercase">
            Board layout (placeholder)
          </p>
          <div className="border-border bg-background flex h-56 items-center justify-center rounded border border-dashed">
            <span className="text-muted-foreground text-sm">
              [Diagram: opponent base on top, three battlefields in the middle, your base on the
              bottom, runes and decks to the side]
            </span>
          </div>
        </div>
      </section>

      {/* A turn */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">A turn at a glance</h2>
        <p className="text-muted-foreground">
          Players alternate turns. Each turn moves through three phases.
        </p>

        <div className="mt-3 space-y-2">
          <StepRow
            step={1}
            title="Start phase"
            description="Draw a card. Gain two new runes from your rune deck. Ready any cards that were exhausted last turn."
          />
          <StepRow
            step={2}
            title="Action phase"
            description="Spend power to play units, gear, and spells. Move units to battlefields. Most of the game happens here, with both players passing actions back and forth."
          />
          <StepRow
            step={3}
            title="End phase"
            description="Cleanup. Damage on units resets, and play passes to your opponent."
          />
        </div>
      </section>

      {/* Runes and power */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Runes and power</h2>
        <p className="text-muted-foreground">
          Runes are your resource. They live in a separate 12-card deck and you gain two new ones
          every turn. There are two ways to spend a rune.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<TimerIcon className="size-4" />}
            title="Turn it sideways"
            description="Exhaust a rune to pay for a normal card cost. It readies again at the start of your next turn."
          />
          <FeatureCard
            icon={<ZapIcon className="size-4" />}
            title="Send it back"
            description="Return a rune to your rune deck to pay for stronger effects. It is gone for the rest of the turn."
          />
        </div>
      </section>

      {/* Battlefields */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Battlefields and Showdowns</h2>
        <p className="text-muted-foreground">
          Battlefields are how you score, so they are where the fights happen.
        </p>

        <div className="border-border divide-border mt-3 divide-y rounded-lg border text-sm">
          <RuleRow
            icon={<FlagIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
            zone="Move in"
            rule="Units deploy to your base, then move to a battlefield. Some units have Ganking, which lets them hop between battlefields without going home first."
          />
          <RuleRow
            icon={<SwordIcon className="size-3.5 text-rose-600 dark:text-rose-400" />}
            zone="Showdown"
            rule="When both players have units at the same battlefield, every unit there deals damage equal to its Might at the same time. A unit dies if damage meets or exceeds its Might."
          />
          <RuleRow
            icon={<TrophyIcon className="size-3.5 text-amber-600 dark:text-amber-400" />}
            zone="Conquer"
            rule="Hold a battlefield with no opposing units present and you score a point. You score one more for every turn you keep it."
          />
        </div>
      </section>

      {/* Domains */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">The six domains</h2>
        <p className="text-muted-foreground">
          Domains are Riftbound&apos;s colors. Every legend has two, and your deck can only use
          cards from those two domains plus colorless. Each domain has a flavor.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DomainTile name="Fury" image="/images/domains/fury.webp" flavor="Aggression and burn" />
          <DomainTile name="Calm" image="/images/domains/calm.webp" flavor="Resources and growth" />
          <DomainTile name="Mind" image="/images/domains/mind.webp" flavor="Draw and tricks" />
          <DomainTile name="Body" image="/images/domains/body.webp" flavor="Beef and durability" />
          <DomainTile
            name="Chaos"
            image="/images/domains/chaos.webp"
            flavor="Disruption and swings"
          />
          <DomainTile
            name="Order"
            image="/images/domains/order.webp"
            flavor="Control and structure"
          />
        </div>
      </section>

      {/* Keywords */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Keywords</h2>
        <p className="text-muted-foreground">
          Cards use short keywords (Shield, Deflect, Ganking, Accelerate, and more) as shorthand for
          rules text. You don&apos;t need to memorize them upfront. The starter decks introduce a
          handful at a time, and the rest you pick up by reading cards as they show up.
        </p>
      </section>

      {/* Card costs explainer */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Reading a card</h2>
        <p className="text-muted-foreground">
          Most cards show an energy cost in the top corner, a name and type, an effect, and (for
          units) a Might value used in Showdowns. Costs include both colored pips, which require
          runes of that domain, and generic pips, which any rune can pay for.
        </p>
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed p-3">
          <CoinsIcon className="text-muted-foreground size-5" />
          <span className="text-muted-foreground text-sm">
            [Annotated card image placeholder: name, cost, type line, effect, Might]
          </span>
        </div>
      </section>

      {/* Next steps */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Where to go next</h2>
        <p className="text-muted-foreground">
          That covers the shape of a game. For the full rules, jump in here:
        </p>
        <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
          <li>
            <a
              href="https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/how-to-play-get-started/"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Riot&apos;s official how-to-play guide
            </a>
          </li>
          <li>
            <a
              href="https://riftboundguide.com/how-to-play-riftbound/"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Riftbound Guide&apos;s deeper walk-through
            </a>
          </li>
          <li>
            Once you&apos;re ready to brew, OpenRift&apos;s{" "}
            <a href="/help/deck-building" className="text-primary hover:underline">
              deck builder
            </a>{" "}
            handles the legality checks for you.
          </li>
        </ul>
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
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
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
      <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
        {step}
      </span>
      <div>
        <span className="text-sm font-medium">{title}</span>
        <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">{description}</p>
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
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
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

function DomainTile({ name, image, flavor }: { name: string; image: string; flavor: string }) {
  return (
    <div className="border-border bg-background flex items-center gap-3 rounded-lg border p-3">
      <img src={image} alt={name} className="size-8 shrink-0" />
      <div>
        <div className="text-sm font-semibold">{name}</div>
        <div className="text-muted-foreground text-sm leading-relaxed">{flavor}</div>
      </div>
    </div>
  );
}
