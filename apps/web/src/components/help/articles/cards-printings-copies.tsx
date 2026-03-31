import { CardText } from "@/components/cards/card-text";

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
            Card &mdash; &quot;Fury Rune&quot;
          </div>
          <Arrow />
          <div className="bg-primary/10 w-full rounded-md p-3">
            <span className="text-primary mb-2 block text-center font-semibold tracking-wide">
              Printings
            </span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="bg-background border-border flex flex-1 items-center gap-2 rounded-md border px-3 py-2">
                <img
                  src="/card-images/OGN/aac9b213-1211-4120-b312-f2cb1bd7dffe-300w.webp"
                  alt="Fury Rune OGN-007"
                  className="w-10 rounded"
                />
                <div>
                  <span className="font-medium">OGN-007</span>
                  <span className="text-muted-foreground block text-xs">
                    Origins &middot; Common &middot; Normal
                  </span>
                </div>
              </div>
              <div className="bg-background border-border flex flex-1 items-center gap-2 rounded-md border px-3 py-2">
                <img
                  src="/card-images/OGN/48bf20fa-b0c7-40fb-85e8-75577b008025-300w.webp"
                  alt="Fury Rune OGN-007a"
                  className="w-10 rounded"
                />
                <div>
                  <span className="font-medium">OGN-007a</span>
                  <span className="text-muted-foreground block text-xs">
                    Origins &middot; Showcase &middot; Foil
                  </span>
                </div>
              </div>
              <div className="bg-background border-border flex flex-1 items-center gap-2 rounded-md border px-3 py-2">
                <img
                  src="/card-images/SFD/019d0c1b-2eda-747f-8caa-f276547b3d15-300w.webp"
                  alt="Fury Rune SFD-R01b"
                  className="w-10 rounded"
                />
                <div>
                  <span className="font-medium">SFD-R01b</span>
                  <span className="text-muted-foreground block text-xs">
                    Spiritforged &middot; Showcase &middot; Foil
                  </span>
                </div>
              </div>
            </div>
          </div>
          <Arrow />
          <div className="bg-primary/10 w-full rounded-md p-3">
            <span className="text-primary mb-2 block text-center font-semibold tracking-wide">
              Copies
            </span>
            <div className="flex justify-center gap-6">
              {[
                {
                  code: "OGN-007",
                  image: "/card-images/OGN/aac9b213-1211-4120-b312-f2cb1bd7dffe-300w.webp",
                  count: 3,
                },
                {
                  code: "OGN-007a",
                  image: "/card-images/OGN/48bf20fa-b0c7-40fb-85e8-75577b008025-300w.webp",
                  count: 1,
                },
                {
                  code: "SFD-R01b",
                  image: "/card-images/SFD/019d0c1b-2eda-747f-8caa-f276547b3d15-300w.webp",
                  count: 2,
                },
              ].map(({ code, image, count }) => (
                <div key={code} className="flex flex-col items-center gap-1">
                  <div
                    className="relative"
                    style={{ width: 48 + (count - 1) * 4, height: 68 + (count - 1) * 4 }}
                  >
                    {Array.from({ length: Math.min(count, 3) }, (_, index) => (
                      <img
                        key={index}
                        src={image}
                        alt={`${code} copy ${index + 1}`}
                        className="absolute w-12 rounded shadow-sm"
                        style={{
                          top: index * 4,
                          left: index * 4,
                          zIndex: index,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-primary text-xs font-semibold">&times;{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cards */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Cards</h2>
        <p className="text-muted-foreground">
          A <strong className="text-foreground">card</strong> is the game concept itself &mdash; the
          name, rules text, type, domains, stats, and keywords. It exists independent of any
          particular set or art treatment. &quot;Fury Rune&quot; is a card no matter how many times
          it has been printed.
        </p>
        <p className="text-muted-foreground mt-2">
          If a card appears in multiple sets, it is still one card. The detail panel shows all
          available versions under <em>Versions</em>.
        </p>
        <ExampleTable
          rows={[
            [
              "Name",
              <strong key="fury-rune">Fury Rune</strong>,
              <strong key="zero-drive">The Zero Drive</strong>,
              <strong key="master-yi">Master Yi, Unstoppable</strong>,
            ],
            ["Type", "Rune", "Gear", "Unit"],
            ["Super Types", "Basic", null, "Champion"],
            ["Domains", "Fury", "Mind", "Calm"],
            ["Might", null, null, "12"],
            ["Energy", null, "3", "12"],
            ["Power", null, null, "3"],
            ["Might Bonus", null, "2", null],
            [
              "Keywords",
              null,
              <CardText key="kw" text="[Equip], [Deathknell]" interactive={false} />,
              null,
            ],
            [
              "Rules Text",
              null,
              <CardText
                key="rules"
                text="[Equip] :rb_energy_1::rb_rune_mind: _(:rb_energy_1::rb_rune_mind:: Attach this to a unit you control.)_\n:rb_energy_3::rb_rune_mind:, Banish this: Play all units banished with this, ignoring their costs. _(Use only if unattached.)_"
                interactive={false}
              />,
              null,
            ],
            [
              "Effect Text",
              null,
              <CardText
                key="effect"
                text="[Deathknell] — Banish me. _(When I die, get the effect.)_"
                interactive={false}
              />,
              null,
            ],
          ]}
        />
      </section>

      {/* Printings */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Printings</h2>
        <p className="text-muted-foreground">
          A <strong className="text-foreground">printing</strong> is a specific physical version of
          a card &mdash; tied to a set, with its own collector number, rarity, finish (normal or
          foil), art variant, and artist. The same card can have many printings across different
          sets, and each printing has its own image and market price.
        </p>
        <p className="text-muted-foreground mt-2">
          Every printing has a collector code visible at the bottom left of the physical card, like{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 text-xs">SFD-R01b</code>. But two
          printings can share the same collector code and still be different &mdash; for example, a
          normal finish and a foil finish of a Common card, or a special promo edition (often marked
          at the bottom center of the card or with other visual differences). OpenRift treats each
          unique combination of set, collector code, finish, art variant, and promo type as its own
          printing. Different printings can also have different printed text &mdash; some alt art
          cards omit the reminder text in parentheses, and newer printings may have updated wording
          if there was an errata. Flavor text can also vary between printings.
        </p>
        <ExampleTable
          rows={[
            ["Code", "OGN-007", "OGN-007a", "SFD-R01b"],
            ["Set", "Origins", "Origins", "Spiritforged"],
            ["Collector Number", "7", "7", "1"],
            ["Rarity", "Common", "Showcase", "Showcase"],
            ["Finish", "Normal", "Foil", "Foil"],
            ["Art Variant", "Normal", "Alt Art", "Alt Art"],
            ["Is Signed", "No", "No", "No"],
            ["Artist", "Greg Ghielmetti & Leah Chen", "Fairfoul", "华锐"],
            ["Promo Type", null, null, "Promo"],
            ["Printed Rules Text", null, null, null],
            ["Printed Effect Text", null, null, null],
            ["Flavor Text", null, null, null],
          ]}
        />
      </section>

      {/* Copies */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Copies</h2>
        <p className="text-muted-foreground">
          A <strong className="text-foreground">copy</strong> is a single physical card you own.
          When you add a card to your collection, you are adding a copy of a specific printing. If
          you own three of the same foil printing, that is three copies. In the real world, each
          copy could have its own condition details &mdash; like a PSA grading or a coffee stain
          &mdash; but we don&apos;t track those yet.
        </p>
        <ExampleTable
          rows={[
            [
              "Printing",
              "OGN-007 · Common · Normal",
              "OGN-007 · Common · Normal",
              "OGN-007a · Showcase · Foil",
            ],
            ["Collection", "Main", "Main", "Main"],
            [
              <span key="condition">
                Condition <span className="text-muted-foreground/60 italic">(planned)</span>
              </span>,
              "Near Mint",
              "Played",
              "Near Mint",
            ],
          ]}
        />
      </section>

      {/* View modes */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">View modes</h2>
        <p className="text-muted-foreground">
          The browser lets you switch between three view modes that correspond to these levels.
        </p>
        <p className="text-muted-foreground mt-2">
          <strong className="text-foreground">Cards</strong> shows one entry per unique card,
          regardless of how many printings exist. If you own any version of a card, the owned count
          reflects the total across all printings. This is the best view for answering &quot;do I
          have this card at all?&quot; It is also useful for deck building, where any printing of a
          card is allowed.
        </p>
        <p className="text-muted-foreground mt-2">
          <strong className="text-foreground">Printings</strong> shows every version separately.
          Each entry has its own image, rarity, and price. The owned count is per printing. Use this
          when you care about specific editions &mdash; for example, comparing the price of a
          regular printing versus a foil promo.
        </p>
        <p className="text-muted-foreground mt-2">
          <strong className="text-foreground">Copies</strong> is available inside collections and
          shows every individual copy as its own entry &mdash; no stacking. Where the other views
          show a count badge like <strong className="text-foreground">&times;3</strong>, Copies view
          shows three separate cards on the grid.
        </p>
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

function ExampleTable({ rows }: { rows: React.ReactNode[][] }) {
  return (
    <div className="border-border mt-3 overflow-x-auto rounded-lg border text-sm">
      <table className="w-full">
        <tbody className="divide-border divide-y">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`px-3 py-2 ${cellIndex === 0 ? "bg-muted/50 font-medium whitespace-nowrap" : "text-muted-foreground min-w-32"}`}
                >
                  {cell === null ? "—" : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
