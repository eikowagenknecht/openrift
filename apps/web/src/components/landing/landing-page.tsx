import { imageUrl } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCountUp } from "@/hooks/use-count-up";
import { landingSummaryQueryOptions } from "@/lib/landing-summary-query";
import { cn } from "@/lib/utils";

import { CardFan } from "./card-fan";
import { FeatureShowcase } from "./feature-showcase";
import { HeroBackground } from "./hero-background";

// How long the logo "tap to play" hint stays visible after a tap.
const HINT_DURATION_MS = 400;
// How long the celebratory logo spin runs before the fan re-deals.
const SPIN_DURATION_MS = 1000;

// Hextech-style 45° corner cut for the hero CTAs. Applied via clip-path,
// so the outline variant needs the wrapper trick below for its border.
const CTA_CLIP = "polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)";

function HeroCtas({ className }: { className?: string }) {
  return (
    <div className={cn("my-3 flex flex-wrap items-center justify-center gap-3", className)}>
      <Link
        to="/cards"
        // ring-inset because the clip-path would cut off an outset focus ring.
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring font-heading inline-flex h-11 items-center px-7 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        style={{ clipPath: CTA_CLIP }}
      >
        Browse cards
      </Link>
      {/* clip-path clips the border off the diagonal edge, so the gold hairline
          is a clipped wrapper showing through 1px of padding. */}
      <span className="bg-border-accent inline-block p-px" style={{ clipPath: CTA_CLIP }}>
        <Link
          to="/signup"
          search={{ redirect: undefined, email: undefined }}
          className="bg-background hover:bg-secondary focus-visible:ring-ring font-heading inline-flex h-11 items-center px-7 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
          style={{ clipPath: CTA_CLIP }}
        >
          Sign up free
        </Link>
      </span>
    </div>
  );
}

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

  // Idle-time preload of /cards: fetches the lazy chunk, runs the loader, and
  // (via the loader's catalog query) warms the catalog into the client
  // QueryClient. By the time a user taps "Browse cards" the route can render
  // the live grid instantly — no chunk fetch, no SSR shell, no Suspense
  // fallback. Mobile-friendly: doesn't depend on hover/touchstart intent.
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

  return (
    <HeroBackground>
      {/* Extra top padding below lg: the stacked text+fan column can exceed
          the viewport, and justify-center then pins the logo right under the
          header. On lg the two-column grid centers with room to spare. */}
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
                  <Badge
                    variant="subtle"
                    className="h-auto rounded py-1 leading-none font-semibold uppercase"
                  >
                    Beta
                  </Badge>
                </div>
                {/* The motto lives in the brand lockup: as a free-standing
                    row below it competed with the tagline. */}
                <p className="text-muted-foreground/60 text-xs italic">
                  Built with Fury. Maintained with Calm.
                </p>
              </div>
            </div>
            <p className="text-muted-foreground text-lg">
              The fastest way to track your Riftbound collection.
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
      </div>
      {/* The fan uses thumbnails 0-4; the catalog vignette takes the next
          four so no card appears twice on screen. */}
      <FeatureShowcase thumbnailUrls={thumbnailUrls.slice(5)} cardCount={data?.cardCount} />
    </HeroBackground>
  );
}
