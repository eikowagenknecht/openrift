/**
 * Presentation constants for the match tracker's 2v2 teams. Fixed info/warning
 * tokens (not theme chart tokens, which collapse to near-identical shades in
 * some themes) so the two teams stay clearly distinguishable around the table.
 */

export const TEAM_LABELS: Record<0 | 1, string> = {
  0: "Team 1",
  1: "Team 2",
};

export const TEAM_PANEL_BORDER: Record<0 | 1, string> = {
  0: "border-info/70",
  1: "border-warning/70",
};

export const TEAM_CHIP: Record<0 | 1, string> = {
  0: "bg-info-soft text-info",
  1: "bg-warning-soft text-warning",
};
