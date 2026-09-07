import { imageUrl } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useCountUp } from "@/hooks/use-count-up";
import { landingSummaryQueryOptions } from "@/lib/landing-summary-query";
import { landingThumbnailCards } from "@/lib/landing-thumbnails";
import { cn } from "@/lib/utils";

import { CardFan } from "./card-fan";
import { FeatureShowcase } from "./feature-showcase";
import { HeroBackground } from "./hero-background";
import { HeroCtas } from "./hero-ctas";
import { LandingClosing } from "./landing-closing";

const HINT_DURATION_MS = 400;
const SPIN_DURATION_MS = 1000;

function HeroStats({
  cardCount,
  printingCount,
  copyCount,
  className,
}: {
  cardCount: number;
  printingCount: number;
  copyCount: number;
  className?: string;
}) {
  const numberClass = "font-heading text-muted-foreground font-semibold";
  return (
    <p className={cn("text-muted-foreground/50 text-center text-sm tabular-nums", className)}>
      <span className={numberClass}>{cardCount.toLocaleString()}</span> cards &middot;{" "}
      <span className={numberClass}>{printingCount.toLocaleString()}</span> printings &middot;{" "}
      <span className={numberClass}>{copyCount.toLocaleString()}</span> copies tracked
    </p>
  );
}

export function LandingPage() {
  const router = useRouter();
  const { data } = useQuery(landingSummaryQueryOptions);
  const [spinning, setSpinning] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [hinting, setHinting] = useState(false);

  // Idle-time preload of /cards: warms the lazy chunk and catalog query so
  // "Browse cards" renders the live grid instantly.
  useEffect(() => {
    if (typeof requestIdleCallback === "undefined") {
      return;
    }
    const handle = requestIdleCallback(() => {
      void router.preloadRoute({ to: "/cards" });
    });
    return () => cancelIdleCallback(handle);
  }, [router]);

  const animatedCards = useCountUp(data?.cardCount ?? 0);
  const animatedPrintings = useCountUp(data?.printingCount ?? 0);
  const animatedCopies = useCountUp(data?.copyCount ?? 0);

  function handleLogoTap() {
    setHinting(true);
    setTimeout(() => setHinting(false), HINT_DURATION_MS);
  }

  function handleAllCollected() {
    setSpinning(true);
    setTimeout(() => {
      setSpinning(false);
      setResetKey((key) => key + 1);
    }, SPIN_DURATION_MS);
  }

  const thumbnailUrls = (data?.thumbnailIds ?? []).map((id) => imageUrl(id, "400w"));
  const thumbnailCards = landingThumbnailCards(data?.thumbnails);

  return (
    <HeroBackground>
      {/* Extra top padding below lg: the stacked column can exceed the
          viewport, and justify-center would pin the logo under the header. */}
      <div className="relative flex min-h-[calc(100svh-var(--header-height))] flex-col justify-center p-4 pt-12 lg:pt-4">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
          <div className="flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="ghost"
                aria-label="OpenRift"
                className="h-auto cursor-pointer rounded-2xl p-0 hover:bg-transparent dark:hover:bg-transparent"
                onClick={handleLogoTap}
              >
                <img
                  src="/logo-color.svg"
                  alt=""
                  fetchPriority="high"
                  className={cn("size-16", spinning && "animate-logo-spin")}
                />
              </Button>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-center gap-3 lg:justify-start">
                  <h1 className="font-heading text-4xl font-bold md:text-5xl">OpenRift</h1>
                </div>
                <p className="text-muted-foreground/60 text-xs italic">
                  Built with Fury. Maintained with Calm.
                </p>
              </div>
            </div>
            <p className="text-muted-foreground text-lg">
              The Riftbound app for you and your playgroup. Fast, free, and open source.
            </p>
            <HeroCtas />
            {data && (
              <HeroStats
                cardCount={animatedCards}
                printingCount={animatedPrintings}
                copyCount={animatedCopies}
                className="lg:text-left"
              />
            )}
          </div>
          <CardFan
            key={resetKey}
            imageUrls={thumbnailUrls}
            hinting={hinting}
            onAllCollected={handleAllCollected}
          />
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-1"
        >
          <span className="text-muted-foreground/60 text-sm">See it in action</span>
          <ChevronDownIcon className="text-muted-foreground/40 size-6 motion-safe:animate-bounce" />
        </span>
      </div>
      {/* The fan uses thumbnails 0-4; the scanner vignette takes the next
          four so no card appears twice on screen. */}
      <FeatureShowcase
        scanCards={thumbnailCards.slice(5, 9)}
        thumbnailUrls={thumbnailUrls.slice(9, 17)}
      />
      <LandingClosing />
    </HeroBackground>
  );
}
