import { Link, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { AcceptedCardsTable } from "@/components/admin/accepted-cards-table";
import { CandidateCardsTable } from "@/components/admin/candidate-cards-table";
import { UnmatchedProductsPanel } from "@/components/admin/unmatched-products-panel";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminCardList, useAllCards } from "@/hooks/use-admin-card-queries";
import { useSets } from "@/hooks/use-sets";
import { useUnifiedMappings } from "@/hooks/use-unified-mappings";
import { filterCardsBySet } from "@/lib/admin-cards-search";
import { buildCoverageMapBySlug } from "@/lib/marketplace-coverage";
import { Route } from "@/routes/_app/_authenticated/admin/cards";

const ALL_SETS = "__all__";

export function AdminCardListPage() {
  const { data } = useAdminCardList();
  const { data: unified } = useUnifiedMappings();
  const { data: allCards } = useAllCards();
  const { data: setsData } = useSets();
  const { tab, setSlug } = Route.useSearch({
    select: (s) => ({ tab: s.tab ?? "cards", setSlug: s.set }),
  });
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

  // Cards can span multiple sets (reprints); a card passes the filter if any
  // of its accepted printings belong to `setSlug`. Candidate rows don't carry
  // setSlugs yet, so the filter only narrows the Cards tab.
  const setSlugsByCardSlug = new Map(allCards.map((c) => [c.slug, c.setSlugs]));
  const cards = filterCardsBySet(
    data.filter((r) => r.cardSlug),
    setSlug,
    setSlugsByCardSlug,
  );
  const candidates = data.filter((r) => !r.cardSlug);
  const unmatchedCount =
    unified.unmatchedProducts.tcgplayer.length +
    unified.unmatchedProducts.cardmarket.length +
    unified.unmatchedProducts.cardtrader.length;

  const coverageBySlug = buildCoverageMapBySlug(unified.groups);

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
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm" render={<Link to="/admin/cards/create" />}>
            <PlusIcon className="mr-1 size-4" />
            New card
          </Button>
        </div>
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
