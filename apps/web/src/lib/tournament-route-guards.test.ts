import type { QueryClient } from "@tanstack/react-query";
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

import {
  loadTournamentDetail,
  loadTournamentRunState,
  redirectToTournamentOverview,
} from "./tournament-route-guards";

// The guards delegate to the query-options factories; stub them so the test
// stays off the server-fn import chain and can assert the delegation.
vi.mock("@/hooks/use-tournaments", () => ({
  tournamentDetailQueryOptions: (userId: string, id: string) => ({
    queryKey: ["tournament-detail", userId, id],
  }),
  tournamentRunStateQueryOptions: (userId: string, id: string) => ({
    queryKey: ["tournament-run-state", userId, id],
  }),
}));

describe("loadTournamentDetail", () => {
  it("ensures the unified detail query is loaded and returns it", async () => {
    const ensureQueryData = vi.fn().mockResolvedValue({ id: "t-1" });
    const queryClient = { ensureQueryData } as unknown as QueryClient;

    const result = await loadTournamentDetail(queryClient, "user-1", "t-1");

    expect(ensureQueryData).toHaveBeenCalledWith({
      queryKey: ["tournament-detail", "user-1", "t-1"],
    });
    expect(result).toEqual({ id: "t-1" });
  });

  it("converts the NOT_FOUND sentinel into the router's notFound", async () => {
    // Regression for OPENRIFT-SSR-1K: a deleted or unknown tournament must
    // render the 404 page, not the generic error screen.
    const ensureQueryData = vi.fn().mockRejectedValue(new Error("NOT_FOUND"));
    const queryClient = { ensureQueryData } as unknown as QueryClient;

    await expect(loadTournamentDetail(queryClient, "user-1", "t-gone")).rejects.toSatisfy(
      isNotFound,
    );
  });

  it("passes every other failure through untouched", async () => {
    const failure = new Error("boom");
    const ensureQueryData = vi.fn().mockRejectedValue(failure);
    const queryClient = { ensureQueryData } as unknown as QueryClient;

    await expect(loadTournamentDetail(queryClient, "user-1", "t-1")).rejects.toBe(failure);
  });
});

describe("loadTournamentRunState", () => {
  it("ensures the pod run-state query is loaded and returns it", async () => {
    const ensureQueryData = vi.fn().mockResolvedValue({ rounds: [] });
    const queryClient = { ensureQueryData } as unknown as QueryClient;

    const result = await loadTournamentRunState(queryClient, "user-1", "t-1");

    expect(ensureQueryData).toHaveBeenCalledWith({
      queryKey: ["tournament-run-state", "user-1", "t-1"],
    });
    expect(result).toEqual({ rounds: [] });
  });
});

describe("redirectToTournamentOverview", () => {
  it("throws a redirect to the overview tab carrying the tournament id", () => {
    let thrown: unknown;
    try {
      redirectToTournamentOverview("t-1");
    } catch (error) {
      thrown = error;
    }

    expect(isRedirect(thrown)).toBe(true);
    const options = (thrown as { options: { to: string; params: { id: string } } }).options;
    expect(options.to).toBe("/tournaments/$id");
    expect(options.params).toEqual({ id: "t-1" });
  });
});
