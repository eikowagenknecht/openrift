import { createLogger } from "@openrift/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../../../../deps.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { promoteNewEvent } from "../meta-promote.js";
import { acceptCatalogEvent, autoAcceptCatalogBacklog, autoAcceptCatalogEvents } from "./accept.js";
import type { MetaSyncDeps } from "./deps.js";
import type { UvsClient } from "./uvsgames-client.js";

vi.mock("../meta-promote.js", () => ({
  promoteNewEvent: vi.fn(() =>
    Promise.resolve({ metaEventId: "live-1", slug: "rq-bologna", created: true }),
  ),
  promoteMetaEvent: vi.fn(() => Promise.resolve({ errors: [] })),
}));

const NOW = new Date("2026-08-20T12:00:00Z");

const FORMAT_MAPPINGS = new Map([["constructed", "constructed"]]);

function catalogRow(overrides: Partial<UvsgamesListRow> = {}): UvsgamesListRow {
  return {
    externalId: "365708",
    name: "Riftbound Regional Qualifier - Bologna",
    startAt: new Date("2026-02-20T09:00:00Z"),
    endAtEstimate: null,
    displayStatus: "complete",
    decklistStatus: null,
    playerCount: 64,
    eventType: "LOCALS",
    eventFormat: "Constructed",
    storeId: 19_428,
    storeName: "UVS Games Organized Play",
    storeDisplayName: "UVS Games Organized Play",
    location: null,
    timezone: "Europe/Rome",
    eventConfigurationTemplate: null,
    contentHash: "hash",
    resultsFetchedAt: null,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    missingSince: null,
    nextCheckAt: null,
    checkStage: 0,
    triage: "new",
    metaEventId: null,
    metaEventSlug: null,
    ...overrides,
  };
}

interface RecheckWrite {
  externalId: string;
  nextCheckAt: Date | null;
  checkStage: number;
}

function fakeDeps(
  options: {
    existing?: { id: string; format: string };
    settings?: {
      autoAcceptMinPlayers: number | null;
      autoAcceptNotable: boolean;
      autoAcceptOfficial: boolean;
    };
    unaccepted?: UvsgamesListRow[];
    watchedTemplates?: string[];
    templateTiers?: Map<string, string>;
    formatMappings?: ReadonlyMap<string, string>;
  } = {},
): {
  deps: MetaSyncDeps;
  inserted: Record<string, unknown>[];
  updates: { id: string; values: Record<string, unknown> }[];
  rechecks: RecheckWrite[];
  reads: string[];
  lifecycles: { metaEventId: string; status: string; sourceCheckedAt: Date | null }[];
} {
  const inserted: Record<string, unknown>[] = [];
  const updates: { id: string; values: Record<string, unknown> }[] = [];
  const rechecks: RecheckWrite[] = [];
  const reads: string[] = [];

  const metaCandidates = {
    eventsBySourceKeys: () =>
      Promise.resolve(options.existing === undefined ? [] : [options.existing]),
    updateEvent: (id: string, values: Record<string, unknown>) => {
      updates.push({ id, values });
      return Promise.resolve();
    },
    insertEvent: (values: Record<string, unknown>) => {
      inserted.push(values);
      return Promise.resolve(`cand-${inserted.length}`);
    },
  };

  const uvsgamesEvents = {
    settings: () => {
      reads.push("settings");
      return Promise.resolve({
        autoAcceptMinPlayers: null,
        autoAcceptNotable: false,
        autoAcceptOfficial: false,
        ...options.settings,
        updatedAt: NOW,
      });
    },
    unacceptedByKeys: (keys: readonly string[]) => {
      reads.push("unacceptedByKeys");
      const rows = options.unaccepted ?? [];
      return Promise.resolve(rows.filter((row) => keys.includes(row.externalId)));
    },
    newKeys: () => {
      reads.push("newKeys");
      return Promise.resolve((options.unaccepted ?? []).map((row) => row.externalId));
    },
    watchedTemplates: () =>
      Promise.resolve(
        new Map<string, string | null>((options.watchedTemplates ?? []).map((id) => [id, null])),
      ),
    formatMappings: () => Promise.resolve(options.formatMappings ?? FORMAT_MAPPINGS),
    templateTiers: () => Promise.resolve(options.templateTiers ?? new Map<string, string>()),
    setRecheck: (externalId: string, values: Omit<RecheckWrite, "externalId">) => {
      rechecks.push({ externalId, ...values });
      return Promise.resolve();
    },
  };

  const lifecycles: { metaEventId: string; status: string; sourceCheckedAt: Date | null }[] = [];
  const meta = {
    setEventLifecycle: (
      metaEventId: string,
      values: { status: string; sourceCheckedAt: Date | null },
    ) => {
      lifecycles.push({ metaEventId, ...values });
      return Promise.resolve();
    },
  };

  const deps: MetaSyncDeps = {
    repos: { metaCandidates, uvsgamesEvents, meta } as unknown as Repos,
    transact: (() => Promise.reject(new Error("no transactions here"))) as unknown as Transact,
    client: { requests: 0 } as unknown as UvsClient,
    log: createLogger("test"),
    now: () => NOW,
  };
  return { deps, inserted, updates, rechecks, reads, lifecycles };
}

describe("acceptCatalogEvent", () => {
  beforeEach(() => {
    vi.mocked(promoteNewEvent).mockClear();
  });

  it("seeds the live event from the catalogue row and arms the recheck queue", async () => {
    const { deps, rechecks, lifecycles } = fakeDeps();

    const accepted = await acceptCatalogEvent(deps, catalogRow());

    expect(accepted).toMatchObject({ metaEventId: "live-1", slug: "rq-bologna" });
    expect(lifecycles).toMatchObject([{ metaEventId: "live-1", status: "complete" }]);
    expect(vi.mocked(promoteNewEvent).mock.calls[0]?.[3]).toMatchObject({
      name: "Riftbound Regional Qualifier - Bologna",
      eventDate: "2026-02-20",
      format: "constructed",
    });
    expect(rechecks).toEqual([{ externalId: "365708", nextCheckAt: NOW, checkStage: 0 }]);
  });

  it("takes the admin's hand-picked format over the source's own", async () => {
    const { deps } = fakeDeps();

    await acceptCatalogEvent(deps, catalogRow({ eventFormat: "Draft" }), { format: "limited" });

    expect(vi.mocked(promoteNewEvent).mock.calls[0]?.[3]).toMatchObject({ format: "limited" });
  });

  it("asks for a format instead of accepting one the archive cannot file", async () => {
    const { deps } = fakeDeps();

    await expect(
      acceptCatalogEvent(deps, catalogRow({ eventFormat: "Sealed Cube" })),
    ).rejects.toThrow("Pick one to accept it");
    expect(promoteNewEvent).not.toHaveBeenCalled();
  });

  it("asks for a format when the source published none at all", async () => {
    const { deps } = fakeDeps();

    await expect(acceptCatalogEvent(deps, catalogRow({ eventFormat: null }))).rejects.toThrow(
      "Pick one to accept it",
    );
  });
});

describe("autoAcceptCatalogEvents", () => {
  beforeEach(() => {
    vi.mocked(promoteNewEvent).mockClear();
    vi.mocked(promoteNewEvent).mockResolvedValue({
      metaEventId: "live-1",
      slug: "rq-bologna",
      created: true,
    } as never);
  });

  it("reads nothing for an empty key list", async () => {
    const { deps, reads } = fakeDeps();

    expect(await autoAcceptCatalogEvents(deps, [])).toEqual({
      considered: 0,
      accepted: 0,
      failed: 0,
      errors: [],
    });
    expect(reads).toEqual([]);
  });

  it("reads no rows while every rule is switched off", async () => {
    const { deps, reads } = fakeDeps({ unaccepted: [catalogRow()] });

    expect(await autoAcceptCatalogEvents(deps, ["365708"])).toEqual({
      considered: 0,
      accepted: 0,
      failed: 0,
      errors: [],
    });
    expect(reads).toEqual(["settings"]);
  });

  it("accepts the rows that meet the player-count rule and leaves the rest", async () => {
    const { deps, rechecks } = fakeDeps({
      settings: { autoAcceptMinPlayers: 64, autoAcceptNotable: false, autoAcceptOfficial: false },
      unaccepted: [
        catalogRow({ externalId: "big", playerCount: 200 }),
        catalogRow({ externalId: "small", playerCount: 8 }),
      ],
    });

    const summary = await autoAcceptCatalogEvents(deps, ["big", "small"]);

    expect(summary).toEqual({ considered: 2, accepted: 1, failed: 0, errors: [] });
    expect(rechecks.map((write) => write.externalId)).toEqual(["big"]);
  });

  it("never accepts an event whose format the archive cannot file", async () => {
    const { deps } = fakeDeps({
      settings: { autoAcceptMinPlayers: 64, autoAcceptNotable: false, autoAcceptOfficial: false },
      unaccepted: [catalogRow({ playerCount: 200, eventFormat: "Sealed Cube" })],
    });

    expect(await autoAcceptCatalogEvents(deps, ["365708"])).toMatchObject({
      considered: 1,
      accepted: 0,
    });
  });

  it("accepts an event on a watched template regardless of its field size", async () => {
    const { deps } = fakeDeps({
      settings: { autoAcceptMinPlayers: null, autoAcceptNotable: false, autoAcceptOfficial: true },
      unaccepted: [catalogRow({ playerCount: 4, eventConfigurationTemplate: "tpl-1" })],
      watchedTemplates: ["tpl-1"],
    });

    expect(await autoAcceptCatalogEvents(deps, ["365708"])).toMatchObject({ accepted: 1 });
  });

  it("collects one row's failure and carries on with the rest of the sweep", async () => {
    vi.mocked(promoteNewEvent).mockRejectedValueOnce(new Error("slug is taken"));
    const { deps } = fakeDeps({
      settings: { autoAcceptMinPlayers: 64, autoAcceptNotable: false, autoAcceptOfficial: false },
      unaccepted: [
        catalogRow({ externalId: "first", playerCount: 200 }),
        catalogRow({ externalId: "second", playerCount: 200 }),
      ],
    });

    const summary = await autoAcceptCatalogEvents(deps, ["first", "second"]);

    expect(summary.accepted).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain("slug is taken");
    expect(summary.errors[0]).toContain("first");
  });
});

describe("autoAcceptCatalogBacklog", () => {
  beforeEach(() => {
    vi.mocked(promoteNewEvent).mockClear();
    vi.mocked(promoteNewEvent).mockResolvedValue({
      metaEventId: "live-1",
      slug: "rq-bologna",
      created: true,
    } as never);
  });

  it("reads no keys while every rule is switched off", async () => {
    const { deps, reads } = fakeDeps({ unaccepted: [catalogRow()] });

    expect(await autoAcceptCatalogBacklog(deps)).toEqual({
      considered: 0,
      accepted: 0,
      failed: 0,
      errors: [],
    });
    expect(reads).toEqual(["settings"]);
  });

  it("sweeps the whole triage list rather than one crawl's keys", async () => {
    const { deps, rechecks, reads } = fakeDeps({
      settings: { autoAcceptMinPlayers: 64, autoAcceptNotable: false, autoAcceptOfficial: false },
      unaccepted: [
        catalogRow({ externalId: "old-big", playerCount: 200 }),
        catalogRow({ externalId: "old-small", playerCount: 8 }),
      ],
    });

    const summary = await autoAcceptCatalogBacklog(deps);

    expect(summary).toEqual({ considered: 2, accepted: 1, failed: 0, errors: [] });
    expect(rechecks.map((write) => write.externalId)).toEqual(["old-big"]);
    expect(reads).toContain("newKeys");
  });
});
