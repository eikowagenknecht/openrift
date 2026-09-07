import { TrophyIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useShallow } from "zustand/react/shallow";

import { Heading } from "@/components/heading";
import { MatchSeamControls } from "@/components/match-tracker/match-seam-controls";
import { PlayerPanel } from "@/components/match-tracker/player-panel";
import { SetupScreen } from "@/components/match-tracker/setup-screen";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsLandscape } from "@/hooks/use-is-landscape";
import {
  medallionSizeTier,
  perRowHeight,
  planSeats,
  scoreSizeClass,
  xpSizeTier,
} from "@/lib/match-layout";
import type { MedallionSize, Seat, XpSize } from "@/lib/match-layout";
import { useMatchTrackerStore } from "@/stores/match-tracker-store";

// The store reads localStorage, so rendering is gated behind hydration to avoid an SSR mismatch.
export function MatchTrackerPage() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  return <MatchTracker />;
}

function MatchTracker() {
  const status = useMatchTrackerStore((state) => state.status);
  if (status === "setup") {
    return <SetupScreen />;
  }
  return <MatchBoard />;
}

function MatchBoard() {
  const playerIds = useMatchTrackerStore(useShallow((state) => state.players.map((p) => p.id)));
  const isLandscape = useIsLandscape();
  const rows = planSeats(playerIds, isLandscape);

  const boardRef = useRef<HTMLDivElement>(null);
  const boardHeight = useMeasuredHeight(boardRef);
  const panelHeight = perRowHeight(boardHeight, rows.length);
  const scoreClass = scoreSizeClass(panelHeight);
  const medSize = medallionSizeTier(panelHeight);
  const xpSize = xpSizeTier(panelHeight);

  return (
    // Clears the iOS safe areas so a landscape Dynamic Island (sides) and home indicator
    // (bottom) don't cover the edge panels; max() keeps the 8px gutter where insets are 0.
    <div className="relative flex min-h-0 flex-1 flex-col pt-2 pr-[max(0.5rem,env(safe-area-inset-right,0px))] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pl-[max(0.5rem,env(safe-area-inset-left,0px))]">
      <div ref={boardRef} className="relative flex min-h-0 flex-1 flex-col gap-2">
        {rows.map((seats) => (
          <BoardRow
            key={seats.map((seat) => seat.id).join("-")}
            seats={seats}
            scoreClass={scoreClass}
            medSize={medSize}
            xpSize={xpSize}
          />
        ))}
        <MatchSeamControls />
      </div>
      <WinnerBanner />
    </div>
  );
}

// Measured in a layout effect so the corrected value lands before the browser paints.
function useMeasuredHeight(ref: RefObject<HTMLDivElement | null>): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    let rafId = 0;
    const measure = () => setHeight(element.clientHeight);
    measure();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [ref]);
  return height;
}

function BoardRow({
  seats,
  scoreClass,
  medSize,
  xpSize,
}: {
  seats: Seat[];
  scoreClass: string;
  medSize: MedallionSize;
  xpSize: XpSize;
}) {
  return (
    <div className="flex min-h-0 flex-1 gap-2">
      {seats.map((seat) => (
        <PlayerPanel
          key={seat.id}
          playerId={seat.id}
          rotated={seat.rotated}
          scoreClass={scoreClass}
          medSize={medSize}
          xpSize={xpSize}
        />
      ))}
    </div>
  );
}

function WinnerBanner() {
  const winner = useMatchTrackerStore(
    useShallow((state) => {
      const player = state.players.find((entry) => entry.id === state.winnerId);
      if (!player) {
        return null;
      }
      if (state.mode === "teams") {
        const names = state.players
          .filter((entry) => entry.team === player.team)
          .map((entry) => entry.name);
        return { name: names.join(" & "), isTeam: true };
      }
      return { name: player.name, isTeam: false };
    }),
  );
  const startGame = useMatchTrackerStore((state) => state.startGame);
  const backToSetup = useMatchTrackerStore((state) => state.backToSetup);
  const dismissWinner = useMatchTrackerStore((state) => state.dismissWinner);

  if (!winner) {
    return null;
  }

  return (
    // z-30: above the seam controls (z-20), which don't sit in their own stacking context.
    <div className="bg-background/80 absolute inset-0 z-30 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-card w-full max-w-sm space-y-4 rounded-lg border p-6 text-center shadow-lg">
        <TrophyIcon className="text-primary mx-auto size-10" />
        <Heading level={2}>
          {winner.name} {winner.isTeam ? "win" : "wins"}!
        </Heading>
        <div className="flex flex-col gap-2">
          <Button onClick={() => startGame()}>Rematch</Button>
          <Button variant="outline" onClick={() => backToSetup()}>
            New players
          </Button>
          <Button variant="ghost" onClick={() => dismissWinner()}>
            Keep adjusting
          </Button>
        </div>
      </div>
    </div>
  );
}
