import { Link, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { AcceptedCardsTable } from "@/components/admin/accepted-cards-table";
import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { CandidateCardsTable } from "@/components/admin/candidate-cards-table";
import { UnmatchedProductsPanel } from "@/components/admin/unmatched-products-panel";
import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminAccess } from "@/hooks/use-admin";
import { useAdminCardList } from "@/hooks/use-admin-card-queries";
import { useSets } from "@/hooks/use-sets";
import { useUnifiedMappingsWhen } from "@/hooks/use-unified-mappings";
import { filterCardsBySet } from "@/lib/admin-cards-search";
import { buildCoverageMapBySlug, buildPriceAssignBucketsBySlug } from "@/lib/marketplace-coverage";
import { Route } from "@/routes/_app/_authenticated/admin/cards";

const ALL_SETS = "__all__";

export function AdminCardListPage() {
  const { data } = useAdminCardList();
  const { data: access } = useAdminAccess();
  // card-review grant holders share this page with full admins; only card
  // creation, marketplace data, and the unmatched-products tab are admin-only.
  const isAdmin = access?.isAdmin === true;
  const { data: unified } = useUnifiedMappingsWhen(isAdmin);
  const { data: setsData } = useSets();
  const { tab: rawTab, setSlug } = Route.useSearch({
    select: (s) => ({ tab: s.tab ?? "cards", setSlug: s.set }),
  });
  const tab = !isAdmin && rawTab === "unmatched" ? "cards" : rawTab;
  const navigate = useNavigate({ from: Route.fullPath });

  const setOptions = [
    { value: ALL_SETS, label: "All sets" },
    ...setsData.sets
      .toSorted((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ value: s.slug, label: s.name })),
  ];
  if (setSlug && !setOptions.some((o) => o.value === setSlug)) {
    setOptions.push({ value: setSlug, label: setSlug });
  }

  // Each row carries the set slugs of both accepted and candidate printings,
  // so the set filter narrows both tabs including still-unaccepted cards.
  const cards = filterCardsBySet(
    data.filter((r) => r.cardSlug),
    setSlug,
  );
  const candidates = filterCardsBySet(
    data.filter((r) => !r.cardSlug),
    setSlug,
  );
  const unmatchedCount = unified
    ? unified.unmatchedProducts.tcgplayer.length +
      unified.unmatchedProducts.cardmarket.length +
      unified.unmatchedProducts.cardtrader.length
    : 0;

  const coverageBySlug = buildCoverageMapBySlug(unified?.groups ?? []);
  const assignBucketsBySlug = buildPriceAssignBucketsBySlug(unified?.groups ?? []);

  function changeSet(value: string | null) {
    const next = value && value !== ALL_SETS ? value : undefined;
    void navigate({
      search: (prev) => ({ ...prev, set: next }),
      replace: true,
    });
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        void navigate({
          search: (prev) => ({
            ...prev,
            tab: value === "cards" ? undefined : (value as "candidates" | "unmatched"),
            q: undefined,
            tableSort: undefined,
            status: undefined,
            priceScope: undefined,
          }),
          replace: true,
        });
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <AdminPageTopBar
        title="Cards"
        actions={
          isAdmin ? (
            <PageTopBarPrimaryButton render={<Link to="/admin/cards/create" />}>
              <PlusIcon className="mr-1 size-4" />
              New card
            </PageTopBarPrimaryButton>
          ) : undefined
        }
      />
      <div className="flex items-center justify-between gap-4">
        <TabsList variant="line">
          <TabsTrigger value="cards">Cards ({cards.length})</TabsTrigger>
          <TabsTrigger value="candidates">Candidates ({candidates.length})</TabsTrigger>
          {isAdmin && <TabsTrigger value="unmatched">Unmatched ({unmatchedCount})</TabsTrigger>}
        </TabsList>
        <Select items={setOptions} value={setSlug ?? ALL_SETS} onValueChange={changeSet}>
          <SelectTrigger size="sm" aria-label="Filter by set" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {setOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TabsContent value="cards" className="flex min-h-0 flex-1 flex-col">
        <AcceptedCardsTable
          data={cards}
          coverageBySlug={coverageBySlug}
          assignBucketsBySlug={assignBucketsBySlug}
          isAdmin={isAdmin}
        />
      </TabsContent>
      <TabsContent value="candidates" className="flex min-h-0 flex-1 flex-col">
        <CandidateCardsTable data={candidates} isAdmin={isAdmin} />
      </TabsContent>
      {isAdmin && (
        <TabsContent value="unmatched" className="flex min-h-0 flex-1 flex-col">
          <UnmatchedProductsPanel />
        </TabsContent>
      )}
    </Tabs>
  );
}
