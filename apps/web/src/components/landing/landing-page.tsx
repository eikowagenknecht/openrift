import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { cn } from "@/lib/utils";

import { HeroBackground } from "./hero-background";

export function LandingPage() {
  const { data } = useQuery(catalogQueryOptions);
  const [spinning, setSpinning] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [hinting, setHinting] = useState(false);

  const uniqueCards = data ? new Set(data.allCards.map((p) => p.cardId)).size : 0;
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
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <button type="button" className="cursor-pointer" onClick={handleLogoTap}>
          <img
            src="/logo.webp"
            alt=""
            className={cn("size-28 drop-shadow-lg md:size-36", spinning && "animate-logo-spin")}
          />
        </button>

        <h1 className="mt-6 text-4xl font-bold tracking-tight md:text-5xl">OpenRift</h1>
        <p className="mt-3 text-center text-lg text-muted-foreground">
          Fast. Open. Ad-free. A Riftbound companion.
        </p>
        {data && (
          <p className="mt-2 animate-in fade-in text-sm text-muted-foreground/70">
            <span className="font-semibold text-foreground">{uniqueCards.toLocaleString()}</span>{" "}
            cards &middot;{" "}
            <span className="font-semibold text-foreground">{printings.toLocaleString()}</span>{" "}
            printings
          </p>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <Button
              size="lg"
              className="h-11 px-8 text-base"
              nativeButton={false}
              render={<Link to="/cards" />}
            >
              Browse cards
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 px-8 text-base"
              nativeButton={false}
              render={<Link to="/login" search={{ redirect: "/cards", email: undefined }} />}
            >
              Sign in
            </Button>
          </div>
          <Link
            to="/roadmap"
            className="text-sm text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            See what we&apos;re working on next &rarr;
          </Link>
        </div>
      </div>
    </HeroBackground>
  );
}
