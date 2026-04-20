import type { CatalogPrintingResponse, PackResult } from "@openrift/shared";
import { useEffect, useState } from "react";

import { CardBack } from "@/components/pack-opener/card-back";
import { PullCard } from "@/components/pack-opener/pull-card";
import { Button } from "@/components/ui/button";

interface PackRevealProps {
  pack: PackResult;
  imagesByPrintingId: Map<string, CatalogPrintingResponse["images"]>;
  /** Fires once every card in the pack has been flipped face-up. */
  onAllRevealed?: () => void;
  /** When true, the pack opens with every card already face-up. */
  autoReveal?: boolean;
  /** Forwarded to each face-up card so foil pulls can animate or stay static. */
  shimmer?: boolean;
}

// Single-pack reveal: 13 card backs the user clicks to flip one at a time
// (or every card face-up when `autoReveal` is on).
export function PackReveal({
  pack,
  imagesByPrintingId,
  onAllRevealed,
  autoReveal = false,
  shimmer,
}: PackRevealProps) {
  const [revealed, setRevealed] = useState<boolean[]>(() => pack.pulls.map(() => autoReveal));

  // When the user flips the auto-reveal toggle, sync the existing reveal
  // state: turning it on flips every card face-up; turning it off while
  // mid-flip leaves already-revealed cards face-up (the pack is committed
  // either way) but re-hides any still-unrevealed cards would feel wrong —
  // so we only expand, never retract.
  useEffect(() => {
    if (autoReveal) {
      setRevealed((current) => current.map(() => true));
    }
  }, [autoReveal]);

  function flip(index: number) {
    setRevealed((current) => current.map((value, i) => (i === index ? true : value)));
  }

  function revealAll() {
    setRevealed((current) => current.map(() => true));
  }

  const allRevealed = revealed.every(Boolean);
  useEffect(() => {
    if (allRevealed) {
      onAllRevealed?.();
    }
  }, [allRevealed, onAllRevealed]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {allRevealed ? "Pack revealed." : "Click a card to reveal it."}
        </p>
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
              <PullCard
                pull={pull}
                image={imagesByPrintingId.get(pull.printing.id)?.[0]}
                shimmer={shimmer}
              />
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
