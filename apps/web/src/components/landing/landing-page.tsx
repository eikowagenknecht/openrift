import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { cn } from "@/lib/utils";

import { HeroBackground } from "./hero-background";

export function LandingPage() {
  const { data } = useQuery(catalogQueryOptions);
  const copiesTracked = useFeatureEnabled("copies-tracked");
  const [spinning, setSpinning] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [hinting, setHinting] = useState(false);

  const uniqueCards = data ? new Set(data.allPrintings.map((p) => p.cardId)).size : 0;
  const printings = data?.allPrintings.length ?? 0;
  const copies = data?.totalCopies ?? 0;

  function handleLogoTap() {
    setHinting(true);
    setTimeout(() => setHinting(false), 400);
  }

  function handleAllCollected() {
    setSpinning(true);
    setTimeout(() => {
      setSpinning(false);
      setResetKey((k) => k + 1);
    }, 1000);
  }

  return (
    <HeroBackground
      cardResetKey={resetKey}
      cardHinting={hinting}
      onAllCollected={handleAllCollected}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
        <button type="button" className="cursor-pointer" onClick={handleLogoTap}>
          <img src="/logo.webp" alt="" className={cn("size-36", spinning && "animate-logo-spin")} />
        </button>
        <h1 className="text-4xl font-bold md:text-5xl">OpenRift</h1>
        <p className="text-muted-foreground text-center">Built with Fury. Maintained with Calm.</p>

        <div className="my-3 flex items-center gap-3">
          <Link to="/cards" className={buttonVariants({ size: "lg" })}>
            Browse cards
          </Link>
          <Link
            to="/login"
            search={{ redirect: "/cards", email: undefined }}
            className={buttonVariants({
              size: "lg",
              variant: "outline",
            })}
          >
            Sign in
          </Link>
        </div>
        {data && (
          <p className="text-muted-foreground/70 text-sm">
            <span className="text-foreground font-semibold">{uniqueCards.toLocaleString()}</span>{" "}
            cards &middot;{" "}
            <span className="text-foreground font-semibold">{printings.toLocaleString()}</span>{" "}
            printings
            {copiesTracked && (
              <>
                {" "}
                &middot;{" "}
                <span className="text-foreground font-semibold">
                  {copies.toLocaleString()}
                </span>{" "}
                copies tracked
              </>
            )}
          </p>
        )}
      </div>
    </HeroBackground>
  );
}
