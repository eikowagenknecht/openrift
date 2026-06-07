import { create } from "zustand";
import { persist } from "zustand/middleware";

type GameStatus = "setup" | "playing" | "finished";
type GameMode = "ffa" | "teams";

/** Which side a player is on in a 2v2. Only meaningful when mode is "teams". */
export type TeamId = 0 | 1;

export interface TrackedPlayer {
  id: string;
  name: string;
  /**
   * Score toward winning. Floor 0. In "teams" mode this is the team's shared
   * total, kept equal across teammates by {@link adjustPoints}.
   */
  points: number;
  /** In-game resource, accumulated and spent. Floor 0, no cap. Always per-player. */
  xp: number;
  /** Team assignment, only used in "teams" mode (a 2v2). */
  team: TeamId;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
/** Player count required to form two teams (a 2v2). */
export const TEAM_PLAYER_COUNT = 4;

/**
 * Default points target by format: 11 for a 2v2, 8 for everything else (1v1
 * and free-for-all), matching Riftbound's rules.
 * @returns The default points target for the given mode.
 */
export function defaultPointsTarget(mode: GameMode): number {
  return mode === "teams" ? 11 : 8;
}

// Default team for the nth seat: first half on team 1, second half on team 2.
function defaultTeam(index: number): TeamId {
  return index < TEAM_PLAYER_COUNT / 2 ? 0 : 1;
}

function makePlayer(index: number): TrackedPlayer {
  return {
    id: crypto.randomUUID(),
    name: `Player ${index + 1}`,
    points: 0,
    xp: 0,
    team: defaultTeam(index),
  };
}

function clampPlayerCount(count: number): number {
  return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.floor(count)));
}

function buildPlayers(count: number): TrackedPlayer[] {
  return Array.from({ length: count }, (_, index) => makePlayer(index));
}

/**
 * The ids of everyone on the given team.
 * @returns Teammate ids (empty if no one is on that team).
 */
export function teammateIds(players: TrackedPlayer[], team: TeamId): string[] {
  return players.filter((player) => player.team === team).map((player) => player.id);
}

/**
 * Count how many players sit on each team.
 * @returns A [team 1, team 2] tuple of member counts.
 */
export function teamMemberCounts(players: TrackedPlayer[]): [number, number] {
  let first = 0;
  let second = 0;
  for (const player of players) {
    if (player.team === 0) {
      first += 1;
    } else {
      second += 1;
    }
  }
  return [first, second];
}

// Force every teammate to share their team's highest score (used after a reload).
function syncTeamPoints(players: TrackedPlayer[]): TrackedPlayer[] {
  const teamPoints = new Map<TeamId, number>();
  for (const player of players) {
    teamPoints.set(player.team, Math.max(teamPoints.get(player.team) ?? 0, player.points));
  }
  return players.map((player) => ({
    ...player,
    points: teamPoints.get(player.team) ?? player.points,
  }));
}

const DEFAULT_PLAYER_COUNT = 2;

interface MatchTrackerState {
  status: GameStatus;
  mode: GameMode;
  players: TrackedPlayer[];
  pointsTarget: number;
  firstPlayerId: string | null;
  /** The player the "who goes first?" reveal is currently flashing on, if any. Transient; never persisted. */
  spotlightPlayerId: string | null;
  winnerId: string | null;

  /** Resize the roster during setup; also resets the target to the default and drops teams below four players. */
  setPlayerCount: (count: number) => void;
  /** Switch between free-for-all and 2v2 teams. Teams need four players; ignored otherwise. */
  setMode: (mode: GameMode) => void;
  renamePlayer: (id: string, name: string) => void;
  /** Assign a player to a team (setup only, used for 2v2). */
  setPlayerTeam: (id: string, team: TeamId) => void;
  setPointsTarget: (target: number) => void;
  /** Begin (or restart) a game: zero every counter and switch to play. */
  startGame: () => void;
  /** Return to the setup screen, keeping names, teams, and target for a quick reconfigure. */
  backToSetup: () => void;
  adjustPoints: (id: string, delta: number) => void;
  adjustXp: (id: string, delta: number) => void;
  /** Mark the first player directly; pass null to clear. Ignores ids not in the roster. */
  setFirstPlayer: (id: string | null) => void;
  /** Drive the first-player reveal animation; pass null to clear the spotlight. */
  setSpotlightPlayer: (id: string | null) => void;
  /** Hide the winner banner so the table can keep adjusting after a game ends. */
  dismissWinner: () => void;
}

export const useMatchTrackerStore = create<MatchTrackerState>()(
  persist(
    (set) => ({
      status: "setup",
      mode: "ffa",
      players: buildPlayers(DEFAULT_PLAYER_COUNT),
      pointsTarget: defaultPointsTarget("ffa"),
      firstPlayerId: null,
      spotlightPlayerId: null,
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
          // Teams need exactly four players; any other count is free-for-all.
          const mode: GameMode = target === TEAM_PLAYER_COUNT ? state.mode : "ffa";
          return { players, mode, pointsTarget: defaultPointsTarget(mode) };
        }),

      setMode: (mode) =>
        set((state) => {
          if (mode === "teams" && state.players.length !== TEAM_PLAYER_COUNT) {
            return state;
          }
          return { mode, pointsTarget: defaultPointsTarget(mode) };
        }),

      renamePlayer: (id, name) =>
        set((state) => ({
          players: state.players.map((player) => (player.id === id ? { ...player, name } : player)),
        })),

      setPlayerTeam: (id, team) =>
        set((state) => ({
          players: state.players.map((player) => (player.id === id ? { ...player, team } : player)),
        })),

      setPointsTarget: (target) =>
        set({ pointsTarget: Math.max(1, Math.floor(Number.isFinite(target) ? target : 1)) }),

      startGame: () =>
        set((state) => ({
          status: "playing",
          firstPlayerId: null,
          spotlightPlayerId: null,
          winnerId: null,
          players: state.players.map((player) => ({ ...player, points: 0, xp: 0 })),
        })),

      backToSetup: () =>
        set({ status: "setup", firstPlayerId: null, spotlightPlayerId: null, winnerId: null }),

      adjustPoints: (id, delta) =>
        set((state) => {
          const actor = state.players.find((player) => player.id === id);
          if (!actor) {
            return state;
          }
          // In a 2v2 the score belongs to the team: move every teammate together.
          const linkedIds =
            state.mode === "teams"
              ? new Set(teammateIds(state.players, actor.team))
              : new Set([id]);
          const next = Math.max(0, actor.points + delta);
          let winnerId = state.winnerId;
          let status = state.status;
          // Announce a winner only at the moment the score crosses the target, so
          // dismissing the banner and nudging counters doesn't re-fire it.
          if (
            status === "playing" &&
            actor.points < state.pointsTarget &&
            next >= state.pointsTarget
          ) {
            winnerId = id;
            status = "finished";
          }
          const players = state.players.map((player) =>
            linkedIds.has(player.id) ? { ...player, points: next } : player,
          );
          return { players, winnerId, status };
        }),

      adjustXp: (id, delta) =>
        set((state) => ({
          players: state.players.map((player) =>
            player.id === id ? { ...player, xp: Math.max(0, player.xp + delta) } : player,
          ),
        })),

      setFirstPlayer: (id) =>
        set((state) => {
          if (id !== null && !state.players.some((player) => player.id === id)) {
            return state;
          }
          return { firstPlayerId: id };
        }),

      setSpotlightPlayer: (id) => set({ spotlightPlayerId: id }),

      dismissWinner: () => set({ status: "playing", winnerId: null }),
    }),
    {
      name: "openrift-match-tracker",
      partialize: (state) => ({
        status: state.status,
        mode: state.mode,
        players: state.players,
        pointsTarget: state.pointsTarget,
        firstPlayerId: state.firstPlayerId,
        winnerId: state.winnerId,
      }),
      merge: (persisted, current) => {
        const raw = persisted as
          | {
              status?: unknown;
              mode?: unknown;
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
        // Teams need exactly four players; fall back to free-for-all otherwise.
        const mode: GameMode =
          raw.mode === "teams" && players.length === TEAM_PLAYER_COUNT ? "teams" : "ffa";
        const normalizedPlayers = mode === "teams" ? syncTeamPoints(players) : players;
        const pointsTarget =
          typeof raw.pointsTarget === "number" && raw.pointsTarget >= 1
            ? Math.floor(raw.pointsTarget)
            : current.pointsTarget;
        const ids = new Set(normalizedPlayers.map((player) => player.id));
        const firstPlayerId =
          typeof raw.firstPlayerId === "string" && ids.has(raw.firstPlayerId)
            ? raw.firstPlayerId
            : null;
        const winnerId =
          typeof raw.winnerId === "string" && ids.has(raw.winnerId) ? raw.winnerId : null;
        return {
          ...current,
          status,
          mode,
          players: normalizedPlayers,
          pointsTarget,
          firstPlayerId,
          winnerId,
        };
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
  for (const [index, entry] of raw.entries()) {
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
      team: candidate.team === 1 ? 1 : candidate.team === 0 ? 0 : defaultTeam(index),
    });
  }
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    return null;
  }
  return players;
}
