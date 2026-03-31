import { AcceptedCardsTable } from "@/components/admin/accepted-cards-table";
import { CandidateCardsTable } from "@/components/admin/candidate-cards-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAllCards, useAdminCardList } from "@/hooks/use-admin-cards";

export function AdminCardListPage() {
  const { data: allCards } = useAllCards();
  const { data: candidates } = useAdminCardList();

  const reviewCount = candidates.filter(
    (r) => r.uncheckedCardCount + r.uncheckedPrintingCount > 0,
  ).length;

  return (
    <Tabs defaultValue="cards" className="flex min-h-0 flex-1 flex-col">
      <TabsList variant="line">
        <TabsTrigger value="cards">Cards ({allCards.length})</TabsTrigger>
        <TabsTrigger value="candidates">
          Candidates ({candidates.length})
          {reviewCount > 0 && (
            <span className="bg-destructive text-destructive-foreground ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium">
              {reviewCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="cards" className="flex min-h-0 flex-1 flex-col">
        <AcceptedCardsTable />
      </TabsContent>
      <TabsContent value="candidates" className="flex min-h-0 flex-1 flex-col">
        <CandidateCardsTable />
      </TabsContent>
    </Tabs>
  );
}
