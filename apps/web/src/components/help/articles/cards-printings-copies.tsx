export default function CardsPrintingsCopiesArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        OpenRift organizes the Riftbound catalog using three levels:{" "}
        <strong className="text-foreground">cards</strong>,{" "}
        <strong className="text-foreground">printings</strong>, and{" "}
        <strong className="text-foreground">copies</strong>. Understanding the difference helps you
        navigate the browser, manage your collection, and make sense of prices.
      </p>

      {/* Diagram */}
      <div className="border-border bg-muted/30 rounded-lg border p-4">
        <div className="flex flex-col items-center gap-3 text-sm">
          <div className="bg-primary/10 text-primary w-full rounded-md px-4 py-2.5 text-center font-semibold">
            Card &mdash; &quot;Flame Strike&quot;
          </div>
          <Arrow />
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <div className="bg-background border-border flex-1 rounded-md border px-3 py-2 text-center">
              <span className="font-medium">Printing A</span>
              <span className="text-muted-foreground block text-xs">
                Dominion &middot; Rare &middot; Normal
              </span>
            </div>
            <div className="bg-background border-border flex-1 rounded-md border px-3 py-2 text-center">
              <span className="font-medium">Printing B</span>
              <span className="text-muted-foreground block text-xs">
                Dominion &middot; Rare &middot; Foil
              </span>
            </div>
            <div className="bg-background border-border flex-1 rounded-md border px-3 py-2 text-center">
              <span className="font-medium">Printing C</span>
              <span className="text-muted-foreground block text-xs">
                Promo Pack &middot; Epic &middot; Alt Art
              </span>
            </div>
          </div>
          <Arrow />
          <div className="text-muted-foreground text-xs italic">
            Each printing can have many copies in your collection
          </div>
        </div>
      </div>

      {/* Cards */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Cards</h2>
        <p className="text-muted-foreground">
          A <strong className="text-foreground">card</strong> is the game concept itself \u2014 the name,
          rules text, type, domains, stats, and keywords. It exists independent of any particular
          set or art treatment. &quot;Flame Strike&quot; is a card no matter how many times it has
          been printed.
        </p>
        <p className="text-muted-foreground mt-2">
          When you browse in <strong className="text-foreground">Cards</strong> view mode, the
          browser shows one entry per unique card. If a card appears in multiple sets, you still see
          it once. The detail panel shows all available versions under <em>Versions</em>.
        </p>
      </section>

      {/* Printings */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Printings</h2>
        <p className="text-muted-foreground">
          A <strong className="text-foreground">printing</strong> is a specific physical version of
          a card \u2014 tied to a set, with its own collector number, rarity, finish (normal or foil),
          art variant, and artist. The same card can have many printings across different sets, and
          each printing has its own image and market price.
        </p>
        <p className="text-muted-foreground mt-2">
          Switch to <strong className="text-foreground">Printings</strong> view mode to see every
          version separately. This is useful when you care about specific editions \u2014 for example,
          comparing the price of a regular printing versus a foil promo.
        </p>
        <p className="text-muted-foreground mt-2">
          Each printing is identified by a short code like{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 text-xs">DOM-001</code> \u2014 the set
          abbreviation plus the collector number. This code is used when importing and exporting
          collections.
        </p>
      </section>

      {/* Copies */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Copies</h2>
        <p className="text-muted-foreground">
          A <strong className="text-foreground">copy</strong> is a single physical card you own.
          When you add a card to your collection, you are adding a copy of a specific printing. If
          you own three of the same foil printing, that is three copies.
        </p>
        <p className="text-muted-foreground mt-2">
          In the Cards and Printings view modes, copies are stacked \u2014 you see a count badge like{" "}
          <strong className="text-foreground">&times;3</strong> instead of three separate entries.
          Use the <strong className="text-foreground">Copies</strong> view mode (available in
          collections) to see each individual copy as its own card on the grid.
        </p>
      </section>

      {/* View modes */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Choosing a view mode</h2>
        <div className="border-border divide-border divide-y rounded-lg border text-sm">
          <ViewModeRow
            mode="Cards"
            question="Do I own this card at all?"
            shows="One row per unique card. Owned count is the total across all printings."
          />
          <ViewModeRow
            mode="Printings"
            question="Which version do I have?"
            shows="One row per printing. Owned count is per printing."
          />
          <ViewModeRow
            mode="Copies"
            question="Show every physical card."
            shows="One entry per individual copy \u2014 no stacking."
          />
        </div>
      </section>

      {/* Summary */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Quick summary</h2>
        <ul className="text-muted-foreground list-inside list-disc space-y-1">
          <li>
            <strong className="text-foreground">Card</strong> = the game piece (rules, name, stats)
          </li>
          <li>
            <strong className="text-foreground">Printing</strong> = a specific version in a set
            (art, rarity, finish, price)
          </li>
          <li>
            <strong className="text-foreground">Copy</strong> = one physical card you own
          </li>
          <li>One card can have many printings. One printing can have many copies.</li>
        </ul>
      </section>
    </div>
  );
}

function Arrow() {
  return (
    <div className="text-muted-foreground flex flex-col items-center text-xs">
      <div className="bg-border h-4 w-px" />
      <div className="text-muted-foreground/60">&#9660;</div>
    </div>
  );
}

function ViewModeRow({ mode, question, shows }: { mode: string; question: string; shows: string }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-x-3 px-3 py-2.5 sm:grid-cols-[6rem_10rem_1fr]">
      <span className="font-medium">{mode}</span>
      <span className="text-muted-foreground hidden sm:block">{question}</span>
      <span className="text-muted-foreground sm:text-foreground">{shows}</span>
    </div>
  );
}
