import { formatDayTime } from "@openrift/shared/format-date";
import { marketplaceLabel } from "@openrift/shared/marketplace";
import type { IgnoredProductResponse } from "@openrift/shared/types/api/admin";
import { Undo2Icon } from "lucide-react";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
import { PageDescription } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIgnoredProducts, useUnignoreProduct } from "@/hooks/use-ignored-products";

import { CM_CONFIG, TCG_CONFIG } from "./source-configs";

function LevelCell({ row }: AdminCellSlotProps<IgnoredProductResponse>) {
  if (!row) {
    return null;
  }
  return (
    <Badge variant={row.level === "product" ? "default" : "outline"}>
      {row.level === "product" ? "Product" : "Variant"}
    </Badge>
  );
}

function MarketplaceCell({ row }: AdminCellSlotProps<IgnoredProductResponse>) {
  if (!row) {
    return null;
  }
  return <Badge variant="outline">{marketplaceLabel(row.marketplace)}</Badge>;
}

function ProductNameCell({ row }: AdminCellSlotProps<IgnoredProductResponse>) {
  if (!row) {
    return null;
  }
  return (
    <span className="max-w-xs truncate" title={row.productName}>
      {row.productName}
    </span>
  );
}

function ExternalIdCell({ row }: AdminCellSlotProps<IgnoredProductResponse>) {
  if (!row) {
    return null;
  }
  const config = row.marketplace === "tcgplayer" ? TCG_CONFIG : CM_CONFIG;
  return (
    <a
      href={config.productUrl(row.externalId)}
      target="_blank"
      rel="noreferrer"
      className="text-primary hover:text-primary/80 font-mono underline underline-offset-4"
    >
      #{row.externalId}
    </a>
  );
}

function FinishCell({ row }: AdminCellSlotProps<IgnoredProductResponse>) {
  if (!row) {
    return null;
  }
  return row.level === "variant" ? (
    <Badge variant="outline">{row.finish}</Badge>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function LanguageCell({ row }: AdminCellSlotProps<IgnoredProductResponse>) {
  if (!row) {
    return null;
  }
  return row.level === "variant" ? (
    <span className="text-muted-foreground font-mono text-xs">{row.language}</span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function CreatedAtCell({ row }: AdminCellSlotProps<IgnoredProductResponse>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground">{formatDayTime(row.createdAt)}</span>;
}

function UnignoreAction({ row }: AdminCellSlotProps<IgnoredProductResponse>) {
  const unignoreMutation = useUnignoreProduct();
  if (!row) {
    return null;
  }
  return (
    <Button
      variant="ghost"
      onClick={() =>
        unignoreMutation.mutate(
          row.level === "product"
            ? {
                level: "product",
                marketplace: row.marketplace as "tcgplayer" | "cardmarket" | "cardtrader",
                externalId: row.externalId,
              }
            : {
                level: "variant",
                marketplace: row.marketplace as "tcgplayer" | "cardmarket" | "cardtrader",
                externalId: row.externalId,
                finish: row.finish,
                language: row.language,
              },
        )
      }
      disabled={unignoreMutation.isPending}
    >
      <Undo2Icon className="size-3.5" />
      Unignore
    </Button>
  );
}

const columns: AdminColumnDef<IgnoredProductResponse>[] = [
  {
    header: "Level",
    width: "w-24",
    sortValue: (p) => p.level,
    cell: <LevelCell />,
  },
  {
    header: "Marketplace",
    width: "w-28",
    sortValue: (p) => p.marketplace,
    cell: <MarketplaceCell />,
  },
  {
    header: "Product Name",
    sortValue: (p) => p.productName,
    cell: <ProductNameCell />,
  },
  {
    header: "External ID",
    width: "w-24",
    cell: <ExternalIdCell />,
  },
  {
    header: "Finish",
    width: "w-24",
    sortValue: (p) => (p.level === "variant" ? p.finish : ""),
    cell: <FinishCell />,
  },
  {
    header: "Language",
    width: "w-20",
    sortValue: (p) => (p.level === "variant" ? p.language : ""),
    cell: <LanguageCell />,
  },
  {
    header: "Ignored At",
    width: "w-36",
    sortValue: (p) => p.createdAt,
    cell: <CreatedAtCell />,
  },
];

export function IgnoredProductsPage() {
  const { data } = useIgnoredProducts();
  const { products } = data;

  return (
    <AdminTable
      columns={columns}
      data={products}
      getRowKey={(p) =>
        p.level === "product"
          ? `product:${p.marketplace}:${p.externalId}`
          : `variant:${p.marketplace}:${p.externalId}:${p.finish}:${p.language}`
      }
      emptyText="No ignored products."
      defaultSort={{ column: "Ignored At", direction: "desc" }}
      title="Ignored Products"
      toolbar={
        products.length > 0 ? (
          <PageDescription>
            {products.length} ignored entr{products.length === 1 ? "y" : "ies"} across all
            marketplaces
          </PageDescription>
        ) : undefined
      }
      actions={<UnignoreAction />}
    />
  );
}
