import { create } from "zustand";
import { persist } from "zustand/middleware";

import { randomUuid } from "@/lib/random-uuid";

type GameStatus = "setup" | "playing" | "finished";
type GameMode = "ffa" | "teams";

/** Which side a player is on in a 2v2. Only meaningful when mode is "teams". */
export type TeamId = 0 | 1;

/**
 * Why a point was scored. The three Riftbound routes are their own reasons so
 * the board can record what happened, not just the total; "manual" covers XP
 * and score corrections, which have no route.
 */
export type ScoreReason = "conquer" | "hold" | "ability" | "manual";

/** The reasons that get their own control on the board, in display order. */
export const SCORE_REASONS = [
  "conquer",
  "hold",
  "ability",
] as const satisfies readonly ScoreReason[];

export const SCORE_REASON_LABELS: Record<ScoreReason, string> = {
  conquer: "Conquer",
  hold: "Hold",
  ability: "Ability",
  manual: "Manual",
};

/**
 * A legend chosen for a seat, denormalized so the board renders straight from
 * local state. The tracker works offline and the catalog is only read while the
 * picker is open, so nothing here may be a live catalog reference.
 */
export interface TrackedLegend {
  cardId: string;
  /** Already run through `legendDisplayName`. */
  name: string;
  /** Drives the panel glow; one or two entries. */
  domains: string[];
  /** Front-face art for the panel backdrop, or null when the printing has none. */
  thumbnail: string | null;
}

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
  /** Cosmetic only — picks the panel art and glow. Never implies a deck. */
  legend: TrackedLegend | null;
  /**
   * Whether this player's XP rail is open. Most decks never use XP, so it
   * starts closed and shows only a tab. Personal, so opening one seat's rail
   * leaves the others alone.
   */
  xpOpen: boolean;
}

/**
 * One reversible change. `prev` holds the exact values the affected players had
 * beforehand, so undo restores correctly even when the change was clamped at 0,
 * and the status pair restores a game that a point had ended.
 */
export interface MatchAction {
  playerId: string;
  kind: "points" | "xp";
  reason: ScoreReason;
  /** Signed change as applied, used to label the undo row. */
  delta: number;
  prev: { id: string; value: number }[];
  prevStatus: GameStatus;
  prevWinnerId: string | null;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
/** Player count required to form two teams (a 2v2). */
const TEAM_PLAYER_COUNT = 4;
/** How many actions stay reversible. Deep enough for a run of mis-taps. */
const MAX_LOG = 30;

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
    id: randomUuid(),
    name: `Player ${index + 1}`,
    points: 0,
    xp: 0,
    team: defaultTeam(index),
    legend: null,
    xpOpen: false,
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

/**
 * Describe the action an undo would reverse, for the menu row that names it
 * before you commit ("Undo Kira's Conquer").
 * @returns A label, or null when there is nothing to undo.
 */
export function describeAction(
  action: MatchAction | undefined,
  players: TrackedPlayer[],
): string | null {
  if (!action) {
    return null;
  }
  const who = players.find((player) => player.id === action.playerId)?.name ?? "player";
  if (action.kind === "xp") {
    return `Undo ${who}'s XP change`;
  }
  if (action.reason === "manual") {
    return `Undo ${who}'s score correction`;
  }
  return `Undo ${who}'s ${SCORE_REASON_LABELS[action.reason]}`;
}

/**
 * Whether a player is one point from taking the game. Drives the corner
 * brackets on their panel.
 * @returns True when the player's score is exactly one short of the target.
 */
export function isMatchPoint(player: TrackedPlayer, pointsTarget: number): boolean {
  return player.points === pointsTarget - 1;
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
  /** Reversible changes, oldest first. Transient — a reload starts a fresh log. */
  log: MatchAction[];

  /** Resize the roster during setup; also resets the target to the default and drops teams below four players. */
  setPlayerCount: (count: number) => void;
  /** Switch between free-for-all and 2v2 teams. Teams need four players; ignored otherwise. */
  setMode: (mode: GameMode) => void;
  renamePlayer: (id: string, name: string) => void;
  /** Assign a player to a team (setup only, used for 2v2). */
  setPlayerTeam: (id: string, team: TeamId) => void;
  /** Attach or clear a seat's legend. Cosmetic; survives games like the name does. */
  setLegend: (id: string, legend: TrackedLegend | null) => void;
  setPointsTarget: (target: number) => void;
  /** Begin (or restart) a game: zero every counter and switch to play. */
  startGame: () => void;
  /** Return to the setup screen, keeping names, legends, teams, and target. */
  backToSetup: () => void;
  /** Move a player's score, recording why so the change can be described and reversed. */
  adjustPoints: (id: string, delta: number, reason?: ScoreReason) => void;
  /** Set a score outright, for correcting drift rather than scoring. */
  setScore: (id: string, next: number) => void;
  adjustXp: (id: string, delta: number) => void;
  /** Open a player's XP rail. The opening tap also counts as the first point of XP. */
  openXp: (id: string) => void;
  /** Reverse the most recent change. No-op when the log is empty. */
  undoLast: () => void;
  /** Mark the first player directly; pass null to clear. Ignores ids not in the roster. */
  setFirstPlayer: (id: string | null) => void;
  /** Drive the first-player reveal animation; pass null to clear the spotlight. */
  setSpotlightPlayer: (id: string | null) => void;
  /** Hide the winner banner so the table can keep adjusting after a game ends. */
  dismissWinner: () => void;
}

// Append an action, dropping the oldest once the log is full.
function pushLog(log: MatchAction[], action: MatchAction): MatchAction[] {
  const next = [...log, action];
  return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;
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
      log: [],

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

      setLegend: (id, legend) =>
        set((state) => ({
          players: state.players.map((player) =>
            player.id === id ? { ...player, legend } : player,
          ),
        })),

      setPointsTarget: (target) =>
        set({ pointsTarget: Math.max(1, Math.floor(Number.isFinite(target) ? target : 1)) }),

      startGame: () =>
        set((state) => ({
          status: "playing",
          firstPlayerId: null,
          spotlightPlayerId: null,
          winnerId: null,
          log: [],
          players: state.players.map((player) => ({
            ...player,
            points: 0,
            xp: 0,
            xpOpen: false,
          })),
        })),

      backToSetup: () =>
        set({
          status: "setup",
          firstPlayerId: null,
          spotlightPlayerId: null,
          winnerId: null,
          log: [],
        }),

      adjustPoints: (id, delta, reason = "manual") =>
        set((state) => {
          const actor = state.players.find((player) => player.id === id);
          if (!actor) {
            return state;
          }
          return applyScore(state, actor, Math.max(0, actor.points + delta), delta, reason);
        }),

      setScore: (id, next) =>
        set((state) => {
          const actor = state.players.find((player) => player.id === id);
          if (!actor) {
            return state;
          }
          const target = Math.max(0, Math.floor(Number.isFinite(next) ? next : 0));
          if (target === actor.points) {
            return state;
          }
          return applyScore(state, actor, target, target - actor.points, "manual");
        }),

      adjustXp: (id, delta) =>
        set((state) => {
          const actor = state.players.find((player) => player.id === id);
          if (!actor) {
            return state;
          }
          const next = Math.max(0, actor.xp + delta);
          return {
            players: state.players.map((player) =>
              player.id === id ? { ...player, xp: next } : player,
            ),
            log: pushLog(state.log, {
              playerId: id,
              kind: "xp",
              reason: "manual",
              delta,
              prev: [{ id, value: actor.xp }],
              prevStatus: state.status,
              prevWinnerId: state.winnerId,
            }),
          };
        }),

      openXp: (id) =>
        set((state) => {
          const actor = state.players.find((player) => player.id === id);
          if (!actor || actor.xpOpen) {
            return state;
          }
          // The tap that opens the rail is also the first point of XP, so
          // nobody has to press twice to get to 1.
          return {
            players: state.players.map((player) =>
              player.id === id ? { ...player, xpOpen: true, xp: player.xp + 1 } : player,
            ),
            log: pushLog(state.log, {
              playerId: id,
              kind: "xp",
              reason: "manual",
              delta: 1,
              prev: [{ id, value: actor.xp }],
              prevStatus: state.status,
              prevWinnerId: state.winnerId,
            }),
          };
        }),

      undoLast: () =>
        set((state) => {
          const action = state.log.at(-1);
          if (!action) {
            return state;
          }
          const restore = new Map(action.prev.map((entry) => [entry.id, entry.value]));
          return {
            players: state.players.map((player) => {
              const value = restore.get(player.id);
              if (value === undefined) {
                return player;
              }
              return action.kind === "points"
                ? { ...player, points: value }
                : { ...player, xp: value };
            }),
            status: action.prevStatus,
            winnerId: action.prevWinnerId,
            log: state.log.slice(0, -1),
          };
        }),

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
 * Move a player's score to `next`, carrying the whole team in a 2v2, announcing
 * a winner if the change crosses the target, and logging enough to reverse it.
 * @returns The state patch to apply.
 */
function applyScore(
  state: MatchTrackerState,
  actor: TrackedPlayer,
  next: number,
  delta: number,
  reason: ScoreReason,
): Partial<MatchTrackerState> {
  // In a 2v2 the score belongs to the team: move every teammate together.
  const linkedIds =
    state.mode === "teams" ? new Set(teammateIds(state.players, actor.team)) : new Set([actor.id]);
  let winnerId = state.winnerId;
  let status = state.status;
  // Announce a winner only at the moment the score crosses the target, so
  // dismissing the banner and nudging counters doesn't re-fire it.
  if (status === "playing" && actor.points < state.pointsTarget && next >= state.pointsTarget) {
    winnerId = actor.id;
    status = "finished";
  }
  const prev = state.players
    .filter((player) => linkedIds.has(player.id))
    .map((player) => ({ id: player.id, value: player.points }));
  const players = state.players.map((player) =>
    linkedIds.has(player.id) ? { ...player, points: next } : player,
  );
  return {
    players,
    winnerId,
    status,
    log: pushLog(state.log, {
      playerId: actor.id,
      kind: "points",
      reason,
      delta,
      prev,
      prevStatus: state.status,
      prevWinnerId: state.winnerId,
    }),
  };
}

/**
 * Validate a persisted legend blob. Anything missing its identity is dropped
 * rather than half-restored, since the panel would have nothing to draw.
 * @returns The legend, or null when the blob can't be trusted.
 */
function sanitizeLegend(raw: unknown): TrackedLegend | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.cardId !== "string" || typeof candidate.name !== "string") {
    return null;
  }
  const domains = Array.isArray(candidate.domains)
    ? candidate.domains.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    cardId: candidate.cardId,
    name: candidate.name,
    domains,
    thumbnail: typeof candidate.thumbnail === "string" ? candidate.thumbnail : null,
  };
}

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
      legend: sanitizeLegend(candidate.legend),
      xpOpen: candidate.xpOpen === true,
    });
  }
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    return null;
  }
  return players;
}
