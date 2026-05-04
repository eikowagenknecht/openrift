import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock createServerFn to execute the handler directly instead of making RPC
// calls. There is no TanStack Start server in the vitest/jsdom environment.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: (fn: (...args: unknown[]) => unknown) => fn,
      middleware: () => chain,
      inputValidator: () => chain,
    };
    return chain;
  },
  createMiddleware: () => {
    const chain = {
      server: () => chain,
      client: () => chain,
    };
    return chain;
  },
}));

vi.mock("@/lib/server-cache", async () => {
  const { QueryClient: QC } = await import("@tanstack/react-query");
  return { serverCache: new QC({ defaultOptions: { queries: { retry: false } } }) };
});

const { rulesAtVersionQueryOptions, ruleVersionsQueryOptions } = await import("./use-rules");

describe("rulesAtVersionQueryOptions", () => {
  it("scopes the query key by kind and version", () => {
    const core = rulesAtVersionQueryOptions("core", "1.0.0");
    const tournament = rulesAtVersionQueryOptions("tournament", "1.0.0");
    const olderCore = rulesAtVersionQueryOptions("core", "0.9.0");

    expect(core.queryKey).toEqual(["rules", "core", "1.0.0"]);
    expect(tournament.queryKey).toEqual(["rules", "tournament", "1.0.0"]);
    expect(olderCore.queryKey).toEqual(["rules", "core", "0.9.0"]);
  });
});

describe("ruleVersionsQueryOptions", () => {
  it("scopes the query key by kind when provided", () => {
    expect(ruleVersionsQueryOptions("core").queryKey).toEqual(["rules", "core", "versions"]);
    expect(ruleVersionsQueryOptions("tournament").queryKey).toEqual([
      "rules",
      "tournament",
      "versions",
    ]);
  });

  it("returns a distinct key when kind is omitted", () => {
    expect(ruleVersionsQueryOptions().queryKey).toEqual(["rules", "versions", "all"]);
  });
});

// Sanity check: distinct query keys should not collide in a real QueryClient
describe("query cache isolation", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    client.clear();
  });

  it("treats core and tournament caches as independent", () => {
    client.setQueryData(rulesAtVersionQueryOptions("core", "1.0.0").queryKey, {
      kind: "core",
      version: "1.0.0",
      rules: [],
    });
    expect(
      client.getQueryData(rulesAtVersionQueryOptions("tournament", "1.0.0").queryKey),
    ).toBeUndefined();
    expect(client.getQueryData(rulesAtVersionQueryOptions("core", "1.0.0").queryKey)).toEqual({
      kind: "core",
      version: "1.0.0",
      rules: [],
    });
  });
});
