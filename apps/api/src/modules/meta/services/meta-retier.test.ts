import type { MetaEventTier } from "@openrift/shared/types/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../../../deps.js";
import type * as metaPromote from "./meta-promote.js";
import { createMetaPromoteContext, promoteMetaEvent } from "./meta-promote.js";
import { retierMetaEvents } from "./meta-retier.js";

vi.mock("./meta-promote.js", async (importOriginal) => ({
  ...(await importOriginal<typeof metaPromote>()),
  promoteMetaEvent: vi.fn(),
  createMetaPromoteContext: vi.fn(() => Promise.resolve({ cardIndex: {} })),
}));

interface Fixture {
  events?: { id: string; tier: MetaEventTier }[];
  sources?: {
    metaEventId: string;
    provider: string | null;
    externalId: string | null;
    priority?: number;
    createdAt?: Date;
  }[];
  uvsgames?: {
    metaEventId: string;
    externalId: string;
    eventConfigurationTemplate: string | null;
    eventFormat: string | null;
    playerCount: number | null;
  }[];
  playloltcg?: { metaEventId: string; activityShopId: number; playerCount: number | null }[];
  formatMappings?: [string, string][];
  templateTiers?: [string, MetaEventTier | null][];
  competitivePlayerFloor?: number;
  tierClaims?: string[];
}

function fakeRepos(fixture: Fixture): Repos {
  return {
    meta: {
      allEventTiers: () => Promise.resolve(fixture.events ?? []),
      allSources: () =>
        Promise.resolve(
          (fixture.sources ?? []).map((source) => ({
            priority: 0,
            createdAt: new Date("2026-01-01"),
            ...source,
          })),
        ),
    },
    uvsgamesEvents: {
      tierInputsForLiveEvents: () => Promise.resolve(fixture.uvsgames ?? []),
      formatMappings: () =>
        Promise.resolve(new Map(fixture.formatMappings ?? [["standard", "standard"]])),
      templateTiers: () => Promise.resolve(new Map(fixture.templateTiers)),
      settings: () =>
        Promise.resolve({ competitivePlayerFloor: fixture.competitivePlayerFloor ?? 128 }),
    },
    playloltcgEvents: {
      tierInputsForLiveEvents: () => Promise.resolve(fixture.playloltcg ?? []),
    },
    metaOverlays: {
      eventIdsClaimingField: () => Promise.resolve(fixture.tierClaims ?? []),
    },
  } as unknown as Repos;
}

function promoted(metaEventId: string) {
  return {
    metaEventId,
    players: 0,
    removedPlayers: 0,
    decks: 0,
    matches: 0,
    phases: 0,
    unresolvedNames: [],
    mergedLines: [],
    errors: [],
  };
}

/** One uvsgames event on a mapped template, with the format the mappings know. */
function uvsgamesEvent(id: string, tier: MetaEventTier, template: string | null, players = 8) {
  return {
    events: [{ id, tier }],
    sources: [{ metaEventId: id, provider: "uvsgames", externalId: `key-${id}` }],
    uvsgames: [
      {
        metaEventId: id,
        externalId: `key-${id}`,
        eventConfigurationTemplate: template,
        eventFormat: "standard",
        playerCount: players,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(promoteMetaEvent).mockImplementation((_repos, id) => Promise.resolve(promoted(id)));
});

describe("retierMetaEvents", () => {
  it("promotes only the events whose tier the mapping now moves", async () => {
    const repos = fakeRepos({
      ...uvsgamesEvent("moved", "local", "tpl-premier"),
      templateTiers: [["tpl-premier", "premier"]],
    });

    const result = await retierMetaEvents(repos);

    expect(result).toMatchObject({ scanned: 1, moved: 1, events: 1, failed: 0 });
    expect(vi.mocked(promoteMetaEvent)).toHaveBeenCalledWith(
      expect.anything(),
      "moved",
      expect.anything(),
    );
  });

  it("leaves an event the mapping already agrees with alone, building no promote context", async () => {
    const repos = fakeRepos({
      ...uvsgamesEvent("settled", "premier", "tpl-premier"),
      templateTiers: [["tpl-premier", "premier"]],
    });

    const result = await retierMetaEvents(repos);

    expect(result).toMatchObject({ scanned: 1, moved: 0, events: 0 });
    expect(vi.mocked(promoteMetaEvent)).not.toHaveBeenCalled();
    expect(vi.mocked(createMetaPromoteContext)).not.toHaveBeenCalled();
  });

  it("falls back to the field size for a template nobody mapped", async () => {
    const repos = fakeRepos(uvsgamesEvent("big", "local", "tpl-unmapped", 200));

    const result = await retierMetaEvents(repos);

    expect(result.moved).toBe(1);
  });

  it("reads the field-size floor from the stored settings", async () => {
    const under = fakeRepos({
      ...uvsgamesEvent("mid", "local", "tpl-unmapped", 64),
      competitivePlayerFloor: 128,
    });
    const underResult = await retierMetaEvents(under);
    expect(underResult.moved).toBe(0);

    const over = fakeRepos({
      ...uvsgamesEvent("mid", "local", "tpl-unmapped", 64),
      competitivePlayerFloor: 32,
    });
    const overResult = await retierMetaEvents(over);
    expect(overResult.moved).toBe(1);
  });

  it("never moves an event an accepted overlay claims the tier of", async () => {
    const repos = fakeRepos({
      ...uvsgamesEvent("claimed", "local", "tpl-premier"),
      templateTiers: [["tpl-premier", "premier"]],
      tierClaims: ["claimed"],
    });

    const result = await retierMetaEvents(repos);

    expect(result).toMatchObject({ scanned: 1, moved: 0 });
    expect(vi.mocked(promoteMetaEvent)).not.toHaveBeenCalled();
  });

  it("ignores a source whose format the archive cannot map, as promotion does", async () => {
    const repos = fakeRepos({
      events: [{ id: "unmappable", tier: "local" }],
      sources: [{ metaEventId: "unmappable", provider: "uvsgames", externalId: "key-1" }],
      uvsgames: [
        {
          metaEventId: "unmappable",
          externalId: "key-1",
          eventConfigurationTemplate: "tpl-premier",
          eventFormat: "a format nobody mapped",
          playerCount: 8,
        },
      ],
      templateTiers: [["tpl-premier", "premier"]],
    });

    const result = await retierMetaEvents(repos);

    expect(result.moved).toBe(0);
  });

  it("takes the tier of the last citation by priority, as promotion merges them", async () => {
    const repos = fakeRepos({
      events: [{ id: "two-sources", tier: "local" }],
      sources: [
        { metaEventId: "two-sources", provider: "uvsgames", externalId: "key-1", priority: 1 },
        { metaEventId: "two-sources", provider: "playloltcg", externalId: "77", priority: 2 },
      ],
      uvsgames: [
        {
          metaEventId: "two-sources",
          externalId: "key-1",
          eventConfigurationTemplate: "tpl-premier",
          eventFormat: "standard",
          playerCount: 8,
        },
      ],
      playloltcg: [{ metaEventId: "two-sources", activityShopId: 77, playerCount: 300 }],
      templateTiers: [["tpl-premier", "premier"]],
    });

    const result = await retierMetaEvents(repos);

    expect(result.moved).toBe(1);
  });

  it("keeps the live tier for an event no mirror still carries", async () => {
    const repos = fakeRepos({
      events: [{ id: "orphan", tier: "premier" }],
      sources: [{ metaEventId: "orphan", provider: "uvsgames", externalId: "gone" }],
    });

    const result = await retierMetaEvents(repos);

    expect(result).toMatchObject({ scanned: 1, moved: 0 });
  });

  it("treats a zero player count as unreported rather than a field of none", async () => {
    const repos = fakeRepos(uvsgamesEvent("unreported", "local", null, 0));

    const result = await retierMetaEvents(repos);

    expect(result.moved).toBe(0);
  });
});
