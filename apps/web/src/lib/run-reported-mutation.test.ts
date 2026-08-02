import { describe, expect, it, vi } from "vitest";

import { runReportedMutation } from "./run-reported-mutation";

describe("runReportedMutation", () => {
  it("resolves after the action resolves", async () => {
    const action = vi.fn().mockResolvedValue("ok");
    await expect(runReportedMutation(action)).resolves.toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("resolves (not rejects) when the action rejects", async () => {
    const action = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(runReportedMutation(action)).resolves.toBeUndefined();
  });

  it("awaits the action before resolving", async () => {
    let settled = false;
    async function action() {
      await Promise.resolve();
      settled = true;
    }
    const pending = runReportedMutation(action);
    // Not yet: the action parks on its own await, so a caller that forgot to
    // await runReportedMutation would observe the pre-action value here.
    expect(settled).toBe(false);
    await pending;
    expect(settled).toBe(true);
  });
});
