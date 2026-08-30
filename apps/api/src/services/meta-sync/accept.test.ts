import { createLogger } from "@openrift/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../../deps.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { acceptCandidateEvent } from "../meta-candidate-accept.js";
import { acceptCatalogEvent, autoAcceptCatalogEvents } from "./accept.js";
import type { MetaSyncDeps } from "./deps.js";
import type { UvsClient } from "./uvsgames-client.js";

vi.mock("../meta-candidate-accept.js", () => ({
  acceptCandidateEvent: vi.fn(() =>
    Promise.resolve({ metaEventId: "live-1", slug: "rq-bologna", created: true }),
  ),
  acceptCandidatePlayer: vi.fn(() => Promise.resolve()),
}));

const NOW = new Date("2026-08-20T12:00:00Z");

/** The vocabulary the source files events under, mapped to the archive's slugs. */
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
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    missingSince: null,
    nextCheckAt: null,
    checkStage: 0,
    triage: "new",
    candidateEventId: null,
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
    /** The candidate the mirror already holds for the key, if any. */
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
    unacceptedByKeys: () => {
      reads.push("unacceptedByKeys");
      return Promise.resolve(options.unaccepted ?? []);
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

  const deps: MetaSyncDeps = {
    repos: { metaCandidates, uvsgamesEvents } as unknown as Repos,
    transact: (() => Promise.reject(new Error("no transactions here"))) as unknown as Transact,
    client: { requests: 0 } as unknown as UvsClient,
    log: createLogger("test"),
    now: () => NOW,
  };
  return { deps, inserted, updates, rechecks, reads };
}

describe("acceptCatalogEvent", () => {
  beforeEach(() => {
    vi.mocked(acceptCandidateEvent).mockClear();
  });

  it("builds a candidate shell from the catalogue row and arms the recheck queue", async () => {
    const { deps, inserted, rechecks } = fakeDeps();

    const accepted = await acceptCatalogEvent(deps, catalogRow());

    expect(accepted).toMatchObject({ metaEventId: "live-1", candidateEventId: "cand-1" });
    expect(inserted[0]).toMatchObject({
      externalId: "365708",
      format: "constructed",
      eventDate: "2026-02-20",
      playerCount: 64,
      metaEventId: null,
    });
    expect(rechecks).toEqual([{ externalId: "365708", nextCheckAt: NOW, checkStage: 0 }]);
  });

  it("classifies a large field as competitive and a small one as a store event", async () => {
    const big = fakeDeps();
    await acceptCatalogEvent(big.deps, catalogRow({ playerCount: 400 }));
    expect(big.inserted[0]).toMatchObject({ tier: "competitive" });

    const small = fakeDeps();
    await acceptCatalogEvent(small.deps, catalogRow({ playerCount: 12 }));
    expect(small.inserted[0]).toMatchObject({ tier: "store" });
  });

  it("lets the template's curated tier win over the field size", async () => {
    const { deps, inserted } = fakeDeps({ templateTiers: new Map([["tpl-1", "premier"]]) });

    await acceptCatalogEvent(
      deps,
      catalogRow({ playerCount: 8, eventConfigurationTemplate: "tpl-1" }),
    );

    expect(inserted[0]).toMatchObject({ tier: "premier" });
  });

  it("stores an unreported field as no count rather than as zero players", async () => {
    const { deps, inserted } = fakeDeps();

    await acceptCatalogEvent(deps, catalogRow({ playerCount: 0 }));

    expect(inserted[0]).toMatchObject({ playerCount: null, tier: "store" });
  });

  it("trims a padded location and stores a blank one as nothing", async () => {
    const trimmed = fakeDeps();
    await acceptCatalogEvent(trimmed.deps, catalogRow({ location: "  Via Roma 1, Italy  " }));
    expect(trimmed.inserted[0]).toMatchObject({ location: "Via Roma 1, Italy", country: "IT" });

    const blank = fakeDeps();
    await acceptCatalogEvent(blank.deps, catalogRow({ location: "   " }));
    expect(blank.inserted[0]).toMatchObject({ location: null, country: null });
  });

  it("keeps a staged candidate's own rows and only corrects its format", async () => {
    const { deps, inserted, updates } = fakeDeps({
      existing: { id: "cand-9", format: "limited" },
    });

    const accepted = await acceptCatalogEvent(deps, catalogRow());

    expect(inserted).toEqual([]);
    expect(updates).toEqual([{ id: "cand-9", values: { format: "constructed" } }]);
    expect(accepted.candidateEventId).toBe("cand-9");
  });

  it("writes nothing when the staged candidate already carries the format", async () => {
    const { deps, updates } = fakeDeps({ existing: { id: "cand-9", format: "constructed" } });

    await acceptCatalogEvent(deps, catalogRow());

    expect(updates).toEqual([]);
  });

  it("takes the admin's hand-picked format over the source's own", async () => {
    const { deps, inserted } = fakeDeps();

    await acceptCatalogEvent(deps, catalogRow({ eventFormat: "Draft" }), { format: "limited" });

    expect(inserted[0]).toMatchObject({ format: "limited" });
  });

  it("asks for a format instead of accepting one the archive cannot file", async () => {
    const { deps, inserted } = fakeDeps();

    await expect(
      acceptCatalogEvent(deps, catalogRow({ eventFormat: "Sealed Cube" })),
    ).rejects.toThrow("Pick one to accept it");
    expect(inserted).toEqual([]);
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
    vi.mocked(acceptCandidateEvent).mockClear();
    vi.mocked(acceptCandidateEvent).mockResolvedValue({
      metaEventId: "live-1",
      slug: "rq-bologna",
      created: true,
    } as never);
  });

  it("reads nothing for an empty key list", async () => {
    const { deps, reads } = fakeDeps();

    expect(await autoAcceptCatalogEvents(deps, [])).toEqual({ accepted: 0, errors: [] });
    expect(reads).toEqual([]);
  });

  it("reads no rows while every rule is switched off", async () => {
    const { deps, reads } = fakeDeps({ unaccepted: [catalogRow()] });

    expect(await autoAcceptCatalogEvents(deps, ["365708"])).toEqual({ accepted: 0, errors: [] });
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

    expect(summary).toEqual({ accepted: 1, errors: [] });
    expect(rechecks.map((write) => write.externalId)).toEqual(["big"]);
  });

  it("never accepts an event whose format the archive cannot file", async () => {
    const { deps } = fakeDeps({
      settings: { autoAcceptMinPlayers: 64, autoAcceptNotable: false, autoAcceptOfficial: false },
      unaccepted: [catalogRow({ playerCount: 200, eventFormat: "Sealed Cube" })],
    });

    expect(await autoAcceptCatalogEvents(deps, ["365708"])).toEqual({ accepted: 0, errors: [] });
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
    vi.mocked(acceptCandidateEvent).mockRejectedValueOnce(new Error("slug is taken"));
    const { deps } = fakeDeps({
      settings: { autoAcceptMinPlayers: 64, autoAcceptNotable: false, autoAcceptOfficial: false },
      unaccepted: [
        catalogRow({ externalId: "first", playerCount: 200 }),
        catalogRow({ externalId: "second", playerCount: 200 }),
      ],
    });

    const summary = await autoAcceptCatalogEvents(deps, ["first", "second"]);

    expect(summary.accepted).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain("slug is taken");
    expect(summary.errors[0]).toContain("first");
  });
});
