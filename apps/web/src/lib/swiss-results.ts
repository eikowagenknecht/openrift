// Preset result options for Swiss 1v1 matches. Results are stored as raw game
// points per player (like pods), so a preset is just a labeled pair of game
// points; the server derives placement and match points from them.

import { placementsFromGamePoints, swissPointsForPlacements } from "@openrift/shared";
import type { TournamentMatchFormat } from "@openrift/shared";

export interface SwissResultPreset {
  label: string;
  gamePoints: [number, number];
}

/**
 * Result options for one match, ordered player-1 wins, draws, player-2 wins.
 * Bo3 includes the time-limit scorelines (1–0, 1–1) alongside 2–0 / 2–1.
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

/** The match points a game-point pair yields, for the preview next to a preset ("+3 / +0"). */
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
