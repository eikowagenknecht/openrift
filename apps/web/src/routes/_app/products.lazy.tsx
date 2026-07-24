import type { ProductCoverCard, ProductSummary } from "@openrift/shared/contracts";
import { Link, createLazyFileRoute } from "@tanstack/react-router";

import { CardFan, CardFanOutline } from "@/components/cards/card-fan";
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
import { useProductsList } from "@/hooks/use-products";
import { markdownTeaser } from "@/lib/markdown-teaser";
import { formatProductCounts } from "@/lib/product-counts";

export const Route = createLazyFileRoute("/_app/products")({
  component: ProductsIndexPage,
});

/**
 * The tile's cover band: up to four of the product's cards fanned like a
 * physical spread, or dashed outlines when no printing has an image yet.
 *
 * @returns The fan band element.
 */
function ProductCoverFan({ coverCards }: { coverCards: ProductCoverCard[] }) {
  // overflow-hidden crops the fan's bottom bleed at the band edge, so the
  // rotated card corners never paint over the name below.
  return (
    <CoverBand aria-hidden="true" className="h-36 overflow-hidden">
      {coverCards.length === 0 ? (
        <CardFanOutline />
      ) : (
        <CardFan
          covers={coverCards.map((cover) => ({ key: cover.printingId, imageId: cover.imageId }))}
        />
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
          {formatProductCounts(product.cardTotal, product.printingCount)}
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
        <CardFanOutline />
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
