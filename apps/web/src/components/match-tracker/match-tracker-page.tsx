import { TrophyIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { Heading } from "@/components/heading";
import { MatchToolbar } from "@/components/match-tracker/match-toolbar";
import { PlayerPanel } from "@/components/match-tracker/player-panel";
import { SetupScreen } from "@/components/match-tracker/setup-screen";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { useMatchTrackerStore } from "@/stores/match-tracker-store";

/**
 * Match tracker entry point. The store reads localStorage, so rendering is
 * gated behind hydration to avoid an SSR mismatch (see docs/contributing.md).
 * @returns The tracker, or null during SSR / before hydration.
 */
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
  const topCount = Math.floor(playerIds.length / 2);
  const topIds = playerIds.slice(0, topCount);
  const bottomIds = playerIds.slice(topCount);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
      <MatchToolbar />
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {topIds.length > 0 && <BoardRow ids={topIds} rotated />}
        <BoardRow ids={bottomIds} rotated={false} />
      </div>
      <WinnerBanner />
    </div>
  );
}

function BoardRow({ ids, rotated }: { ids: string[]; rotated: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {ids.map((id) => (
        <PlayerPanel key={id} playerId={id} rotated={rotated} />
      ))}
    </div>
  );
}

function WinnerBanner() {
  const winnerName = useMatchTrackerStore((state) => {
    const winner = state.players.find((player) => player.id === state.winnerId);
    return winner?.name ?? null;
  });
  const startGame = useMatchTrackerStore((state) => state.startGame);
  const backToSetup = useMatchTrackerStore((state) => state.backToSetup);
  const dismissWinner = useMatchTrackerStore((state) => state.dismissWinner);

  if (!winnerName) {
    return null;
  }

  return (
    <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-card w-full max-w-sm space-y-4 rounded-xl border p-6 text-center shadow-lg">
        <TrophyIcon className="text-primary mx-auto size-10" />
        <Heading level={2}>{winnerName} wins!</Heading>
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
