import { AcceptedCardsTable } from "@/components/admin/accepted-cards-table";
import { CandidateCardsTable } from "@/components/admin/candidate-cards-table";
import { UnmatchedProductsPanel } from "@/components/admin/unmatched-products-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminCardList } from "@/hooks/use-admin-card-queries";
import { useUnifiedMappings } from "@/hooks/use-unified-mappings";

export function AdminCardListPage() {
  const { data } = useAdminCardList();
  const { data: unified } = useUnifiedMappings(false);

  const cards = data.filter((r) => r.cardSlug);
  const candidates = data.filter((r) => !r.cardSlug);
  const unmatchedCount =
    unified.unmatchedProducts.tcgplayer.length +
    unified.unmatchedProducts.cardmarket.length +
    unified.unmatchedProducts.cardtrader.length;

  return (
    <Tabs defaultValue="cards" className="flex min-h-0 flex-1 flex-col">
      <TabsList variant="line">
        <TabsTrigger value="cards">Cards ({cards.length})</TabsTrigger>
        <TabsTrigger value="candidates">Candidates ({candidates.length})</TabsTrigger>
        <TabsTrigger value="unmatched">Unmatched ({unmatchedCount})</TabsTrigger>
      </TabsList>
      <TabsContent value="cards" className="flex min-h-0 flex-1 flex-col">
        <AcceptedCardsTable data={cards} />
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
