import { mathRandom } from "@openrift/shared";
import type { PackRandom as Random } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type GameStatus = "setup" | "playing" | "finished";

export interface TrackedPlayer {
  id: string;
  name: string;
  /** Score toward winning. Floor 0. */
  points: number;
  /** In-game resource, accumulated and spent. Floor 0, no cap. */
  xp: number;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/**
 * Default points target by player count: 8 for a 1v1, 11 once a third player
 * joins (the team-play threshold from Riftbound's rules).
 * @returns The default points target for the given player count.
 */
export function defaultTargetForPlayerCount(playerCount: number): number {
  return playerCount <= 2 ? 8 : 11;
}

function makePlayer(index: number): TrackedPlayer {
  return { id: crypto.randomUUID(), name: `Player ${index + 1}`, points: 0, xp: 0 };
}

function clampPlayerCount(count: number): number {
  return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.floor(count)));
}

function buildPlayers(count: number): TrackedPlayer[] {
  return Array.from({ length: count }, (_, index) => makePlayer(index));
}

const DEFAULT_PLAYER_COUNT = 2;

interface MatchTrackerState {
  status: GameStatus;
  players: TrackedPlayer[];
  pointsTarget: number;
  firstPlayerId: string | null;
  winnerId: string | null;

  /** Resize the roster during setup; also resets the target to the per-count default. */
  setPlayerCount: (count: number) => void;
  renamePlayer: (id: string, name: string) => void;
  setPointsTarget: (target: number) => void;
  /** Begin (or restart) a game: zero every counter and switch to play. */
  startGame: () => void;
  /** Return to the setup screen, keeping names and target for a quick reconfigure. */
  backToSetup: () => void;
  adjustPoints: (id: string, delta: number) => void;
  adjustXp: (id: string, delta: number) => void;
  pickFirstPlayer: (random?: Random) => void;
  /** Hide the winner banner so the table can keep adjusting after a game ends. */
  dismissWinner: () => void;
}

export const useMatchTrackerStore = create<MatchTrackerState>()(
  persist(
    (set) => ({
      status: "setup",
      players: buildPlayers(DEFAULT_PLAYER_COUNT),
      pointsTarget: defaultTargetForPlayerCount(DEFAULT_PLAYER_COUNT),
      firstPlayerId: null,
      winnerId: null,

      setPlayerCount: (count) =>
        set((state) => {
          const target = clampPlayerCount(count);
          if (target === state.players.length) {
            return state;
          }
          const players =
            target > state.players.length
              ? [
                  ...state.players,
                  ...Array.from({ length: target - state.players.length }, (_, offset) =>
                    makePlayer(state.players.length + offset),
                  ),
                ]
              : state.players.slice(0, target);
          return { players, pointsTarget: defaultTargetForPlayerCount(target) };
        }),

      renamePlayer: (id, name) =>
        set((state) => ({
          players: state.players.map((player) => (player.id === id ? { ...player, name } : player)),
        })),

      setPointsTarget: (target) =>
        set({ pointsTarget: Math.max(1, Math.floor(Number.isFinite(target) ? target : 1)) }),

      startGame: () =>
        set((state) => ({
          status: "playing",
          firstPlayerId: null,
          winnerId: null,
          players: state.players.map((player) => ({ ...player, points: 0, xp: 0 })),
        })),

      backToSetup: () => set({ status: "setup", firstPlayerId: null, winnerId: null }),

      adjustPoints: (id, delta) =>
        set((state) => {
          let winnerId = state.winnerId;
          let status = state.status;
          const players = state.players.map((player) => {
            if (player.id !== id) {
              return player;
            }
            const next = Math.max(0, player.points + delta);
            // Announce a winner only at the moment a player crosses the target,
            // so dismissing the banner and nudging counters doesn't re-fire it.
            if (
              status === "playing" &&
              player.points < state.pointsTarget &&
              next >= state.pointsTarget
            ) {
              winnerId = id;
              status = "finished";
            }
            return { ...player, points: next };
          });
          return { players, winnerId, status };
        }),

      adjustXp: (id, delta) =>
        set((state) => ({
          players: state.players.map((player) =>
            player.id === id ? { ...player, xp: Math.max(0, player.xp + delta) } : player,
          ),
        })),

      pickFirstPlayer: (random = mathRandom) =>
        set((state) => {
          if (state.players.length === 0) {
            return state;
          }
          const index = Math.min(
            state.players.length - 1,
            Math.floor(random.next() * state.players.length),
          );
          return { firstPlayerId: state.players[index]?.id ?? null };
        }),

      dismissWinner: () => set({ status: "playing", winnerId: null }),
    }),
    {
      name: "openrift-match-tracker",
      partialize: (state) => ({
        status: state.status,
        players: state.players,
        pointsTarget: state.pointsTarget,
        firstPlayerId: state.firstPlayerId,
        winnerId: state.winnerId,
      }),
      merge: (persisted, current) => {
        const raw = persisted as
          | {
              status?: unknown;
              players?: unknown;
              pointsTarget?: unknown;
              firstPlayerId?: unknown;
              winnerId?: unknown;
            }
          | undefined;
        if (!raw) {
          return current;
        }
        const players = sanitizePlayers(raw.players);
        if (!players) {
          return current;
        }
        const status: GameStatus =
          raw.status === "playing" || raw.status === "finished" ? raw.status : "setup";
        const pointsTarget =
          typeof raw.pointsTarget === "number" && raw.pointsTarget >= 1
            ? Math.floor(raw.pointsTarget)
            : current.pointsTarget;
        const ids = new Set(players.map((player) => player.id));
        const firstPlayerId =
          typeof raw.firstPlayerId === "string" && ids.has(raw.firstPlayerId)
            ? raw.firstPlayerId
            : null;
        const winnerId =
          typeof raw.winnerId === "string" && ids.has(raw.winnerId) ? raw.winnerId : null;
        return { ...current, status, players, pointsTarget, firstPlayerId, winnerId };
      },
    },
  ),
);

/**
 * Validate a persisted players blob, clamping counters and rejecting rosters
 * outside the allowed size. Returns null when the blob can't be trusted.
 * @returns Sanitized players, or null to fall back to the current state.
 */
function sanitizePlayers(raw: unknown): TrackedPlayer[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const players: TrackedPlayer[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.name !== "string") {
      continue;
    }
    players.push({
      id: candidate.id,
      name: candidate.name,
      points:
        typeof candidate.points === "number" && candidate.points >= 0
          ? Math.floor(candidate.points)
          : 0,
      xp: typeof candidate.xp === "number" && candidate.xp >= 0 ? Math.floor(candidate.xp) : 0,
    });
  }
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    return null;
  }
  return players;
}
