import { describe, expect, it } from "vitest";

import type { AdminEditingState } from "@/features/admin/lib/admin-table-editing";
import {
  adminEditingInitialState,
  adminEditingReducer,
} from "@/features/admin/lib/admin-table-editing";

interface Draft {
  slug: string;
  label: string;
}

const draft: Draft = { slug: "some-set", label: "Some Set" };

function idle(): AdminEditingState<Draft> {
  return adminEditingInitialState<Draft>();
}

function adding(overrides: Partial<AdminEditingState<Draft>> = {}): AdminEditingState<Draft> {
  return {
    mode: { kind: "adding", underKey: null, draft },
    error: "",
    pending: false,
    ...overrides,
  };
}

function editing(overrides: Partial<AdminEditingState<Draft>> = {}): AdminEditingState<Draft> {
  return {
    mode: { kind: "editing", key: "a", draft },
    error: "",
    pending: false,
    ...overrides,
  };
}

describe("adminEditingReducer", () => {
  it("starts idle", () => {
    expect(idle()).toEqual({ mode: { kind: "idle" }, error: "", pending: false });
  });

  it("opens an add row under no row by default", () => {
    const next = adminEditingReducer(idle(), { type: "startAdding", draft, underKey: null });

    expect(next.mode).toEqual({ kind: "adding", underKey: null, draft });
  });

  it("remembers the row an add was started under", () => {
    const next = adminEditingReducer(idle(), { type: "startAdding", draft, underKey: "b" });

    expect(next.mode).toEqual({ kind: "adding", underKey: "b", draft });
  });

  it("opens an edit row for the given key", () => {
    const next = adminEditingReducer(idle(), { type: "startEditing", key: "a", draft });

    expect(next.mode).toEqual({ kind: "editing", key: "a", draft });
  });

  it("closes the open edit row when an add row is started", () => {
    const next = adminEditingReducer(editing(), { type: "startAdding", draft, underKey: null });

    expect(next.mode.kind).toBe("adding");
  });

  it("closes the open add row when an edit row is started", () => {
    const next = adminEditingReducer(adding(), { type: "startEditing", key: "a", draft });

    expect(next.mode.kind).toBe("editing");
  });

  it("clears the error when an add row is started", () => {
    const next = adminEditingReducer(adding({ error: "Slug already exists", pending: true }), {
      type: "startAdding",
      draft,
      underKey: null,
    });

    expect(next).toEqual(adding());
  });

  it("clears the error when an edit row is started", () => {
    const next = adminEditingReducer(editing({ error: "Name already taken", pending: true }), {
      type: "startEditing",
      key: "a",
      draft,
    });

    expect(next).toEqual(editing());
  });

  it("applies a draft update to the open add row", () => {
    const next = adminEditingReducer(adding(), {
      type: "updateDraft",
      update: (prev) => ({ ...prev, label: "Renamed" }),
    });

    expect(next.mode).toEqual({
      kind: "adding",
      underKey: null,
      draft: { slug: "some-set", label: "Renamed" },
    });
  });

  it("applies a draft update to the open edit row", () => {
    const next = adminEditingReducer(editing(), {
      type: "updateDraft",
      update: (prev) => ({ ...prev, label: "Renamed" }),
    });

    expect(next.mode).toEqual({
      kind: "editing",
      key: "a",
      draft: { slug: "some-set", label: "Renamed" },
    });
  });

  it("leaves the draft update alone when nothing is open", () => {
    const state = idle();

    expect(adminEditingReducer(state, { type: "updateDraft", update: () => draft })).toBe(state);
  });

  it("keeps the open row when a validation error is set", () => {
    const next = adminEditingReducer(adding(), { type: "setError", error: "Label is required" });

    expect(next).toEqual(adding({ error: "Label is required" }));
  });

  it("clears the previous error while a save is in flight", () => {
    const next = adminEditingReducer(adding({ error: "Label is required" }), {
      type: "submitStart",
    });

    expect(next).toEqual(adding({ pending: true }));
  });

  it("keeps the open row and stops pending when a save fails", () => {
    const next = adminEditingReducer(editing({ pending: true }), {
      type: "submitFailed",
      error: "Name already taken",
    });

    expect(next).toEqual(editing({ error: "Name already taken" }));
  });

  it("returns to idle when the open row is closed", () => {
    const next = adminEditingReducer(editing({ error: "Name already taken", pending: true }), {
      type: "close",
    });

    expect(next).toEqual(idle());
  });
});
