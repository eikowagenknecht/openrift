import type { CopyListMembershipsResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { DISPOSE_TYPE_CONFIRM_THRESHOLD, disposeConfirmState } from "./dispose-confirm";

const memberships = (
  partial: Partial<CopyListMembershipsResponse>,
): CopyListMembershipsResponse => ({
  lists: [],
  copiesOnAnyList: 0,
  ...partial,
});

describe("disposeConfirmState", () => {
  it("is frictionless for a small same-area dispose", () => {
    expect(disposeConfirmState(1)).toEqual({
      showListWarning: false,
      needsTypeConfirm: false,
      copiesOnAnyList: 0,
    });
  });

  it("treats missing memberships as no list involvement", () => {
    const state = disposeConfirmState(5, undefined);
    expect(state.showListWarning).toBe(false);
    expect(state.needsTypeConfirm).toBe(false);
  });

  it("warns and requires typed confirmation when any copy is on a list", () => {
    const state = disposeConfirmState(
      2,
      memberships({
        lists: [{ id: "l1", name: "Trades", copyCount: 2 }],
        copiesOnAnyList: 2,
      }),
    );
    expect(state).toEqual({
      showListWarning: true,
      needsTypeConfirm: true,
      copiesOnAnyList: 2,
    });
  });

  it("requires typed confirmation for a large batch even with no list involvement", () => {
    const state = disposeConfirmState(DISPOSE_TYPE_CONFIRM_THRESHOLD, memberships({}));
    expect(state.showListWarning).toBe(false);
    expect(state.needsTypeConfirm).toBe(true);
  });

  it("stays frictionless just below the batch threshold", () => {
    const state = disposeConfirmState(DISPOSE_TYPE_CONFIRM_THRESHOLD - 1, memberships({}));
    expect(state.needsTypeConfirm).toBe(false);
  });

  it("honors a custom threshold", () => {
    expect(disposeConfirmState(3, memberships({}), 3).needsTypeConfirm).toBe(true);
    expect(disposeConfirmState(2, memberships({}), 3).needsTypeConfirm).toBe(false);
  });
});
