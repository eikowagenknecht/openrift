import { Link } from "@tanstack/react-router";

import { formatLanguageAggregate } from "@/lib/promo-sections";

export function PromosIntro({
  languageLabel,
  aggregate,
}: {
  languageLabel: string;
  aggregate: { printingCount: number; cardCount: number } | undefined;
}) {
  return (
    <div className="mb-6">
      <p className="text-muted-foreground text-sm">
        All the cards you can&apos;t pull from booster packs.{" "}
        <strong className="font-semibold">Markers</strong> say how a card differs from the base
        printing, <strong className="font-semibold">distribution channels</strong> say where it was
        available.
      </p>
      {aggregate && (
        <p className="text-muted-foreground mt-2 text-sm">
          {formatLanguageAggregate(languageLabel, aggregate.printingCount, aggregate.cardCount)} If
          you spotted a missing promo or can help out with a picture I don&apos;t have yet, suggest
          one{" "}
          <Link to="/contribute" className="text-primary hover:underline">
            here
          </Link>
          .
        </p>
      )}
    </div>
  );
}
