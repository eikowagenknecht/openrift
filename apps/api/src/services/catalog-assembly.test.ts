import type { CatalogResponse, Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  createContentAddressedCache,
  filterCatalogResponseByLanguages,
  parseLanguageCodes,
} from "./catalog-assembly.js";

const printing = (id: string): Printing => ({ id }) as unknown as Printing;

describe("parseLanguageCodes", () => {
  it("splits, trims and uppercases the codes", () => {
    expect(parseLanguageCodes(" en , fr ")).toEqual(new Set(["EN", "FR"]));
  });

  it("drops blank entries and collapses duplicates", () => {
    expect(parseLanguageCodes("EN,,en, ,FR")).toEqual(new Set(["EN", "FR"]));
  });

  it("returns an empty set for an all-blank list", () => {
    expect(parseLanguageCodes(" , ")).toEqual(new Set());
  });
});

function fakeCatalog(): CatalogResponse {
  return {
    sets: [{ id: "OGS", slug: "OGS", name: "Original Set", releases: {}, setType: "main" }],
    cards: { "OGS-001": { name: "Fire Dragon" } },
    printings: {
      "p-en": { language: "EN" },
      "p-fr": { language: "FR" },
      "p-sc": { language: "SC" },
    },
    totalCopies: 42,
    customTagAssignments: { "OGS-001": ["spicy"] },
  } as unknown as CatalogResponse;
}

describe("filterCatalogResponseByLanguages", () => {
  it("returns the catalog untouched when no filter is given", () => {
    const catalog = fakeCatalog();
    expect(filterCatalogResponseByLanguages(catalog, {})).toBe(catalog);
  });

  it("langs keeps only the listed languages and the full core", () => {
    const variant = filterCatalogResponseByLanguages(fakeCatalog(), {
      langs: new Set(["EN"]),
    });

    expect(Object.keys(variant.printings)).toEqual(["p-en"]);
    expect(variant.cards).toEqual({ "OGS-001": { name: "Fire Dragon" } });
    expect(variant.customTagAssignments).toEqual({ "OGS-001": ["spicy"] });
    expect(variant.sets).toHaveLength(1);
    expect(variant.totalCopies).toBe(42);
  });

  it("langs accepts several codes", () => {
    const variant = filterCatalogResponseByLanguages(fakeCatalog(), {
      langs: new Set(["EN", "SC"]),
    });

    expect(Object.keys(variant.printings).toSorted()).toEqual(["p-en", "p-sc"]);
  });

  it("exceptLangs returns the complement with the core emptied but sets kept", () => {
    const variant = filterCatalogResponseByLanguages(fakeCatalog(), {
      exceptLangs: new Set(["EN"]),
    });

    expect(Object.keys(variant.printings).toSorted()).toEqual(["p-fr", "p-sc"]);
    expect(variant.cards).toEqual({});
    expect(variant.customTagAssignments).toEqual({});
    expect(variant.sets).toHaveLength(1);
    expect(variant.totalCopies).toBe(42);
  });

  it("the two halves partition the printings exactly", () => {
    const langs = new Set(["EN"]);
    const head = filterCatalogResponseByLanguages(fakeCatalog(), { langs });
    const tail = filterCatalogResponseByLanguages(fakeCatalog(), { exceptLangs: langs });

    expect([...Object.keys(head.printings), ...Object.keys(tail.printings)].toSorted()).toEqual(
      Object.keys(fakeCatalog().printings).toSorted(),
    );
  });

  it("matches codes case-insensitively", () => {
    const variant = filterCatalogResponseByLanguages(
      {
        ...fakeCatalog(),
        printings: { "p-lower": { language: "en" } },
      } as unknown as CatalogResponse,
      { langs: parseLanguageCodes("En") },
    );

    expect(Object.keys(variant.printings)).toEqual(["p-lower"]);
  });

  it("an unknown code matches nothing rather than erroring", () => {
    const variant = filterCatalogResponseByLanguages(fakeCatalog(), {
      langs: new Set(["XX"]),
    });

    expect(variant.printings).toEqual({});
    expect(variant.cards).toEqual({ "OGS-001": { name: "Fire Dragon" } });
  });

  it("an unknown code in exceptLangs excludes nothing", () => {
    const variant = filterCatalogResponseByLanguages(fakeCatalog(), {
      exceptLangs: new Set(["XX"]),
    });

    expect(Object.keys(variant.printings)).toHaveLength(3);
  });

  it("an empty code set keeps nothing for langs and everything for exceptLangs", () => {
    const none = filterCatalogResponseByLanguages(fakeCatalog(), { langs: new Set() });
    const all = filterCatalogResponseByLanguages(fakeCatalog(), { exceptLangs: new Set() });

    expect(none.printings).toEqual({});
    expect(Object.keys(all.printings)).toHaveLength(3);
  });

  it("does not mutate the input catalog", () => {
    const catalog = fakeCatalog();
    const before = structuredClone(catalog);

    filterCatalogResponseByLanguages(catalog, { langs: new Set(["EN"]) });
    filterCatalogResponseByLanguages(catalog, { exceptLangs: new Set(["EN"]) });

    expect(catalog).toEqual(before);
  });
});

describe("createContentAddressedCache", () => {
  it("assembles once and reuses the memo while the version is unchanged", async () => {
    let assembleCalls = 0;
    const cache = createContentAddressedCache(
      async () => {
        assembleCalls += 1;
        return [printing(`p${assembleCalls}`)];
      },
      async () => "v1",
    );

    const first = await cache();
    const second = await cache();

    expect(assembleCalls).toBe(1);
    expect(first).toBe(second);
    expect(first).toEqual([printing("p1")]);
  });

  it("reassembles immediately when the version token rolls", async () => {
    let assembleCalls = 0;
    let version = "v1";
    const cache = createContentAddressedCache(
      async () => {
        assembleCalls += 1;
        return [printing(`p${assembleCalls}`)];
      },
      async () => version,
    );

    await cache();
    version = "v2";
    const refreshed = await cache();

    expect(assembleCalls).toBe(2);
    expect(refreshed).toEqual([printing("p2")]);
  });

  it("a burst on a new version triggers a single shared assembly", async () => {
    let assembleCalls = 0;
    let probeCalls = 0;
    const cache = createContentAddressedCache(
      async () => {
        assembleCalls += 1;
        return [printing("p")];
      },
      async () => {
        probeCalls += 1;
        return "v1";
      },
    );

    const [first, second, third] = await Promise.all([cache(), cache(), cache()]);

    expect(assembleCalls).toBe(1);
    expect(probeCalls).toBe(1);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("does not cache a rejected assembly — the next call retries", async () => {
    let assembleCalls = 0;
    const cache = createContentAddressedCache(
      async () => {
        assembleCalls += 1;
        if (assembleCalls === 1) {
          throw new Error("boom");
        }
        return [printing("ok")];
      },
      async () => "v1",
    );

    await expect(cache()).rejects.toThrow("boom");
    const recovered = await cache();

    expect(assembleCalls).toBe(2);
    expect(recovered).toEqual([printing("ok")]);
  });

  it("serves the last good catalog when a probe transiently fails", async () => {
    let assembleCalls = 0;
    let probeShouldFail = false;
    const cache = createContentAddressedCache(
      async () => {
        assembleCalls += 1;
        return [printing("cached")];
      },
      async () => {
        if (probeShouldFail) {
          throw new Error("probe down");
        }
        return "v1";
      },
    );

    const first = await cache();
    probeShouldFail = true;
    const duringOutage = await cache();

    expect(assembleCalls).toBe(1);
    expect(duringOutage).toBe(first);
  });

  it("propagates the probe error when there is no cached catalog yet", async () => {
    const cache = createContentAddressedCache(
      async () => [printing("never")],
      async () => {
        throw new Error("probe down");
      },
    );

    await expect(cache()).rejects.toThrow("probe down");
  });
});
