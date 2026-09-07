import { describe, expect, it } from "vitest";

import { collectionTableActionsColumn } from "./collection-table";

describe("collectionTableActionsColumn", () => {
  it("drops the actions column for copies-view rows (single physical copy)", () => {
    expect(
      collectionTableActionsColumn({ stacked: false, mode: "browse", hasQuickAdd: true }),
    ).toBe("none");
    expect(
      collectionTableActionsColumn({ stacked: false, mode: "select", hasQuickAdd: false }),
    ).toBe("none");
  });

  it("uses the stepper +/- column in browse mode when quick-add is available", () => {
    expect(collectionTableActionsColumn({ stacked: true, mode: "browse", hasQuickAdd: true })).toBe(
      "stepper",
    );
  });

  it("uses the narrow read-only column in select mode", () => {
    expect(collectionTableActionsColumn({ stacked: true, mode: "select", hasQuickAdd: true })).toBe(
      "narrow",
    );
  });

  it("uses the narrow column in browse mode without quick-add", () => {
    expect(
      collectionTableActionsColumn({ stacked: true, mode: "browse", hasQuickAdd: false }),
    ).toBe("narrow");
  });
});
