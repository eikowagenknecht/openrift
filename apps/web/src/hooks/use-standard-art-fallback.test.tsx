import type { CatalogResponse, Printing } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import { useStandardArtFallback } from "@/hooks/use-standard-art-fallback";
import { queryKeys } from "@/lib/query-keys";
import { stubPrinting } from "@/test/factories";

const SET_ID = "00000000-0000-0000-0000-00000000set1";

// Strips the enriched fields back off a stub Printing to get the wire value shape.
function toCatalogValue(printing: Printing) {
  const { id: _id, setSlug: _slug, setReleased: _released, card: _card, ...value } = printing;
  return { ...value, setId: SET_ID };
}

// Structural cast: the zod wire schema and the stub-derived shape agree on
// every field the enrichment reads (sets, cards, printings, ids).
function makeCatalog(printings: Printing[]): CatalogResponse {
  return {
    sets: [
      {
        id: SET_ID,
        slug: "rb1",
        name: "Set One",
        releases: { EN: { releasedAt: "2025-01-01", precision: "day" } },
      },
    ],
    cards: Object.fromEntries(printings.map((p) => [p.cardId, p.card])),
    printings: Object.fromEntries(printings.map((p) => [p.id, toCatalogValue(p)])),
    totalCopies: 0,
    customTagAssignments: {},
  } as unknown as CatalogResponse;
}

function setup(catalog?: CatalogResponse) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (catalog) {
    client.setQueryData(queryKeys.catalog.all, catalog);
  }
  function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  const { result } = renderHook(() => useStandardArtFallback(), { wrapper });
  return { client, result };
}

describe("useStandardArtFallback", () => {
  it("resolves fallback art from the cached catalog", () => {
    const target = stubPrinting({
      id: "p-target",
      cardId: "card-1",
      language: "SC",
      images: [],
    });
    const enStandard = stubPrinting({
      id: "p-en",
      cardId: "card-1",
      language: "EN",
      images: [{ face: "front", imageId: "img-en" }],
    });
    const { result } = setup(makeCatalog([target, enStandard]));
    const fallback = result.current(target);
    expect(fallback?.printing?.id).toBe("p-en");
    expect(fallback?.image.imageId).toBe("img-en");
  });

  it("returns null for cards without a usable standard printing", () => {
    const target = stubPrinting({ id: "p-target", cardId: "card-1", images: [] });
    const { result } = setup(makeCatalog([target]));
    expect(result.current(target)).toBeNull();
  });

  it("returns null and does not fetch when the catalog is not cached", () => {
    const { client, result } = setup();
    expect(result.current(stubPrinting())).toBeNull();
    // enabled: false must keep the ~310 KB catalog fetch off surfaces that
    // don't otherwise load it.
    expect(client.getQueryState(queryKeys.catalog.all)?.fetchStatus ?? "idle").toBe("idle");
  });
});
