import { describe, expect, it } from "vitest";

import {
  catalogContentHash,
  isNotableEventName,
  mapSourceFormat,
  projectCatalogRow,
  projectTemplateRows,
  uvsgamesEventUrl,
  venueLocalDay,
} from "./uvsgames-catalog.js";

const OFFICIAL_TEMPLATE = "0cbcab3e-be80-4d1d-a450-9485e584906d";

function listingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 4821,
    name: "Summoner Skirmish Regional",
    start_datetime: "2026-08-15T18:00:00Z",
    heuristic_end_datetime: "2026-08-15T23:30:00Z",
    display_status: "complete",
    settings: { decklist_status: "PUBLISHED" },
    starting_player_count: 128,
    event_type: "LOCALS",
    event_format: "OTHER",
    gameplay_format: { name: "Constructed" },
    full_address: "Piltover, Valoran",
    timezone: "America/New_York",
    store: { id: 19_428, name: "The Rift Room" },
    event_configuration_template: OFFICIAL_TEMPLATE,
    ...overrides,
  };
}

describe("projectCatalogRow", () => {
  it("reads the format from gameplay_format alone, never the junk event_format field", () => {
    const projection = projectCatalogRow(listingRow({ gameplay_format: { name: "Sealed" } }));
    expect(projection?.eventFormat).toBe("Sealed");

    expect(projectCatalogRow(listingRow({ gameplay_format: null }))?.eventFormat).toBeNull();
  });

  it("reads every projected field from a listing row", () => {
    const projection = projectCatalogRow(listingRow());

    expect(projection).toMatchObject({
      externalId: "4821",
      name: "Summoner Skirmish Regional",
      displayStatus: "complete",
      decklistStatus: "PUBLISHED",
      playerCount: 128,
      eventType: "LOCALS",
      eventFormat: "Constructed",
      storeName: "The Rift Room",
      location: "Piltover, Valoran",
      timezone: "America/New_York",
      eventConfigurationTemplate: OFFICIAL_TEMPLATE,
      storeId: 19_428,
    });
    expect(projection?.startAt.toISOString()).toBe("2026-08-15T18:00:00.000Z");
    expect(projection?.endAtEstimate?.toISOString()).toBe("2026-08-15T23:30:00.000Z");
  });

  it("drops a row with no id, name, start time, or status", () => {
    expect(projectCatalogRow(listingRow({ id: null }))).toBeNull();
    expect(projectCatalogRow(listingRow({ name: "  " }))).toBeNull();
    expect(projectCatalogRow(listingRow({ start_datetime: "not a date" }))).toBeNull();
    expect(projectCatalogRow(listingRow({ display_status: null }))).toBeNull();
    expect(projectCatalogRow("nope")).toBeNull();
  });

  it("reads the store name from either shape the source has used", () => {
    const flat = projectCatalogRow(listingRow({ store: null, store_name: "Flat" }));
    expect(flat?.storeName).toBe("Flat");
    expect(flat?.storeId).toBeNull();
    expect(projectCatalogRow(listingRow({ store: undefined }))?.storeName).toBeNull();
  });

  it("takes the store's id only when the source published a real one", () => {
    expect(projectCatalogRow(listingRow({ store: { name: "Keyless" } }))?.storeId).toBeNull();
    expect(projectCatalogRow(listingRow({ store: { id: 0, name: "Zero" } }))?.storeId).toBeNull();
    expect(
      projectCatalogRow(listingRow({ store: { id: "19428", name: "Text" } }))?.storeId,
    ).toBeNull();
  });

  it("leaves optional fields null rather than inventing them", () => {
    const projection = projectCatalogRow({
      id: 7,
      name: "Bare",
      start_datetime: "2026-01-02T00:00:00Z",
      display_status: "upcoming",
    });

    expect(projection).toMatchObject({
      decklistStatus: null,
      playerCount: null,
      eventType: null,
      eventFormat: null,
      storeId: null,
      storeName: null,
      location: null,
      timezone: null,
      eventConfigurationTemplate: null,
    });
  });

  it("truncates a name past the column's bound", () => {
    const projection = projectCatalogRow(listingRow({ name: "x".repeat(200) }));

    expect(projection?.name).toHaveLength(120);
  });
});

describe("catalogContentHash", () => {
  it("is stable for the same projection and moves when a field does", () => {
    const first = projectCatalogRow(listingRow());
    const same = projectCatalogRow(listingRow());
    const moved = projectCatalogRow(listingRow({ display_status: "inProgress" }));

    expect(first?.contentHash).toBe(same?.contentHash);
    expect(first?.contentHash).not.toBe(moved?.contentHash);
  });

  it("moves when the event changes store, so a reassignment rewrites the row", () => {
    const first = projectCatalogRow(listingRow());
    const moved = projectCatalogRow(listingRow({ store: { id: 3472, name: "Mox Boarding" } }));

    expect(first?.contentHash).not.toBe(moved?.contentHash);
  });

  it("moves when the event changes template, so the next crawl rewrites the row", () => {
    const official = projectCatalogRow(listingRow());
    const other = projectCatalogRow(
      listingRow({ event_configuration_template: "f0c650f5-ab18-4d69-8112-19e5cff8b7b2" }),
    );
    const none = projectCatalogRow(listingRow({ event_configuration_template: null }));

    expect(official?.contentHash).not.toBe(other?.contentHash);
    expect(official?.contentHash).not.toBe(none?.contentHash);
  });

  it("keeps two events apart when a space inside one field moves the field boundary", () => {
    const base = {
      externalId: "1",
      name: "A",
      startAt: new Date("2026-01-01T00:00:00Z"),
      endAtEstimate: null,
      displayStatus: "complete",
      decklistStatus: null,
      playerCount: null,
      eventType: null,
      eventFormat: null,
      storeId: null,
      storeName: null,
      location: null,
      timezone: null,
      eventConfigurationTemplate: null,
    };

    expect(
      catalogContentHash({ ...base, eventType: "Store", eventFormat: "Championship Sealed" }),
    ).not.toBe(
      catalogContentHash({ ...base, eventType: "Store Championship", eventFormat: "Sealed" }),
    );
  });

  it("separates a null field from an empty string in the same position", () => {
    const base = {
      externalId: "1",
      name: "A",
      startAt: new Date("2026-01-01T00:00:00Z"),
      endAtEstimate: null,
      displayStatus: "complete",
      decklistStatus: null,
      playerCount: null,
      eventType: null,
      eventFormat: null,
      storeId: null,
      storeName: null,
      location: null,
      timezone: null,
      eventConfigurationTemplate: null,
    };

    expect(catalogContentHash(base)).not.toBe(
      catalogContentHash({ ...base, storeName: "A", name: "" }),
    );
  });
});

describe("mapSourceFormat", () => {
  const mappings = new Map([
    ["constructed", "constructed"],
    ["standardconstructed", "constructed"],
  ]);

  it("resolves a mapped format however the source cased or spaced it", () => {
    expect(mapSourceFormat(mappings, "CONSTRUCTED")).toBe("constructed");
    expect(mapSourceFormat(mappings, "Constructed")).toBe("constructed");
    expect(mapSourceFormat(mappings, "Standard Constructed")).toBe("constructed");
  });

  it("maps nothing the admin has not mapped", () => {
    expect(mapSourceFormat(mappings, "SEALED")).toBeNull();
    expect(mapSourceFormat(mappings, null)).toBeNull();
    expect(mapSourceFormat(mappings, "  ")).toBeNull();
    expect(mapSourceFormat(new Map(), "CONSTRUCTED")).toBeNull();
  });
});

describe("isNotableEventName", () => {
  it("matches the notable vocabulary case-insensitively", () => {
    expect(isNotableEventName("Runeterra Regional Qualifier")).toBe(true);
    expect(isNotableEventName("WORLDS 2026")).toBe(true);
    expect(isNotableEventName("Friday Night Riftbound")).toBe(false);
  });
});

describe("venueLocalDay", () => {
  it("uses the venue's own calendar day, not the UTC one", () => {
    expect(venueLocalDay(new Date("2026-08-16T00:00:00Z"), "America/New_York")).toBe("2026-08-15");
  });

  it("falls back to UTC for a missing or unusable zone", () => {
    expect(venueLocalDay(new Date("2026-08-16T00:00:00Z"), null)).toBe("2026-08-16");
    expect(venueLocalDay(new Date("2026-08-16T00:00:00Z"), "Nowhere/Nothing")).toBe("2026-08-16");
  });
});

describe("uvsgamesEventUrl", () => {
  it("points at the source's own page for the event", () => {
    expect(uvsgamesEventUrl("4821")).toBe("https://locator.riftbound.uvsgames.com/events/4821");
  });
});

describe("projectTemplateRows", () => {
  it("keeps the id and the name, and drops the policies around them", () => {
    expect(
      projectTemplateRows([
        {
          id: "0cbcab3e-be80-4d1d-a450-9485e584906d",
          name: "Riftbound Regional Qualifier",
          description: "",
          game: { id: 3, slug: "riftbound" },
          event_structure_policy: { id: "cf6c2779" },
        },
      ]),
    ).toEqual([
      {
        templateId: "0cbcab3e-be80-4d1d-a450-9485e584906d",
        sourceName: "Riftbound Regional Qualifier",
      },
    ]);
  });

  it("skips an entry missing either half of the pair", () => {
    expect(
      projectTemplateRows([{ id: "tpl-1" }, { name: "Nameless" }, { id: "tpl-2", name: "  " }]),
    ).toEqual([]);
  });

  it("reads nothing out of a body that is not the array the endpoint returns", () => {
    expect(projectTemplateRows({ results: [{ id: "tpl-1", name: "Wrapped" }] })).toEqual([]);
    expect(projectTemplateRows(null)).toEqual([]);
  });

  it("truncates a name past the column's cap rather than losing the template", () => {
    const [template] = projectTemplateRows([{ id: "tpl-1", name: "N".repeat(400) }]);
    expect(template?.sourceName).toHaveLength(200);
  });
});
