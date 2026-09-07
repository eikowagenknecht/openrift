import { formatDayTime } from "@openrift/shared/format-date";
import { Undo2Icon } from "lucide-react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
import { Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useIgnoredCandidates,
  useUnignoreCandidateCard,
  useUnignoreCandidatePrinting,
} from "@/hooks/use-ignored-candidates";

interface IgnoredCard {
  id: string;
  provider: string;
  externalId: string;
  createdAt: string;
}

interface IgnoredPrinting {
  id: string;
  provider: string;
  externalId: string;
  finish: string | null;
  createdAt: string;
}

function ProviderBadgeCell({ row }: AdminCellSlotProps<IgnoredCard | IgnoredPrinting>) {
  if (!row) {
    return null;
  }
  return <Badge variant="outline">{row.provider}</Badge>;
}

function ExternalIdCell({ row }: AdminCellSlotProps<IgnoredCard | IgnoredPrinting>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono">{row.externalId}</span>;
}

function CreatedAtCell({ row }: AdminCellSlotProps<IgnoredCard | IgnoredPrinting>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground">{formatDayTime(row.createdAt)}</span>;
}

function PrintingFinishCell({ row }: AdminCellSlotProps<IgnoredPrinting>) {
  if (!row) {
    return null;
  }
  return row.finish ? (
    <Badge variant="outline">{row.finish}</Badge>
  ) : (
    <Badge variant="outline">all</Badge>
  );
}

const cardColumns: AdminColumnDef<IgnoredCard>[] = [
  {
    header: "Provider",
    width: "w-36",
    sortValue: (r) => r.provider,
    cell: <ProviderBadgeCell />,
  },
  {
    header: "External ID",
    sortValue: (r) => r.externalId,
    cell: <ExternalIdCell />,
  },
  {
    header: "Ignored At",
    width: "w-36",
    sortValue: (r) => r.createdAt,
    cell: <CreatedAtCell />,
  },
];

const printingColumns: AdminColumnDef<IgnoredPrinting>[] = [
  {
    header: "Provider",
    width: "w-36",
    sortValue: (r) => r.provider,
    cell: <ProviderBadgeCell />,
  },
  {
    header: "External ID",
    sortValue: (r) => r.externalId,
    cell: <ExternalIdCell />,
  },
  {
    header: "Finish",
    width: "w-24",
    sortValue: (r) => r.finish,
    cell: <PrintingFinishCell />,
  },
  {
    header: "Ignored At",
    width: "w-36",
    sortValue: (r) => r.createdAt,
    cell: <CreatedAtCell />,
  },
];

function CardUnignoreAction({ row }: AdminCellSlotProps<IgnoredCard>) {
  const unignoreCard = useUnignoreCandidateCard();
  if (!row) {
    return null;
  }
  return (
    <Button
      variant="ghost"
      onClick={() => unignoreCard.mutate({ provider: row.provider, externalId: row.externalId })}
      disabled={unignoreCard.isPending}
    >
      <Undo2Icon className="size-3.5" />
      Unignore
    </Button>
  );
}

function PrintingUnignoreAction({ row }: AdminCellSlotProps<IgnoredPrinting>) {
  const unignorePrinting = useUnignoreCandidatePrinting();
  if (!row) {
    return null;
  }
  return (
    <Button
      variant="ghost"
      onClick={() =>
        unignorePrinting.mutate({
          provider: row.provider,
          externalId: row.externalId,
          finish: row.finish ?? null,
        })
      }
      disabled={unignorePrinting.isPending}
    >
      <Undo2Icon className="size-3.5" />
      Unignore
    </Button>
  );
}

export function IgnoredCandidatesPage() {
  const { data } = useIgnoredCandidates();
  const { cards, printings } = data;

  return (
    <div className="space-y-8">
      <AdminPageTopBar title="Ignored Sources" />
      <section className="space-y-3">
        <Heading level={2}>Ignored Candidate Cards</Heading>
        <AdminTable
          columns={cardColumns}
          data={cards}
          getRowKey={(r) => r.id}
          emptyText="No ignored candidate cards."
          defaultSort={{ column: "Ignored At", direction: "desc" }}
          actions={<CardUnignoreAction />}
        />
      </section>

      <section className="space-y-3">
        <Heading level={2}>Ignored Candidate Printings</Heading>
        <AdminTable
          columns={printingColumns}
          data={printings}
          getRowKey={(r) => r.id}
          emptyText="No ignored candidate printings."
          defaultSort={{ column: "Ignored At", direction: "desc" }}
          actions={<PrintingUnignoreAction />}
        />
      </section>
    </div>
  );
}
