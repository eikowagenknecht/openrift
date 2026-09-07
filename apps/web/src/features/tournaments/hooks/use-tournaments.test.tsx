import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler:
        (fn: (args: { context: { cookie: string }; data: unknown }) => unknown) =>
        (args?: { data?: unknown }) =>
          fn({ context: { cookie: "" }, data: args?.data }),
      middleware: () => chain,
      validator: () => chain,
    };
    return chain;
  },
}));

vi.mock("@/lib/server-fns/middleware", () => ({ withCookies: () => {} }));

let currentUserId: string | null = null;
vi.mock("@/lib/auth-session", () => ({
  useUserId: () => currentUserId,
  useRequiredUserId: () => {
    if (!currentUserId) {
      throw new Error("useRequiredUserId() called without an authenticated session.");
    }
    return currentUserId;
  },
}));

const { useClaimStaffInvite, useRequestJoinTournament } = await import("./use-tournaments");

function stubFetch(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json(payload))),
  );
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { invalidateSpy, wrapper: Wrapper };
}

beforeEach(() => {
  currentUserId = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Both hooks drive landing pages that live outside `_authenticated`
// (/tournaments/submit/$token and /tournaments/staff-invite/$token), so
// rendering them signed out is the normal case, not a programming error.
describe("useRequestJoinTournament", () => {
  it("renders for a signed-out visitor", () => {
    const { wrapper } = setup();

    const { result } = renderHook(() => useRequestJoinTournament(), { wrapper });

    expect(result.current.mutateAsync).toBeInstanceOf(Function);
  });

  it("invalidates no user-scoped keys when signed out", async () => {
    stubFetch({ alreadyJoined: false });
    const { invalidateSpy, wrapper } = setup();

    const { result } = renderHook(() => useRequestJoinTournament(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ token: "tok" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("invalidates the tournament list when signed in", async () => {
    currentUserId = "user-1";
    stubFetch({ alreadyJoined: false });
    const { invalidateSpy, wrapper } = setup();

    const { result } = renderHook(() => useRequestJoinTournament(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ token: "tok" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tournaments", "user-1"] });
  });
});

describe("useClaimStaffInvite", () => {
  it("renders for a signed-out visitor", () => {
    const { wrapper } = setup();

    const { result } = renderHook(() => useClaimStaffInvite(), { wrapper });

    expect(result.current.mutateAsync).toBeInstanceOf(Function);
  });

  it("invalidates no user-scoped keys when signed out", async () => {
    stubFetch({ tournamentId: "t-1" });
    const { invalidateSpy, wrapper } = setup();

    const { result } = renderHook(() => useClaimStaffInvite(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("tok");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("invalidates the list and the claimed tournament when signed in", async () => {
    currentUserId = "user-1";
    stubFetch({ tournamentId: "t-1" });
    const { invalidateSpy, wrapper } = setup();

    const { result } = renderHook(() => useClaimStaffInvite(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("tok");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tournaments", "user-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tournaments", "user-1", "t-1"] });
  });
});
