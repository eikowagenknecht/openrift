import { useNavigate } from "@tanstack/react-router";

import { MetaCandidatesPage } from "@/components/admin/meta-candidates-page";
import { MetaEventsPage } from "@/components/admin/meta-events-page";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminMetaCandidates } from "@/hooks/use-admin-meta-candidates";
import { Route } from "@/routes/_app/_authenticated/admin/meta";

/**
 * The Meta Archive's admin surface (ADR-014): the live archive on one tab, the
 * candidate review queue on the other. Each tab renders its own page top bar,
 * so the bar's actions always belong to what is on screen — BaseUI unmounts the
 * hidden panel, so only one bar is ever portalled into the layout slot.
 *
 * @returns The tabbed Meta Archive admin page.
 */
export function MetaAdminPage() {
  const { data } = useAdminMetaCandidates();
  const tab = Route.useSearch({ select: (search) => search.tab ?? "events" });
  const navigate = useNavigate({ from: Route.fullPath });

  const pendingCount = data.candidates.filter((row) => row.checkedAt === null).length;

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        void navigate({
          search: (prev) => ({
            ...prev,
            tab: value === "events" ? undefined : ("candidates" as const),
          }),
          replace: true,
        });
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList variant="line">
        <TabsTrigger value="events">Events</TabsTrigger>
        <TabsTrigger value="candidates">
          Candidates
          {pendingCount > 0 && <Badge variant="count">{pendingCount}</Badge>}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="events" className="flex min-h-0 flex-1 flex-col">
        <MetaEventsPage />
      </TabsContent>
      <TabsContent value="candidates" className="flex min-h-0 flex-1 flex-col">
        <MetaCandidatesPage />
      </TabsContent>
    </Tabs>
  );
}
