import { createLazyFileRoute, Link } from "@tanstack/react-router";

import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { useProductsList } from "@/hooks/use-products";

export const Route = createLazyFileRoute("/_app/products")({
  component: ProductsIndexPage,
});

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
      <div className="px-safe mx-auto w-full max-w-4xl pb-6">
        <PageDescription className="pb-4">
          Full card lists for the official Riftbound products catalogued so far.
        </PageDescription>
        {products.length === 0 ? (
          <p className="text-muted-foreground text-sm">No products yet.</p>
        ) : (
          <ul className="grid gap-3">
            {products.map((product) => (
              <li key={product.id}>
                <Link
                  to="/products/$slug"
                  params={{ slug: product.slug }}
                  className="border-border/60 bg-card/50 hover:bg-accent/40 block rounded-lg border p-4 transition-colors"
                >
                  <span className="block font-medium">{product.name}</span>
                  <span className="text-muted-foreground mt-1 block text-sm">
                    {product.cardTotal} cards · {product.printingCount} unique
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
