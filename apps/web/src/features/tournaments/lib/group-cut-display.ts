import { CUT_SIZES, GROUP_STAGE_ROUNDS } from "@openrift/shared/pairing/group-cut-types";
import type { CutSize } from "@openrift/shared/pairing/group-cut-types";
import type { GroupCutTierView } from "@openrift/shared/types/api/pod-tournament";

export const GROUP_CUT_TIER_LABEL: Record<GroupCutTierView, string> = {
  h2h: "H2H",
  mini_table: "Mini-table",
  mw: "MW%",
  gw: "GW%",
  legend_count: "Legend",
  meta_share: "Meta share",
  meta_pending: "Needs meta share",
  draw: "Draw",
};

export const CUT_SIZE_ITEMS: { value: string; label: string }[] = CUT_SIZES.map((size) => ({
  value: String(size),
  label: `Top ${size}`,
}));

export function parseCutSize(value: string): CutSize | null {
  const parsed = Number(value);
  return CUT_SIZES.find((size) => size === parsed) ?? null;
}

export interface GroupCountCheck {
  valid: boolean;
  message: string | null;
}

export function checkGroupPlayerCount(activeCount: number): GroupCountCheck {
  if (activeCount < 6) {
    return { valid: false, message: "A group stage needs at least six players." };
  }
  if (activeCount % 2 === 1) {
    return { valid: false, message: "Add or drop one player to fill the groups of four." };
  }
  return { valid: true, message: null };
}

const CUT_ROUND_LABELS = ["Round of 16", "Quarterfinals", "Semifinals", "Final"] as const;
const CUT_ROUND_SHORT = ["R16", "QF", "SF", "Final"] as const;

/** Ordered from the first cut round to the final, sized for the cut. */
export function cutRoundLabels(cutSize: CutSize): string[] {
  const rounds = Math.log2(cutSize);
  return CUT_ROUND_LABELS.slice(CUT_ROUND_LABELS.length - rounds);
}

function cutRoundShortLabels(cutSize: CutSize): string[] {
  const rounds = Math.log2(cutSize);
  return CUT_ROUND_SHORT.slice(CUT_ROUND_SHORT.length - rounds);
}

/** `roundNumber` is the tournament round; the group stage owns 1 to 3. */
export function cutRoundLabel(cutSize: CutSize, roundNumber: number): string {
  return cutRoundLabels(cutSize)[roundNumber - GROUP_STAGE_ROUNDS - 1] ?? `Round ${roundNumber}`;
}

/** "QF 2", "Final": the name a later round's placeholder points back to. */
export function cutMatchShortLabel(
  cutSize: CutSize,
  roundNumber: number,
  podNumber: number,
): string {
  const label = cutRoundShortLabels(cutSize)[roundNumber - GROUP_STAGE_ROUNDS - 1];
  if (label === undefined) {
    return `Match ${podNumber}`;
  }
  return label === "Final" ? "Final" : `${label} ${podNumber}`;
}

export function formatWinRate(rate: number | null): string {
  return rate === null ? "-" : `${Math.round(rate * 100)}%`;
}
