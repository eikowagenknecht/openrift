import { Undo2Icon } from "lucide-react";

import { AdminQueryShell } from "@/components/admin/admin-query-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIgnoredProducts, useUnignoreProduct } from "@/hooks/use-ignored-products";

import { CM_CONFIG, TCG_CONFIG } from "./source-configs";

const marketplaceLabels: Record<string, string> = {
  tcgplayer: "TCGplayer",
  cardmarket: "Cardmarket",
};

export function IgnoredProductsPage() {
  const query = useIgnoredProducts();
  const unignoreMutation = useUnignoreProduct();

  return (
    <AdminQueryShell query={query}>
      {({ products }) => (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {products.length === 0
              ? "No ignored products."
              : `${products.length} ignored product${products.length === 1 ? "" : "s"} across all marketplaces`}
          </p>
          {products.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Marketplace</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="w-24">External ID</TableHead>
                    <TableHead className="w-24">Finish</TableHead>
                    <TableHead className="w-36">Ignored At</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const config = p.marketplace === "tcgplayer" ? TCG_CONFIG : CM_CONFIG;
                    return (
                      <TableRow key={`${p.marketplace}:${p.externalId}:${p.finish}`}>
                        <TableCell>
                          <Badge variant="outline">
                            {marketplaceLabels[p.marketplace] ?? p.marketplace}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate" title={p.productName}>
                          {p.productName}
                        </TableCell>
                        <TableCell className="font-mono">
                          <a
                            href={config.productUrl(p.externalId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-4 hover:text-primary/80"
                          >
                            #{p.externalId}
                          </a>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.finish}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.createdAt.slice(0, 16).replace("T", " ")}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                              unignoreMutation.mutate({
                                marketplace: p.marketplace as "tcgplayer" | "cardmarket",
                                externalId: p.externalId,
                                finish: p.finish,
                              })
                            }
                            disabled={unignoreMutation.isPending}
                          >
                            <Undo2Icon className="size-3.5" />
                            Unignore
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </AdminQueryShell>
  );
}
