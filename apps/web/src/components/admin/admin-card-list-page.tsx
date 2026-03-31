import { AcceptedCardsTable } from "@/components/admin/accepted-cards-table";
import { CandidateCardsTable } from "@/components/admin/candidate-cards-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminCardList } from "@/hooks/use-admin-cards";

export function AdminCardListPage() {
  const { data } = useAdminCardList();

  const cards = data.filter((r) => r.cardSlug);
  const candidates = data.filter((r) => !r.cardSlug);

  return (
    <Tabs defaultValue="cards" className="flex min-h-0 flex-1 flex-col">
      <TabsList variant="line">
        <TabsTrigger value="cards">Cards ({cards.length})</TabsTrigger>
        <TabsTrigger value="candidates">Candidates ({candidates.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="cards" className="flex min-h-0 flex-1 flex-col">
        <AcceptedCardsTable data={cards} />
      </TabsContent>
      <TabsContent value="candidates" className="flex min-h-0 flex-1 flex-col">
        <CandidateCardsTable data={candidates} />
      </TabsContent>
    </Tabs>
  );
}
