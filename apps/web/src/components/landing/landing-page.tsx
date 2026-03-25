import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { cn } from "@/lib/utils";

import { HeroBackground } from "./hero-background";

export function LandingPage() {
  const { data } = useQuery(catalogQueryOptions);
  const [spinning, setSpinning] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [hinting, setHinting] = useState(false);

  const uniqueCards = data ? new Set(data.allCards.map((p) => p.card.id)).size : 0;
  const printings = data?.allCards.length ?? 0;

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
      <div className="flex flex-1 flex-col items-center gap-3 justify-center p-4">
        <button type="button" className="cursor-pointer" onClick={handleLogoTap}>
          <img src="/logo.webp" alt="" className={cn("size-36", spinning && "animate-logo-spin")} />
        </button>
        <h1 className="font-bold text-4xl md:text-5xl">OpenRift</h1>
        <p className="text-center text-muted-foreground">
          Fast. Open. Ad-free. A Riftbound companion.
        </p>

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
          <p className="text-sm text-muted-foreground/70">
            <span className="font-semibold text-foreground">{uniqueCards.toLocaleString()}</span>{" "}
            cards &middot;{" "}
            <span className="font-semibold text-foreground">{printings.toLocaleString()}</span>{" "}
            printings
          </p>
        )}
      </div>
    </HeroBackground>
  );
}
