import type { PackResult } from "@openrift/shared/pack-opener/types";
import type { CatalogPrintingResponse } from "@openrift/shared/types/api/catalog";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CardBack } from "@/features/decks/components/card-back";
import { PullCard } from "@/features/decks/components/pull-card";

interface PackRevealProps {
  pack: PackResult;
  imagesByPrintingId: Map<string, CatalogPrintingResponse["images"]>;
  onAllRevealed?: () => void;
  autoReveal?: boolean;
  shimmer?: boolean;
}

export function PackReveal({
  pack,
  imagesByPrintingId,
  onAllRevealed,
  autoReveal = false,
  shimmer,
}: PackRevealProps) {
  const [revealed, setRevealed] = useState<boolean[]>(() => pack.pulls.map(() => autoReveal));

  // Turning auto-reveal off never re-hides already-revealed cards; only turning it on expands.
  const [syncedAutoReveal, setSyncedAutoReveal] = useState(autoReveal);
  if (syncedAutoReveal !== autoReveal) {
    setSyncedAutoReveal(autoReveal);
    if (autoReveal) {
      setRevealed((current) => current.map(() => true));
    }
  }

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
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => flip(i)}
                  className="block h-auto w-full cursor-pointer rounded-xl p-0 hover:bg-transparent dark:hover:bg-transparent"
                  aria-label={`Reveal card ${i + 1}`}
                >
                  <CardBack interactive />
                </Button>
                {/* Mirrors PullCard's name + short-code row so the grid doesn't jump on flip. */}
                <div className="mt-1 px-0.5 text-xs" aria-hidden="true">
                  <div className="invisible truncate">&nbsp;</div>
                  <div className="invisible flex justify-between">
                    <span>&nbsp;</span>
                    <span>&nbsp;</span>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
