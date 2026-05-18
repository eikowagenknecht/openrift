import { describe, expect, it } from "vitest";

import { describeListAdd } from "./list-toast";

describe("describeListAdd", () => {
  it("formats a pure add", () => {
    expect(describeListAdd({ added: 3, updated: 0, skipped: 0 }, "Wants")).toBe(
      'Added 3 to "Wants"',
    );
  });

  it("formats a pure quantity bump (drag-readd of existing card)", () => {
    expect(describeListAdd({ added: 0, updated: 1, skipped: 0 }, "Wants")).toBe(
      'Bumped quantity in "Wants"',
    );
  });

  it("formats a mixed add + bump in a single drop", () => {
    expect(describeListAdd({ added: 2, updated: 3, skipped: 0 }, "Wants")).toBe(
      'Added 2 to "Wants" (3 bumped)',
    );
  });

  it("appends the non-owned tail when present", () => {
    expect(describeListAdd({ added: 1, updated: 0, skipped: 2 }, "Wants")).toBe(
      'Added 1 to "Wants" (2 not owned)',
    );
    expect(describeListAdd({ added: 0, updated: 1, skipped: 2 }, "Wants")).toBe(
      'Bumped quantity in "Wants" (2 not owned)',
    );
  });

  it("handles the all-skipped case", () => {
    expect(describeListAdd({ added: 0, updated: 0, skipped: 3 }, "Wants")).toBe(
      'Nothing added to "Wants" (3 not owned)',
    );
  });
});
