import type { MetaEventMatch, MetaEventPhase, MetaEventPlayer } from "@openrift/shared";
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

import { metaEvent, metaMatch, metaPhase, metaPlayer } from "@/test/meta-event-fixtures";

import { Route } from "./meta_.$slug_.players_.$key";

type LoaderFn = (ctx: {
  context: {
    queryClient: { query: (options: { queryKey: readonly unknown[] }) => Promise<unknown> };
  };
  params: { slug: string; key: string };
}) => Promise<unknown>;

const SLUG = "summoner-skirmish";

function runLoader(
  overrides: {
    meta?: boolean;
    players?: MetaEventPlayer[];
    matches?: MetaEventMatch[];
    phases?: MetaEventPhase[];
    key?: string;
  } = {},
): Promise<unknown> {
  const query = vi.fn((options: { queryKey: readonly unknown[] }) => {
    if (options.queryKey[0] === "feature-flags") {
      return Promise.resolve({ meta: overrides.meta ?? true });
    }
    if (options.queryKey[0] === "meta") {
      return Promise.resolve({
        event: metaEvent(),
        players: overrides.players ?? [metaPlayer()],
        matches: overrides.matches ?? [metaMatch({ player2Id: "p-2" })],
        phases: overrides.phases ?? [metaPhase()],
      });
    }
    return Promise.resolve({});
  });
  return (Route.options.loader as unknown as LoaderFn)({
    context: { queryClient: { query } },
    params: { slug: SLUG, key: overrides.key ?? "u1001" },
  });
}

async function thrownBy(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("the loader resolved");
}

describe("/meta/$slug/players/$key loader", () => {
  it("returns the event and the player row the page renders from", async () => {
    const data = (await runLoader()) as { event: { slug: string }; player: { playerName: string } };

    expect(data.event.slug).toBe(SLUG);
    expect(data.player.playerName).toBe("Ana");
  });

  it("404s a key no standings row at this event answers to", async () => {
    expect(isNotFound(await thrownBy(runLoader({ key: "nobody" })))).toBe(true);
  });

  it("404s a player whose event published standings but no rounds", async () => {
    expect(isNotFound(await thrownBy(runLoader({ matches: [] })))).toBe(true);
  });

  it("sends the reader to the catalog while the archive is off", async () => {
    expect(isRedirect(await thrownBy(runLoader({ meta: false })))).toBe(true);
  });
});
