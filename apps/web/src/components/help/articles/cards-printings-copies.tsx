import { imageUrl } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { CardText } from "@/components/cards/card-text";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";

/** Short codes used in the diagram, in display order. */
const DIAGRAM_SHORT_CODES = ["OGN-007", "OGN-007a", "SFD-R01b"];

/** Copy counts shown in the copies section of the diagram. */
const COPY_COUNTS: Record<string, number> = {
  "OGN-007": 3,
  "OGN-007a": 1,
  "SFD-R01b": 2,
};

function useFuryRuneImages() {
  const { data } = useQuery(cardDetailQueryOptions("fury-rune"));
  const imageByCode = new Map<string, string>();
  if (!data) {
    return imageByCode;
  }
  for (const printing of data.printings) {
    if (DIAGRAM_SHORT_CODES.includes(printing.shortCode) && !imageByCode.has(printing.shortCode)) {
      const id = printing.images[0]?.imageId;
      if (id) {
        imageByCode.set(printing.shortCode, imageUrl(id, "400w"));
      }
    }
  }
  return imageByCode;
}

export default function CardsPrintingsCopiesArticle() {
  const imageByCode = useFuryRuneImages();

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        OpenRift organizes the Riftbound catalog using three levels:{" "}
        <strong className="text-foreground">cards</strong>,{" "}
        <strong className="text-foreground">printings</strong>, and{" "}
        <strong className="text-foreground">copies</strong>.
      </p>

      {/* Diagram */}
      <div className="border-border bg-muted/30 rounded-lg border p-4">
        <div className="flex flex-col items-center gap-3 text-sm">
          <div className="bg-primary/10 text-primary w-full rounded-md px-4 py-2.5 text-center font-semibold">
            Card: &quot;Fury Rune&quot;
          </div>
          <Arrow />
          <div className="bg-primary/10 w-full rounded-md p-3">
            <span className="text-primary mb-2 block text-center font-semibold tracking-wide">
              Printings
            </span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <PrintingCard
                image={imageByCode.get("OGN-007")}
                code="OGN-007"
                label="Origins &middot; Common &middot; Normal"
              />
              <PrintingCard
                image={imageByCode.get("OGN-007a")}
                code="OGN-007a"
                label="Origins &middot; Showcase &middot; Foil"
              />
              <PrintingCard
                image={imageByCode.get("SFD-R01b")}
                code="SFD-R01b"
                label="Spiritforged &middot; Showcase &middot; Foil"
              />
            </div>
          </div>
          <Arrow />
          <div className="bg-primary/10 w-full rounded-md p-3">
            <span className="text-primary mb-2 block text-center font-semibold tracking-wide">
              Copies
            </span>
            <div className="flex justify-center gap-6">
              {DIAGRAM_SHORT_CODES.map((code) => {
                const image = imageByCode.get(code);
                const count = COPY_COUNTS[code] ?? 1;
                return (
                  <div key={code} className="flex flex-col items-center gap-1">
                    <div
                      className="relative"
                      style={{ width: 48 + (count - 1) * 4, height: 68 + (count - 1) * 4 }}
                    >
                      {Array.from({ length: Math.min(count, 3) }, (_, index) => (
                        <div
                          key={index}
                          className="absolute w-12"
                          style={{
                            top: index * 4,
                            left: index * 4,
                            zIndex: index,
                            height: 68,
                          }}
                        >
                          <CardImage
                            src={image}
                            alt={`${code} copy ${index + 1}`}
                            className="h-full w-full shadow-sm"
                          />
                        </div>
                      ))}
                    </div>
                    <span className="text-primary text-xs font-semibold">&times;{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Cards */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Cards</h2>
        <p className="text-muted-foreground">
          A <strong className="text-foreground">card</strong> is the game concept itself: the name,
          rules text, type, domains, stats, and keywords. It&apos;s the same card regardless of
          which set or art it appears in. &quot;Fury Rune&quot; is a card no matter how many times
          it has been printed.
        </p>
        <p className="text-muted-foreground mt-2">
          In the{" "}
          <a href="/cards" className="text-primary hover:underline">
            browser
          </a>
          , <strong className="text-foreground">Cards</strong> view shows one entry per unique card.
          Use it to answer &quot;do I have this card at all?&quot; The detail panel lists every
          available printing under <em>Printings</em>.
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
          a card. It belongs to a set (like Origins or Spiritforged) and has its own short code,
          rarity, finish, art variant, artist, language, and printed text. Each printing has its own
          image and market price.
        </p>
        <p className="text-muted-foreground mt-2">
          The short code is visible at the bottom left of the physical card, like{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 text-xs">SFD-R01b</code>. Two printings
          can share the same short code and still be different, for example a normal finish and a
          foil finish, or a special promo edition.
        </p>
        <p className="text-muted-foreground mt-2">
          Printed text can vary too: some alt art cards omit reminder text, newer printings may
          carry updated wording after an errata, and flavor text often differs.
        </p>
        <p className="text-muted-foreground mt-2">
          In the{" "}
          <a href="/cards" className="text-primary hover:underline">
            browser
          </a>
          , <strong className="text-foreground">Printings</strong> view shows every version
          separately, each with its own image, rarity, and price. Use this when you care about
          specific editions.
        </p>
        <ExampleTable
          rows={[
            ["Code", "OGN-007", "OGN-007a", "SFD-R01b"],
            ["Set", "Origins", "Origins", "Spiritforged"],
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
          Every time you add a card to your collection, you&apos;re recording a{" "}
          <strong className="text-foreground">copy</strong> of a specific printing. Three of the
          same foil printing means three copies. In the real world, each copy could have its own
          condition details (like a PSA grading or a coffee stain), but those aren&apos;t tracked
          yet.
        </p>
        <p className="text-muted-foreground mt-2">
          In your{" "}
          <a href="/collections" className="text-primary hover:underline">
            collection
          </a>
          , <strong className="text-foreground">Copies</strong> view shows every individual copy as
          its own entry, with no stacking. Where the other views show a count badge like{" "}
          <strong className="text-foreground">&times;3</strong>, Copies view shows three separate
          cards on the grid.
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
    </div>
  );
}

function PrintingCard({ image, code, label }: { image?: string; code: string; label: string }) {
  return (
    <div className="bg-background border-border flex flex-1 items-center gap-2 rounded-md border px-3 py-2">
      <CardImage src={image} alt={`Fury Rune ${code}`} className="h-14 w-10" />
      <div>
        <span className="font-medium">{code}</span>
        <span className="text-muted-foreground block" dangerouslySetInnerHTML={{ __html: label }} />
      </div>
    </div>
  );
}

/**
 * Renders a card image with a skeleton placeholder while loading, or if the
 * image source is missing or fails to load.
 *
 * @returns An img with skeleton fallback.
 */
function CardImage({ src, alt, className }: { src?: string; alt: string; className: string }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const showSkeleton = !src || errored || !loaded;
  return (
    <div className={`relative overflow-hidden rounded ${className}`}>
      {showSkeleton && (
        <div className="bg-muted absolute inset-0 animate-pulse" aria-hidden="true" />
      )}
      {src && !errored && (
        <img
          src={src}
          alt={alt}
          className={`absolute inset-0 h-full w-full transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}
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
