import type { CopyListMembershipsResponse } from "@openrift/shared/types/api/collection";

export const DISPOSE_TYPE_CONFIRM_THRESHOLD = 20;

export interface DisposeConfirmState {
  readonly showListWarning: boolean;
  readonly needsTypeConfirm: boolean;
  readonly copiesOnAnyList: number;
}

/** Disposing hard-deletes the copy, so it drops off any lists it's on too. */
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
