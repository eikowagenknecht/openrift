import { useNavigate } from "@tanstack/react-router";

import { MetaAdminOverviewPage } from "@/components/admin/meta-admin-overview-page";
import { MetaCatalogPage } from "@/components/admin/meta-catalog-page";
import { MetaEventsPage } from "@/components/admin/meta-events-page";
import { MetaOverlaysPage } from "@/components/admin/meta-overlays-page";
import { PlayloltcgCatalogPage } from "@/components/admin/playloltcg-catalog-page";
import { TopdeckCatalogPage } from "@/components/admin/topdeck-catalog-page";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminMetaOverlays } from "@/hooks/use-admin-meta-overlays";
import { Route } from "@/routes/_app/_authenticated/admin/meta";

/** The tabs that name themselves in the URL. Sync is the default. */
const OPT_IN_TABS = ["catalogue", "review", "public"] as const;

/**
 * Both paged tables' filters, cleared. Leaving a tab drops them, so the URL
 * never carries a filter set for a table that is no longer on screen, which is
 * also what lets the two tables share the four unprefixed names below.
 */
const CLEARED_TABLE_FILTERS = {
  // The catalogue's own source picker; every other tab covers both sources.
  source: undefined,
  // Shared by both paged tables.
  page: undefined,
  q: undefined,
  dateFrom: undefined,
  dateTo: undefined,
  // Catalogue only.
  triage: undefined,
  eventStatus: undefined,
  eventSort: undefined,
  eventDir: undefined,
  minPlayers: undefined,
  decklists: undefined,
  missing: undefined,
  awaitingResults: undefined,
  plStatus: undefined,
  tdFormat: undefined,
  // Public only.
  liveFormat: undefined,
  liveSource: undefined,
  liveSort: undefined,
  liveDir: undefined,
  incompleteStandings: undefined,
  noDecks: undefined,
} as const;

/**
 * The tab a value selects. Sync is the default, so choosing it clears the
 * search param rather than naming it.
 *
 * @param value - The tab the user picked.
 * @returns The tab to put in the URL, or undefined for the default.
 */
function tabParam(value: string): (typeof OPT_IN_TABS)[number] | undefined {
  return OPT_IN_TABS.find((tab) => tab === value);
}

/**
 * The Meta Archive's admin surface (ADR-014), as the four stages an event walks:
 * the pipeline overview and its controls, the catalogue mirror events are picked
 * from, the review queue where staged results wait on a human, and the live
 * archive visitors read. Each tab renders its own page top bar, so the bar's
 * actions always belong to what is on screen — BaseUI unmounts the hidden panel,
 * so only one bar is ever portalled into the layout slot.
 *
 * @returns The tabbed Meta Archive admin page.
 */
export function MetaAdminPage() {
  const { data } = useAdminMetaOverlays();
  const tab = Route.useSearch({ select: (search) => search.tab ?? "sync" });
  const source = Route.useSearch({ select: (search) => search.source ?? "uvsgames" });
  const navigate = useNavigate({ from: Route.fullPath });

  const pendingCount = data.overlays.length;

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        void navigate({
          search: (prev) => ({ ...prev, ...CLEARED_TABLE_FILTERS, tab: tabParam(value) }),
          replace: true,
        });
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList variant="line">
        <TabsTrigger value="sync">Sync</TabsTrigger>
        <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
        <TabsTrigger value="review">
          Review
          {pendingCount > 0 && <Badge variant="count">{pendingCount}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="public">Public</TabsTrigger>
      </TabsList>
      <TabsContent value="sync" className="flex min-h-0 flex-1 flex-col">
        <MetaAdminOverviewPage />
      </TabsContent>
      <TabsContent value="catalogue" className="flex min-h-0 flex-1 flex-col">
        {source === "playloltcg" && <PlayloltcgCatalogPage />}
        {source === "topdeck" && <TopdeckCatalogPage />}
        {source === "uvsgames" && <MetaCatalogPage />}
      </TabsContent>
      <TabsContent value="review" className="flex min-h-0 flex-1 flex-col">
        <MetaOverlaysPage />
      </TabsContent>
      <TabsContent value="public" className="flex min-h-0 flex-1 flex-col">
        <MetaEventsPage />
      </TabsContent>
    </Tabs>
  );
}
