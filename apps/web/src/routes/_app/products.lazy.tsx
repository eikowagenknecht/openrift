import { imageUrl } from "@openrift/shared";
import type { ProductCoverCard, ProductSummary } from "@openrift/shared/contracts";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { CoverBand } from "@/components/cover-band";
import { Heading } from "@/components/heading";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { CardLink } from "@/components/ui/card-link";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { useProductsList } from "@/hooks/use-products";
import { markdownTeaser } from "@/lib/markdown-teaser";

export const Route = createLazyFileRoute("/_app/products")({
  component: ProductsIndexPage,
});

/** Horizontal offset (px) and rotation (deg) per fan slot, indexed by fan size. */
const FAN_LAYOUTS: readonly (readonly { x: number; r: number }[])[] = [
  [],
  [{ x: 0, r: 0 }],
  [
    { x: -30, r: -6 },
    { x: 30, r: 6 },
  ],
  [
    { x: -52, r: -9 },
    { x: 0, r: 0 },
    { x: 52, r: 9 },
  ],
  [
    { x: -69, r: -12 },
    { x: -23, r: -4 },
    { x: 23, r: 4 },
    { x: 69, r: 12 },
  ],
];

const FAN_CARD_POSITION = "aspect-card absolute bottom-[-14px] left-1/2 -ml-[46px] w-[92px]";

function fanSlotStyle(slot: { x: number; r: number }): CSSProperties {
  return {
    transform: `translateX(${slot.x}px) rotate(${slot.r}deg)`,
    transformOrigin: "50% 120%",
  };
}

/**
 * Dashed card outlines in fan formation — the stand-in when there is no art
 * to show (imageless product tiles, the empty state).
 *
 * @returns The absolutely-positioned outline elements (host must be relative).
 */
function FanOutline() {
  return (
    <>
      {FAN_LAYOUTS[3].map((slot, index) => (
        <div
          key={index}
          className={`border-border rounded-md border-2 border-dashed ${FAN_CARD_POSITION}`}
          style={fanSlotStyle(slot)}
        />
      ))}
    </>
  );
}

/**
 * The tile's cover band: up to four of the product's cards fanned like a
 * physical spread, or dashed outlines when no printing has an image yet.
 *
 * @returns The fan band element.
 */
function ProductCoverFan({ coverCards }: { coverCards: ProductCoverCard[] }) {
  const layout = FAN_LAYOUTS[Math.min(coverCards.length, FAN_LAYOUTS.length - 1)];
  return (
    <CoverBand aria-hidden="true" className="h-36">
      {layout.length === 0 ? (
        <FanOutline />
      ) : (
        coverCards
          .slice(0, layout.length)
          .map((cover, index) => (
            <ImgWithFallback
              key={cover.printingId}
              src={imageUrl(cover.imageId, "240w")}
              srcSet={`${imageUrl(cover.imageId, "120w")} 120w, ${imageUrl(cover.imageId, "240w")} 240w`}
              sizes="92px"
              alt=""
              loading="lazy"
              className={`ring-foreground/20 object-cover shadow-md ring-1 ${FAN_CARD_POSITION}`}
              style={{ ...fanSlotStyle(layout[index]), borderRadius: CARD_BORDER_RADIUS }}
              fallback={null}
            />
          ))
      )}
    </CoverBand>
  );
}

/** @returns One product tile: cover fan, name, description teaser, counts. */
function ProductTile({ product }: { product: ProductSummary }) {
  const teaser = markdownTeaser(product.description);
  return (
    <CardLink
      render={<Link to="/products/$slug" params={{ slug: product.slug }} />}
      className="flex-col gap-0 py-0"
    >
      <ProductCoverFan coverCards={product.coverCards} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <Heading className="truncate">{product.name}</Heading>
        {teaser && <p className="text-muted-foreground line-clamp-2 text-sm">{teaser}</p>}
        <p className="text-muted-foreground mt-auto pt-1 text-sm">
          {product.cardTotal} cards · {product.printingCount} unique
        </p>
      </div>
    </CardLink>
  );
}

/** @returns The empty state inviting catalogue contributions. */
function ProductsEmptyState() {
  return (
    <div className="flex flex-col items-center gap-1.5 pt-10 pb-6 text-center">
      <div aria-hidden="true" className="relative h-32 w-64 overflow-hidden">
        <FanOutline />
      </div>
      <Heading className="mt-2">No products catalogued yet</Heading>
      <p className="text-muted-foreground max-w-[44ch] text-sm">
        The catalogue is maintained by one person. Know what’s inside a box we’re missing? Help us
        fill in the gaps.
      </p>
      <Button className="mt-3" render={<Link to="/contribute" />}>
        Contribute a card list
      </Button>
    </div>
  );
}

function ProductsIndexPage() {
  const { data } = useProductsList();
  const { products } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky maxWidth="4xl">
        <PageTopBar>
          <PageTopBarTitle>Products</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className="px-safe mx-auto w-full max-w-4xl pt-3 pb-6">
        <PageDescription className="pb-4">
          Full card lists for the official Riftbound products catalogued so far.
        </PageDescription>
        {products.length === 0 ? (
          <ProductsEmptyState />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {products.map((product) => (
              <li key={product.id}>
                <ProductTile product={product} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
