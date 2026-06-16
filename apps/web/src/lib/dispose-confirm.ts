import type { CopyListMembershipsResponse } from "@openrift/shared";

/**
 * Disposing at least this many copies at once warrants typed confirmation even
 * when none of them are on a list — a fat-fingered bulk delete is the costly,
 * irreversible mistake the extra friction guards against.
 */
export const DISPOSE_TYPE_CONFIRM_THRESHOLD = 20;

export interface DisposeConfirmState {
  /** Some copies are also on the viewer's own lists — show the red warning. */
  readonly showListWarning: boolean;
  /** Require typing the count before the confirm button enables. */
  readonly needsTypeConfirm: boolean;
  /** Distinct copies that also live on at least one list. */
  readonly copiesOnAnyList: number;
}

/**
 * Decides how much friction a dispose confirmation needs: a red cross-list
 * warning whenever any copy is also on one of the viewer's lists (disposing
 * hard-deletes the copy, so it drops off those lists too), and type-to-confirm
 * for either a cross-list dispose or a batch at/above `threshold`.
 * @returns The confirmation state for the given count + list memberships.
 */
export function disposeConfirmState(
  count: number,
  memberships?: CopyListMembershipsResponse,
  threshold: number = DISPOSE_TYPE_CONFIRM_THRESHOLD,
): DisposeConfirmState {
  const copiesOnAnyList = memberships?.copiesOnAnyList ?? 0;
  const showListWarning = copiesOnAnyList > 0;
  const needsTypeConfirm = showListWarning || count >= threshold;
  return { showListWarning, needsTypeConfirm, copiesOnAnyList };
}
