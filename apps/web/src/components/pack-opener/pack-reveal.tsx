import type { CatalogPrintingResponse, PackResult } from "@openrift/shared";
import { useState } from "react";

import { CardBack } from "@/components/pack-opener/card-back";
import { PullCard } from "@/components/pack-opener/pull-card";
import { Button } from "@/components/ui/button";

interface PackRevealProps {
  pack: PackResult;
  imagesByPrintingId: Map<string, CatalogPrintingResponse["images"]>;
}

// Single-pack reveal: 13 card backs the user clicks to flip one at a time.
export function PackReveal({ pack, imagesByPrintingId }: PackRevealProps) {
  const [revealed, setRevealed] = useState<boolean[]>(() => pack.pulls.map(() => false));

  function flip(index: number) {
    setRevealed((current) => current.map((value, i) => (i === index ? true : value)));
  }

  function revealAll() {
    setRevealed((current) => current.map(() => true));
  }

  const allRevealed = revealed.every(Boolean);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">Click a card to reveal it.</p>
        {!allRevealed && (
          <Button variant="outline" size="sm" onClick={revealAll}>
            Reveal all
          </Button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7">
        {pack.pulls.map((pull, i) => (
          <div key={i}>
            {revealed[i] ? (
              <PullCard pull={pull} image={imagesByPrintingId.get(pull.printing.id)?.[0]} />
            ) : (
              <button
                type="button"
                onClick={() => flip(i)}
                className="block w-full cursor-pointer"
                aria-label={`Reveal card ${i + 1}`}
              >
                <CardBack interactive />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
