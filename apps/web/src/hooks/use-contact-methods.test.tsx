import type { ContactMethod } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/auth-session", () => ({ useUserId: () => "test-user-id" }));
vi.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => true }));

const { useContactMethods, useCreateContactMethod } = await import("./use-contact-methods");

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

function stubFetch(items: ContactMethod[]) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
    return Response.json({ items });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const DISCORD: ContactMethod = { id: "m-1", type: "discord", value: "seb#1234" };

describe("useContactMethods", () => {
  it("returns the items from the list endpoint", async () => {
    stubFetch([DISCORD]);
    const { result } = renderHook(() => useContactMethods(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.contactMethods).toEqual([DISCORD]));
  });
});

describe("useCreateContactMethod", () => {
  it("POSTs to the contact-methods endpoint with the new method", async () => {
    const { calls } = stubFetch([DISCORD]);
    const { result } = renderHook(() => useCreateContactMethod(), { wrapper: wrap() });
    await act(async () => {
      await result.current.mutateAsync({ type: "email", value: "a@b.com" });
    });
    const post = calls.find((call) => call.method === "POST");
    expect(post).toBeDefined();
    expect(post!.url).toContain("/contact-methods");
    expect(post!.body).toEqual({ type: "email", value: "a@b.com" });
  });
});
