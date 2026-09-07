// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import { readFileSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import path from "node:path";

import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

import { Route } from "./stage";

const validateSearch = Route.options.validateSearch as unknown as {
  parse: (search: Record<string, unknown>) => Record<string, unknown>;
};

type SessionUser = { user: { id: string } } | null;

const beforeLoad = Route.options.beforeLoad as unknown as (args: {
  context: { queryClient: { query: () => Promise<SessionUser> } };
  location: { href: string };
  search: Record<string, unknown>;
}) => Promise<void>;

function runGuard(search: Record<string, unknown>, session: SessionUser, href = "/stage") {
  const query = vi.fn().mockResolvedValue(session);
  return {
    query,
    result: beforeLoad({
      context: { queryClient: { query } },
      location: { href },
      search,
    }),
  };
}

describe("/stage filter search", () => {
  it("validates the shared filter search params", () => {
    expect(validateSearch.parse({ search: "ekko", sets: ["ogn"], sort: "name" })).toMatchObject({
      search: "ekko",
      sets: ["ogn"],
      sort: "name",
    });
  });

  it("drops unknown search params", () => {
    expect(validateSearch.parse({ nonsense: "x" })).not.toHaveProperty("nonsense");
  });

  it("wraps the builder in a FilterSearchProvider", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "./stage.lazy.tsx"), "utf-8");
    expect(source).toMatch(/<FilterSearchProvider value=\{search\}>/u);
  });
});

describe("/stage builder search writes", () => {
  const source = readFileSync(path.resolve(import.meta.dirname, "./stage.lazy.tsx"), "utf-8");

  it("starts presenting through startPresentingSearch", () => {
    expect(source).toMatch(/startPresentingSearch\(prev, ids\)/u);
  });

  it("mirrors queue edits into the URL through queueDraftSearch", () => {
    expect(source).toMatch(/queueDraftSearch\(prev, state\.ids\)/u);
  });
});

describe("/stage mode", () => {
  it("accepts the edit mode", () => {
    expect(validateSearch.parse({ tier: "list-1", mode: "edit" })).toMatchObject({
      tier: "list-1",
      mode: "edit",
    });
  });

  it("presents when no mode is given", () => {
    expect(validateSearch.parse({ tier: "list-1" }).mode).toBeUndefined();
  });

  it.each(["rank", "nonsense", ""])(
    "falls back to presenting for %o (rank is the old mode value)",
    (mode) => {
      expect(validateSearch.parse({ tier: "list-1", mode }).mode).toBeUndefined();
    },
  );
});

// `?tier=` resolves through useRequiredUserId, which throws without a session;
// the stage itself is public, so the guard gates that one param, not the route.
describe("/stage owned tier-list guard", () => {
  it("redirects a signed-out visitor to sign in", async () => {
    const { result } = runGuard({ tier: "list-1" }, null);

    await expect(result).rejects.toSatisfy(isRedirect);
  });

  it("returns to the stage URL after signing in", async () => {
    const { result } = runGuard({ tier: "list-1" }, null, "/stage?tier=list-1&i=4&preset=p-1");

    const thrown: unknown = await result.catch((error: unknown) => error);

    expect(thrown).toMatchObject({
      options: {
        to: "/login",
        search: { redirect: "/stage?tier=list-1&i=4&preset=p-1" },
      },
    });
  });

  it("lets the owner through", async () => {
    const { result } = runGuard({ tier: "list-1" }, { user: { id: "user-1" } });

    await expect(result).resolves.toBeUndefined();
  });

  it("leaves the shared-ranking branch public", async () => {
    const { query, result } = runGuard({ tierShare: "tok" }, null);

    await expect(result).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ["the queue builder", {}],
    ["a deck walk", { deck: "deck-1" }],
    ["an ad-hoc queue", { cards: ["p-1", "p-2"] }],
  ])("leaves %s public", async (_label, search) => {
    const { query, result } = runGuard(search, null);

    await expect(result).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
});
