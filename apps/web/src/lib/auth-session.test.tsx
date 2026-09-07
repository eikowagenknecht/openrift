import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      validator: () => chain,
      handler: (fn: (args: { context: { cookie: string } }) => unknown) => () =>
        fn({ context: { cookie: "openrift.session=abc" } }),
    };
    return chain;
  },
  createMiddleware: () => {
    const chain = { server: () => chain };
    return chain;
  },
}));

vi.mock("./server-fns/middleware", () => ({ withCookies: () => {} }));

const fetchApi = vi.fn();
vi.mock("./server-fns/fetch-api", () => ({ fetchApi: (...args: unknown[]) => fetchApi(...args) }));

const { sessionQueryOptions, useRequiredUserId, useSession, useUserId } =
  await import("./auth-session");

const SESSION = {
  session: { id: "s1", userId: "u1", expiresAt: "2030-01-01T00:00:00.000Z", token: "t1" },
  user: {
    id: "u1",
    name: "Summoner Kai",
    email: "kai@example.com",
    emailVerified: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { Wrapper, client };
}

beforeEach(() => {
  fetchApi.mockReset();
});

describe("useSession", () => {
  it("returns the session the API answers with", async () => {
    fetchApi.mockResolvedValue(Response.json(SESSION));
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SESSION);
  });

  it("forwards the request cookie and tolerates a 401", async () => {
    fetchApi.mockResolvedValue(new Response(null, { status: 401 }));
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(fetchApi).toHaveBeenCalledWith({
      errorTitle: "Couldn't load session",
      cookie: "openrift.session=abc",
      path: "/api/auth/get-session",
      acceptStatuses: [401],
    });
  });

  it("surfaces an unexpected API failure as a query error", async () => {
    fetchApi.mockRejectedValue(new Error("Couldn't load session"));
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUserId", () => {
  it("returns the signed-in user id", async () => {
    fetchApi.mockResolvedValue(Response.json(SESSION));
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useUserId(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current).toBe("u1"));
  });

  it("returns null for an anonymous visitor", async () => {
    fetchApi.mockResolvedValue(new Response(null, { status: 401 }));
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useUserId(), { wrapper: Wrapper });

    await waitFor(() => expect(fetchApi).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("returns null while the session is still loading", () => {
    // oxlint-disable-next-line promise/avoid-new -- a never-settling promise holds the query in flight
    fetchApi.mockReturnValue(new Promise(() => {}));
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useUserId(), { wrapper: Wrapper });

    expect(result.current).toBeNull();
  });
});

describe("useRequiredUserId", () => {
  it("returns the signed-in user id", async () => {
    const { Wrapper, client } = makeWrapper();
    client.setQueryData(sessionQueryOptions().queryKey, SESSION);

    const { result } = renderHook(() => useRequiredUserId(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current).toBe("u1"));
  });

  it("throws when it is reached without an authenticated session", () => {
    const { Wrapper, client } = makeWrapper();
    client.setQueryData(sessionQueryOptions().queryKey, null);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useRequiredUserId(), { wrapper: Wrapper })).toThrow(
      /without an authenticated session/u,
    );

    consoleError.mockRestore();
  });
});
