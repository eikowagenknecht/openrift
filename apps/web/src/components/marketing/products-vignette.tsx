import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CoverBand } from "@/components/cover-band";
import { Card } from "@/components/ui/card";
import { formatProductCounts } from "@/lib/product-counts";

import { Vignette, VignetteHeading } from "./vignette-parts";

const FAN_SLOTS = [
  { key: "left", x: -18, r: -9, domains: ["chaos"], rarity: "rare" },
  { key: "right", x: 18, r: 9, domains: ["body"], rarity: "common" },
  { key: "center", x: 0, r: 0, domains: ["order"], rarity: "epic" },
] as const;

const FAN_CARD_WIDTH = 32;

/**
 * The product tile's cover fan at miniature scale. The real fan carries card
 * art; with no printings to resolve here, each slot falls back to the
 * domain-tinted empty frame CardArtThumb draws for an art-less card.
 */
function MiniFan() {
  return (
    <>
      {FAN_SLOTS.map((slot) => (
        <span
          key={slot.key}
          className="absolute bottom-[-6px] left-1/2"
          style={{
            width: FAN_CARD_WIDTH,
            marginLeft: -FAN_CARD_WIDTH / 2,
            transform: `translateX(${slot.x}px) rotate(${slot.r}deg)`,
            transformOrigin: "50% 120%",
          }}
        >
          <CardArtThumb
            domains={[...slot.domains]}
            rarity={slot.rarity}
            className="ring-foreground/20 w-full shadow-md ring-1"
          />
        </span>
      ))}
    </>
  );
}

interface MiniProduct {
  name: string;
  cardTotal: number;
  printingCount: number;
}

const SPIRITFORGED: MiniProduct[] = [
  { name: "SFD Champion Deck - Fiora", cardTotal: 56, printingCount: 26 },
  { name: "SFD Pre-Rift Kit - Ezreal", cardTotal: 16, printingCount: 16 },
];

const PROVING_GROUNDS: MiniProduct[] = [
  { name: "Origins: Proving Grounds", cardTotal: 224, printingCount: 70 },
];

function ProductRow({ product }: { product: MiniProduct }) {
  return (
    <Card className="flex-row items-center gap-0 py-0">
      <CoverBand aria-hidden="true" className="h-16 w-24 overflow-hidden">
        <MiniFan />
      </CoverBand>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2">
        <span className="truncate font-medium">{product.name}</span>
        <span className="text-muted-foreground truncate">
          {formatProductCounts(product.cardTotal, product.printingCount)}
        </span>
      </div>
    </Card>
  );
}

function ProductGroup({ set, products }: { set: string; products: MiniProduct[] }) {
  return (
    <div className="flex flex-col gap-2">
      <VignetteHeading>{set}</VignetteHeading>
      {products.map((product) => (
        <ProductRow key={product.name} product={product} />
      ))}
    </div>
  );
}

/**
 * The products catalogue: every sealed product grouped under its set, each
 * tile fanning its contents and stating how many cards are inside.
 */
export function ProductsVignette() {
  return (
    <Vignette>
      <ProductGroup set="Spiritforged" products={SPIRITFORGED} />
      <ProductGroup set="Proving Grounds" products={PROVING_GROUNDS} />
    </Vignette>
  );
}
