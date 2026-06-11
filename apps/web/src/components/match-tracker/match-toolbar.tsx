import {
  CheckIcon,
  ChevronDownIcon,
  DicesIcon,
  FlagIcon,
  RotateCcwIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFirstPlayerSpotlight } from "@/hooks/use-first-player-spotlight";
import { useMatchTrackerStore } from "@/stores/match-tracker-store";

/**
 * Above-board controls: the first-player picker (a random spotlight reveal or
 * a specific player) and the reset / reconfigure actions.
 * @returns The toolbar row.
 */
export function MatchToolbar() {
  // Subscribe to the raw (referentially stable) players array; mapping to fresh
  // objects in the selector would defeat useShallow and trigger a render loop.
  const players = useMatchTrackerStore((state) => state.players);
  const firstPlayerId = useMatchTrackerStore((state) => state.firstPlayerId);
  const setFirstPlayer = useMatchTrackerStore((state) => state.setFirstPlayer);
  const startGame = useMatchTrackerStore((state) => state.startGame);
  const backToSetup = useMatchTrackerStore((state) => state.backToSetup);
  const { isRolling, roll } = useFirstPlayerSpotlight();

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />} disabled={isRolling}>
          <SparklesIcon className="size-4" />
          Who goes first?
          <ChevronDownIcon className="size-4 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => roll()}>
            <DicesIcon className="size-4" />
            Random
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {players.map((player) => (
            <DropdownMenuItem key={player.id} onClick={() => setFirstPlayer(player.id)}>
              <FlagIcon className="size-4" />
              {player.name}
              {player.id === firstPlayerId && <CheckIcon className="ml-auto size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" onClick={() => backToSetup()}>
        <Settings2Icon className="size-4" />
        Setup
      </Button>
      <Button variant="outline" size="sm" onClick={() => startGame()}>
        <RotateCcwIcon className="size-4" />
        New round
      </Button>
    </div>
  );
}
