import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  me: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      validator: () => chain,
      handler: (fn: (input: { context: { cookie: string } }) => unknown) => () =>
        fn({ context: { cookie: "" } }),
    };
    return chain;
  },
  createMiddleware: () => {
    const chain = { server: () => chain };
    return chain;
  },
}));

vi.mock("@/lib/server-fns/middleware", () => ({
  withCookies: () => {},
}));

vi.mock("@/lib/server-fns/orpc-client", () => ({
  apiOrpcClient: () => ({ me: mocks.me }),
}));

vi.mock("@/lib/auth-session", () => ({
  useUserId: () => mocks.userId,
}));

const { useAdminAccess, useIsAdmin } = await import("./use-admin");

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("useAdminAccess", () => {
  beforeEach(() => {
    mocks.userId = null;
    mocks.me.mockReset();
  });

  it("returns no access without a network call when signed out", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useAdminAccess(), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.data).toEqual({ isAdmin: false, sections: [] }));
    expect(mocks.me).not.toHaveBeenCalled();
  });

  it("fetches the signed-in user's access instead of serving the signed-out cache", async () => {
    const client = makeClient();
    const { result, rerender } = renderHook(() => useAdminAccess(), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.data).toEqual({ isAdmin: false, sections: [] }));

    mocks.userId = "admin-1";
    mocks.me.mockResolvedValue({ isAdmin: true, sections: [] });
    rerender();

    await waitFor(() => expect(result.current.data?.isAdmin).toBe(true));
    expect(mocks.me).toHaveBeenCalledTimes(1);
  });

  it("keeps each user's access in its own cache slot across a user switch", async () => {
    const client = makeClient();
    mocks.userId = "admin-1";
    mocks.me.mockResolvedValue({ isAdmin: true, sections: [] });
    const { result, rerender } = renderHook(() => useAdminAccess(), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.data?.isAdmin).toBe(true));

    mocks.userId = "regular-user";
    mocks.me.mockResolvedValue({ isAdmin: false, sections: [] });
    rerender();

    await waitFor(() => expect(result.current.data?.isAdmin).toBe(false));
    expect(mocks.me).toHaveBeenCalledTimes(2);
  });
});

describe("useIsAdmin", () => {
  beforeEach(() => {
    mocks.userId = null;
    mocks.me.mockReset();
  });

  it("selects just the full-admin flag", async () => {
    const client = makeClient();
    mocks.userId = "grant-holder";
    mocks.me.mockResolvedValue({ isAdmin: false, sections: ["card-review"] });
    const { result } = renderHook(() => useIsAdmin(), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.data).toBe(false));
  });
});
