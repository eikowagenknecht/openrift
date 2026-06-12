import { imageUrl } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCountUp } from "@/hooks/use-count-up";
import { landingSummaryQueryOptions } from "@/lib/landing-summary-query";
import { cn } from "@/lib/utils";

import { CardScatter } from "./card-scatter";
import { FeatureHighlights } from "./feature-highlights";
import { HeroBackground } from "./hero-background";

// How long the logo "tap to play" hint stays visible after a tap.
const HINT_DURATION_MS = 400;
// How long the celebratory logo spin runs before the scatter resets.
const SPIN_DURATION_MS = 1000;

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

  return (
    <HeroBackground>
      <div className="relative flex min-h-[calc(100svh-var(--header-height))] flex-col items-center justify-center p-4">
        <CardScatter
          key={resetKey}
          flyIn={resetKey > 0}
          hinting={hinting}
          imageUrls={(data?.thumbnailIds ?? []).map((id) => imageUrl(id, "400w"))}
          onAllCollected={handleAllCollected}
        />
        <div
          data-card-blocker=""
          className="flex flex-col items-center gap-3 rounded-2xl px-8 py-10"
        >
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
              className={cn("size-36", spinning && "animate-logo-spin")}
            />
          </Button>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-4xl font-bold md:text-5xl">OpenRift</h1>
            <Badge
              variant="subtle"
              className="h-auto rounded py-1 leading-none font-semibold uppercase"
            >
              Beta
            </Badge>
          </div>
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
              search={{ redirect: undefined, email: undefined }}
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
            <p className="text-muted-foreground/70 text-center text-sm tabular-nums">
              <span className="text-foreground font-semibold">
                {animatedCards.toLocaleString()}
              </span>{" "}
              cards &middot;{" "}
              <span className="text-foreground font-semibold">
                {animatedPrintings.toLocaleString()}
              </span>{" "}
              printings &middot;{" "}
              <span className="text-foreground font-semibold">
                {animatedCopies.toLocaleString()}
              </span>{" "}
              copies tracked
            </p>
          )}
        </div>
      </div>
      <FeatureHighlights />
    </HeroBackground>
  );
}
