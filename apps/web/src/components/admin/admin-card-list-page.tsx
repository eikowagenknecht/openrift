import { Link, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { AcceptedCardsTable } from "@/components/admin/accepted-cards-table";
import { CandidateCardsTable } from "@/components/admin/candidate-cards-table";
import { UnmatchedProductsPanel } from "@/components/admin/unmatched-products-panel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminCardList } from "@/hooks/use-admin-card-queries";
import { useUnifiedMappings } from "@/hooks/use-unified-mappings";
import { buildCoverageMapBySlug } from "@/lib/marketplace-coverage";
import { Route } from "@/routes/_app/_authenticated/admin/cards";

export function AdminCardListPage() {
  const { data } = useAdminCardList();
  const { data: unified } = useUnifiedMappings(true);
  const tab = Route.useSearch({ select: (s) => s.tab ?? "cards" });
  const navigate = useNavigate({ from: Route.fullPath });

  const cards = data.filter((r) => r.cardSlug);
  const candidates = data.filter((r) => !r.cardSlug);
  const unmatchedCount =
    unified.unmatchedProducts.tcgplayer.length +
    unified.unmatchedProducts.cardmarket.length +
    unified.unmatchedProducts.cardtrader.length;

  const coverageBySlug = buildCoverageMapBySlug(unified.groups);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        void navigate({
          search: (prev) => ({
            ...prev,
            tab: value === "cards" ? undefined : (value as "candidates" | "unmatched"),
            sort: undefined,
            status: undefined,
          }),
          replace: true,
        });
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex items-center justify-between gap-4">
        <TabsList variant="line">
          <TabsTrigger value="cards">Cards ({cards.length})</TabsTrigger>
          <TabsTrigger value="candidates">Candidates ({candidates.length})</TabsTrigger>
          <TabsTrigger value="unmatched">Unmatched ({unmatchedCount})</TabsTrigger>
        </TabsList>
        <Button variant="outline" size="sm" render={<Link to="/admin/cards/create" />}>
          <PlusIcon className="mr-1 size-4" />
          New card
        </Button>
      </div>
      <TabsContent value="cards" className="flex min-h-0 flex-1 flex-col">
        <AcceptedCardsTable data={cards} coverageBySlug={coverageBySlug} />
      </TabsContent>
      <TabsContent value="candidates" className="flex min-h-0 flex-1 flex-col">
        <CandidateCardsTable data={candidates} />
      </TabsContent>
      <TabsContent value="unmatched" className="flex min-h-0 flex-1 flex-col">
        <UnmatchedProductsPanel />
      </TabsContent>
    </Tabs>
  );
}
