import type {
  ProductCoverCard,
  ProductSet,
  ProductSummary,
} from "@openrift/shared/contracts/products";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { CardFan, CardFanOutline } from "@/components/cards/card-fan";
import { CoverBand } from "@/components/cover-band";
import { Heading } from "@/components/heading";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { ProductAddDialog } from "@/components/products/product-add-dialog";
import { Button } from "@/components/ui/button";
import { CardLink } from "@/components/ui/card-link";
import { useProductsList } from "@/hooks/use-products";
import { useSession } from "@/lib/auth-session";
import { groupProductsBySet } from "@/lib/group-products-by-set";
import { markdownTeaser } from "@/lib/markdown-teaser";
import { formatProductCounts } from "@/lib/product-counts";
import { cn, PAGE_WIDTH } from "@/lib/utils";
import { PRODUCTS_DESCRIPTION } from "@/routes/_app/products";

export const Route = createLazyFileRoute("/_app/products")({
  component: ProductsIndexPage,
});

/**
 * The tile's cover band: up to four of the product's cards fanned like a
 * physical spread, or dashed outlines when no printing has an image yet.
 *
 * @returns The fan band element.
 */
function ProductCoverFan({
  coverCards,
  priority,
}: {
  coverCards: ProductCoverCard[];
  /** Loads this fan eagerly — set on the first row, which carries the LCP. */
  priority?: boolean;
}) {
  // overflow-hidden crops the fan's bottom bleed at the band edge, so the
  // rotated card corners never paint over the name below.
  return (
    <CoverBand aria-hidden="true" className="h-36 overflow-hidden">
      {coverCards.length === 0 ? (
        <CardFanOutline />
      ) : (
        <CardFan
          covers={coverCards.map((cover) => ({ key: cover.printingId, imageId: cover.imageId }))}
          priority={priority}
        />
      )}
    </CoverBand>
  );
}

/** @returns One product tile: cover fan, name, description teaser, counts. */
function ProductTile({
  product,
  titleAs,
  priority,
}: {
  product: ProductSummary;
  /**
   * Heading tag for the product name. Products nest under a set heading when
   * the page groups by set, so they are h3 there and h2 on the flat layout.
   * The visual size stays level 2 either way.
   */
  titleAs: "h2" | "h3";
  priority?: boolean;
}) {
  const teaser = markdownTeaser(product.description);
  return (
    <CardLink
      render={<Link to="/products/$slug" params={{ slug: product.slug }} />}
      className="flex-col gap-0 py-0"
    >
      <ProductCoverFan coverCards={product.coverCards} priority={priority} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <Heading as={titleAs} className="truncate">
          {product.name}
        </Heading>
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
        Know what’s inside a box we’re missing? Help us fill in the gaps.
      </p>
      <Button className="mt-3" render={<Link to="/contribute" />}>
        Contribute a card list
      </Button>
    </div>
  );
}

/** @returns A section heading: the set name linking to the set page, or "Other products". */
function ProductGroupHeading({ set }: { set: ProductSet | null }) {
  if (!set) {
    return <Heading className="mb-4">Other products</Heading>;
  }
  return (
    <Heading className="mb-4">
      <Link to="/sets/$setSlug" params={{ setSlug: set.slug }} className="hover:underline">
        {set.name}
      </Link>
    </Heading>
  );
}

/** Tiles in the first grid row (sm:grid-cols-2), which load their art eagerly. */
const EAGER_TILE_COUNT = 2;

function ProductGrid({
  products,
  onAdd,
  titleAs,
  eager,
}: {
  products: ProductSummary[];
  /** Renders a quick-add overlay per tile when set (viewer is signed in). */
  onAdd?: (product: ProductSummary) => void;
  /** Heading tag for the tile names — see {@link ProductTile}. */
  titleAs: "h2" | "h3";
  /** Whether this is the first group on the page, so its first row is above the fold. */
  eager?: boolean;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {products.map((product, index) => (
        // relative hosts the quick-add overlay as a sibling of the tile
        // link, so the button never nests inside the anchor.
        <li key={product.id} className="relative">
          <ProductTile
            product={product}
            titleAs={titleAs}
            priority={eager && index < EAGER_TILE_COUNT}
          />
          {onAdd && (
            <Button
              variant="secondary"
              size="icon-sm"
              className="absolute top-2 right-2 shadow-sm"
              aria-label={`Add ${product.name} to a collection`}
              onClick={() => onAdd(product)}
            >
              <PlusIcon />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function ProductsIndexPage() {
  const { data } = useProductsList();
  const { products } = data;
  const groups = groupProductsBySet(products);
  // With no sets assigned anywhere there is only the null group — render it
  // as a flat grid instead of a lone "Other products" section.
  const showHeadings = groups.some((group) => group.set !== null);
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  // The dialog keeps the last-picked product while closing so the exit
  // animation doesn't run on an empty shell.
  const [addProduct, setAddProduct] = useState<ProductSummary | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const handleAdd = isLoggedIn
    ? (product: ProductSummary) => {
        setAddProduct(product);
        setAddOpen(true);
      }
    : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>Products</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "px-safe pt-3 pb-6")}>
        <PageDescription className="pb-4">{PRODUCTS_DESCRIPTION}</PageDescription>
        {products.length === 0 ? (
          <ProductsEmptyState />
        ) : (
          groups.map((group, index) => (
            <section key={group.key} className={index > 0 ? "mt-8" : undefined}>
              {showHeadings && <ProductGroupHeading set={group.set} />}
              <ProductGrid
                products={group.products}
                onAdd={handleAdd}
                titleAs={showHeadings ? "h3" : "h2"}
                eager={index === 0}
              />
            </section>
          ))
        )}
      </div>
      {addProduct && (
        <ProductAddDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          productSlug={addProduct.slug}
          productName={addProduct.name}
        />
      )}
    </div>
  );
}
