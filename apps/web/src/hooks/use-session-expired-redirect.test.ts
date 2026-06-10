import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionExpiredRedirect } from "./use-session-expired-redirect";

const { navigateMock, sessionState, locationState } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  sessionState: { data: undefined as unknown },
  locationState: { href: "/decks/abc" },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ href: locationState.href }),
}));

vi.mock("@/lib/auth-session", () => ({
  useSession: () => ({ data: sessionState.data }),
}));

describe("useSessionExpiredRedirect", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    sessionState.data = undefined;
    locationState.href = "/decks/abc";
  });

  it("does nothing while the session query has not resolved (undefined)", () => {
    const { result } = renderHook(() => useSessionExpiredRedirect());

    expect(result.current).toBe(false);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("does nothing for an authenticated session", () => {
    sessionState.data = { user: { id: "user-1" } };

    const { result } = renderHook(() => useSessionExpiredRedirect());

    expect(result.current).toBe(false);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("redirects to /login with the current location once the session is null", () => {
    sessionState.data = null;

    const { result } = renderHook(() => useSessionExpiredRedirect());

    expect(result.current).toBe(true);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/login",
      search: { redirect: "/decks/abc", email: undefined },
    });
  });

  it("redirects when the session expires after mount (the SSR-13 regression)", () => {
    sessionState.data = { user: { id: "user-1" } };
    const { result, rerender } = renderHook(() => useSessionExpiredRedirect());
    expect(navigateMock).not.toHaveBeenCalled();

    sessionState.data = null;
    rerender();

    expect(result.current).toBe(true);
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });

  it("omits the redirect param when the current href is empty", () => {
    sessionState.data = null;
    locationState.href = "";

    renderHook(() => useSessionExpiredRedirect());

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/login",
      search: { redirect: undefined, email: undefined },
    });
  });
});
