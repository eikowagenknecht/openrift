import type { AdminMarketplaceName } from "@openrift/shared";

import type { AssignableCard, UnifiedMappingGroup } from "./price-mappings-types";
import { SectionHeading } from "./section-heading";
import { CM_CONFIG, CT_CONFIG, TCG_CONFIG } from "./source-configs";
import { StagedProductCard } from "./staged-product-card";

export function MarketplaceProductColumn({
  marketplace,
  group,
  allCards,
  onIgnoreVariant,
  onIgnoreProduct,
  isIgnoring,
  onUnassign,
  isUnassigning,
  onAssignToCard,
  isAssigning,
}: {
  marketplace: AdminMarketplaceName;
  group: UnifiedMappingGroup;
  allCards: AssignableCard[];
  onIgnoreVariant: (externalId: number, finish: string, language: string | null) => void;
  onIgnoreProduct: (externalId: number) => void;
  isIgnoring: boolean;
  onUnassign: (externalId: number, finish: string, language: string | null) => void;
  isUnassigning: boolean;
  onAssignToCard: (
    externalId: number,
    finish: string,
    language: string | null,
    cardId: string,
  ) => void;
  isAssigning: boolean;
}) {
  const config =
    marketplace === "tcgplayer" ? TCG_CONFIG : marketplace === "cardmarket" ? CM_CONFIG : CT_CONFIG;
  const mkData = group[marketplace];
  const allProducts = [...mkData.stagedProducts, ...mkData.assignedProducts].toSorted(
    (a, b) => a.productName.localeCompare(b.productName) || b.finish.localeCompare(a.finish),
  );

  return (
    <div className="w-full shrink-0 sm:w-64">
      <SectionHeading>{config.shortName} Products</SectionHeading>
      <div className="flex flex-col gap-2">
        {allProducts.map((sp) => {
          const isAssigned = mkData.assignedProducts.some(
            (ap) => ap.externalId === sp.externalId && ap.finish === sp.finish,
          );
          return (
            <StagedProductCard
              key={`${sp.externalId}::${sp.finish}`}
              config={config}
              product={sp}
              isAssigned={isAssigned}
              // Sidebar cards: this product is about to map (or already did),
              // so per-SKU ignores are the common case ("this card doesn't
              // come in foil, deny that variant"). Level-2 stays available
              // via the dropdown.
              primaryIgnoreLevel="variant"
              onIgnoreVariant={
                isAssigned
                  ? undefined
                  : () => onIgnoreVariant(sp.externalId, sp.finish, sp.language)
              }
              onIgnoreProduct={isAssigned ? undefined : () => onIgnoreProduct(sp.externalId)}
              isIgnoring={isIgnoring}
              onUnassign={
                sp.isOverride ? () => onUnassign(sp.externalId, sp.finish, sp.language) : undefined
              }
              isUnassigning={isUnassigning}
              allCards={sp.isOverride ? undefined : isAssigned ? undefined : allCards}
              onAssignToCard={
                sp.isOverride || isAssigned
                  ? undefined
                  : (cardId) => onAssignToCard(sp.externalId, sp.finish, sp.language, cardId)
              }
              isAssigning={isAssigning}
              assignLabel="Reassign"
            />
          );
        })}
        {allProducts.length === 0 && <p className="text-muted-foreground">No products</p>}
      </div>
    </div>
  );
}
