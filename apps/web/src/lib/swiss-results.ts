// Preset result options for Swiss 1v1 matches. Results are stored as raw game
// points per player (like pods), so a preset is just a labeled pair of game
// points; the server derives placement and match points from them.

import { placementsFromGamePoints, swissPointsForPlacements } from "@openrift/shared";
import type { TournamentMatchFormat } from "@openrift/shared";

export interface SwissResultPreset {
  /** Score label from player 1's perspective, e.g. "2–1" or "Draw 1–1". */
  label: string;
  /** Games won as [player1, player2]. */
  gamePoints: [number, number];
}

/**
 * The result options offered for one match, ordered player-1 wins, draws,
 * player-2 wins. Bo3 includes the time-limit scorelines (1–0, 1–1) alongside
 * the clean 2–0 / 2–1 finishes.
 *
 * @param matchFormat The tournament's match format.
 * @returns The presets to render as result buttons.
 */
export function swissResultPresets(matchFormat: TournamentMatchFormat): SwissResultPreset[] {
  if (matchFormat === "bo1") {
    return [
      { label: "1–0", gamePoints: [1, 0] },
      { label: "Draw", gamePoints: [0, 0] },
      { label: "0–1", gamePoints: [0, 1] },
    ];
  }
  return [
    { label: "2–0", gamePoints: [2, 0] },
    { label: "2–1", gamePoints: [2, 1] },
    { label: "1–0", gamePoints: [1, 0] },
    { label: "Draw 1–1", gamePoints: [1, 1] },
    { label: "Draw 0–0", gamePoints: [0, 0] },
    { label: "0–1", gamePoints: [0, 1] },
    { label: "1–2", gamePoints: [1, 2] },
    { label: "0–2", gamePoints: [0, 2] },
  ];
}

/**
 * The match points a game-point pair yields, for the preview next to a preset
 * ("+3 / +0").
 *
 * @param gamePoints Games won as [player1, player2].
 * @param winPoints The tournament's match-win points.
 * @param drawPoints The tournament's per-player draw points.
 * @returns Match points as [player1, player2].
 */
export function swissPointsPreview(
  gamePoints: [number, number],
  winPoints: number,
  drawPoints: number,
): [number, number] {
  const points = swissPointsForPlacements(
    placementsFromGamePoints([...gamePoints]),
    winPoints,
    drawPoints,
  );
  return [points[0] ?? 0, points[1] ?? 0];
}
