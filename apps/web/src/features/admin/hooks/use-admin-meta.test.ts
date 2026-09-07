import { describe, expect, it } from "vitest";

import {
  adminMetaEventsQueryOptions,
  META_EVENT_SORT_FALLBACK,
  metaEventsParamsFromSearch,
} from "./use-admin-meta";

describe("metaEventsParamsFromSearch", () => {
  it("resolves an empty search to the default first page", () => {
    expect(metaEventsParamsFromSearch({})).toEqual({
      page: 1,
      search: undefined,
      format: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      incompleteStandings: undefined,
      noDecks: undefined,
      sort: META_EVENT_SORT_FALLBACK.sort,
      direction: META_EVENT_SORT_FALLBACK.direction,
    });
  });

  it("carries every Public-tab filter through under the query's own names", () => {
    expect(
      metaEventsParamsFromSearch({
        page: 3,
        q: "skirmish",
        liveFormat: "standard",
        liveSource: "playloltcg",
        dateFrom: "2026-08-01",
        dateTo: "2026-08-30",
        incompleteStandings: true,
        noDecks: true,
        liveSort: "name",
        liveDir: "asc",
      }),
    ).toEqual({
      page: 3,
      search: "skirmish",
      format: "standard",
      source: "playloltcg",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-30",
      incompleteStandings: true,
      noDecks: true,
      sort: "name",
      direction: "asc",
    });
  });

  it("keys differently from the bare page-1 params the loader used to warm", () => {
    const tabKey = adminMetaEventsQueryOptions(metaEventsParamsFromSearch({})).queryKey;
    expect(tabKey).not.toEqual(adminMetaEventsQueryOptions({ page: 1 }).queryKey);
  });

  it("keys a filtered deep link differently from the default page", () => {
    const deepLink = metaEventsParamsFromSearch({ page: 2, liveFormat: "standard" });
    expect(adminMetaEventsQueryOptions(deepLink).queryKey).not.toEqual(
      adminMetaEventsQueryOptions(metaEventsParamsFromSearch({})).queryKey,
    );
  });
});
