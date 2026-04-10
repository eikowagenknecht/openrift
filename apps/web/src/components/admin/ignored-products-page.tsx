import type { IgnoredProductResponse } from "@openrift/shared";
import { Undo2Icon } from "lucide-react";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIgnoredProducts, useUnignoreProduct } from "@/hooks/use-ignored-products";

import { CM_CONFIG, TCG_CONFIG } from "./source-configs";

const marketplaceLabels: Record<string, string> = {
  tcgplayer: "TCGplayer",
  cardmarket: "Cardmarket",
  cardtrader: "CardTrader",
};

export function IgnoredProductsPage() {
  const { data } = useIgnoredProducts();
  const unignoreMutation = useUnignoreProduct();
  const { products } = data;

  const columns: AdminColumnDef<IgnoredProductResponse>[] = [
    {
      header: "Level",
      width: "w-24",
      sortValue: (p) => p.level,
      cell: (p) => (
        <Badge variant={p.level === "product" ? "default" : "outline"}>
          {p.level === "product" ? "Product" : "Variant"}
        </Badge>
      ),
    },
    {
      header: "Marketplace",
      width: "w-28",
      sortValue: (p) => p.marketplace,
      cell: (p) => (
        <Badge variant="outline">{marketplaceLabels[p.marketplace] ?? p.marketplace}</Badge>
      ),
    },
    {
      header: "Product Name",
      sortValue: (p) => p.productName,
      cell: (p) => (
        <span className="max-w-xs truncate" title={p.productName}>
          {p.productName}
        </span>
      ),
    },
    {
      header: "External ID",
      width: "w-24",
      cell: (p) => {
        const config = p.marketplace === "tcgplayer" ? TCG_CONFIG : CM_CONFIG;
        return (
          <a
            href={config.productUrl(p.externalId)}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:text-primary/80 font-mono underline underline-offset-4"
          >
            #{p.externalId}
          </a>
        );
      },
    },
    {
      header: "Finish",
      width: "w-24",
      sortValue: (p) => (p.level === "variant" ? p.finish : ""),
      cell: (p) =>
        p.level === "variant" ? (
          <Badge variant="outline">{p.finish}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Language",
      width: "w-20",
      sortValue: (p) => (p.level === "variant" ? p.language : ""),
      cell: (p) =>
        p.level === "variant" ? (
          <span className="text-muted-foreground font-mono text-xs">{p.language}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Ignored At",
      width: "w-36",
      sortValue: (p) => p.createdAt,
      cell: (p) => (
        <span className="text-muted-foreground">{p.createdAt.slice(0, 16).replace("T", " ")}</span>
      ),
    },
  ];

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
      toolbar={
        products.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            {products.length} ignored entr{products.length === 1 ? "y" : "ies"} across all
            marketplaces
          </p>
        ) : undefined
      }
      actions={(p) => (
        <Button
          variant="ghost"
          onClick={() =>
            unignoreMutation.mutate(
              p.level === "product"
                ? {
                    level: "product",
                    marketplace: p.marketplace as "tcgplayer" | "cardmarket" | "cardtrader",
                    externalId: p.externalId,
                  }
                : {
                    level: "variant",
                    marketplace: p.marketplace as "tcgplayer" | "cardmarket" | "cardtrader",
                    externalId: p.externalId,
                    finish: p.finish,
                    language: p.language,
                  },
            )
          }
          disabled={unignoreMutation.isPending}
        >
          <Undo2Icon className="size-3.5" />
          Unignore
        </Button>
      )}
    />
  );
}
