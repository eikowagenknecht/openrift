import type { Printing } from "@openrift/shared";
import { getOrientation } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { useCountUp } from "@/hooks/use-count-up";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { cn } from "@/lib/utils";

import { CardScatter } from "./card-scatter";
import { FeatureHighlights } from "./feature-highlights";
import { HeroBackground } from "./hero-background";

/** @returns Front-face thumbnail URLs, excluding battlefields (landscape aspect ratio). */
function getCardThumbnailUrls(data: { allPrintings: Printing[] } | undefined): string[] {
  if (!data) {
    return [];
  }
  const urls: string[] = [];
  for (const printing of data.allPrintings) {
    if (getOrientation(printing.card.type) === "landscape") {
      continue;
    }
    const front = printing.images.find((img) => img.face === "front");
    if (front) {
      urls.push(front.thumbnail);
    }
  }
  return urls;
}

export function LandingPage() {
  const { data } = useQuery(catalogQueryOptions);
  const copiesTracked = useFeatureEnabled("copies-tracked");
  const [spinning, setSpinning] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [hinting, setHinting] = useState(false);

  const uniqueCards = data ? new Set(data.allPrintings.map((p) => p.cardId)).size : 0;
  const printings = data?.allPrintings.length ?? 0;
  const copies = data?.totalCopies ?? 0;

  // Extract front-face thumbnail URLs for the card scatter background
  const cardImageUrls = getCardThumbnailUrls(data);

  const animatedCards = useCountUp(uniqueCards);
  const animatedPrintings = useCountUp(printings);
  const animatedCopies = useCountUp(copies);

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
    <HeroBackground>
      <div className="relative flex min-h-[calc(100svh-var(--header-height))] flex-col items-center justify-center p-4">
        <CardScatter
          key={resetKey}
          flyIn={resetKey > 0}
          hinting={hinting}
          imageUrls={cardImageUrls}
          onAllCollected={handleAllCollected}
        />
        <div
          data-card-blocker=""
          className="flex flex-col items-center gap-3 rounded-2xl px-8 py-10"
        >
          <button type="button" className="cursor-pointer" onClick={handleLogoTap}>
            <img
              src="/logo.webp"
              alt=""
              className={cn("size-36", spinning && "animate-logo-spin")}
            />
          </button>
          <h1 className="text-4xl font-bold md:text-5xl">OpenRift</h1>
          <p className="text-muted-foreground text-center text-lg">
            An open-source Riftbound collection tracker &amp; deck builder
          </p>
          <p className="text-muted-foreground/60 text-center text-xs italic">
            Built with Fury. Maintained with Calm.
          </p>

          <div className="my-3 flex flex-wrap items-center justify-center gap-3">
            <Link to="/cards" className={buttonVariants({ size: "lg" })}>
              Browse cards
            </Link>
            <Link
              to="/signup"
              search={{ redirect: "/cards", email: undefined }}
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Sign up
            </Link>
            <Link
              to="/login"
              search={{ redirect: "/cards", email: undefined }}
              className={buttonVariants({ size: "lg", variant: "ghost" })}
            >
              Sign in
            </Link>
          </div>
          {data && (
            <p className="text-muted-foreground/70 text-sm tabular-nums">
              <span className="text-foreground font-semibold">
                {animatedCards.toLocaleString()}
              </span>{" "}
              cards &middot;{" "}
              <span className="text-foreground font-semibold">
                {animatedPrintings.toLocaleString()}
              </span>{" "}
              printings
              {copiesTracked && (
                <>
                  {" "}
                  &middot;{" "}
                  <span className="text-foreground font-semibold">
                    {animatedCopies.toLocaleString()}
                  </span>{" "}
                  copies tracked
                </>
              )}
            </p>
          )}
        </div>
      </div>
      <FeatureHighlights />
    </HeroBackground>
  );
}
