import type { ProductsListResponse } from "@openrift/shared/contracts";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { productsListQueryOptions } from "@/hooks/use-products";
import { collectionPageJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const PRODUCTS_DESCRIPTION = "Full card lists for official Riftbound products.";

export const Route = createFileRoute("/_app/products")({
  head: ({ loaderData }) => {
    const siteUrl = getSiteUrl();
    const head = seoHead({
      siteUrl,
      title: "Products",
      description: PRODUCTS_DESCRIPTION,
      path: "/products",
    });
    const data = loaderData as ProductsListResponse | undefined;
    if (!data) {
      return head;
    }
    return {
      ...head,
      scripts: [
        collectionPageJsonLd({
          siteUrl,
          name: "Products",
          description: PRODUCTS_DESCRIPTION,
          path: "/products",
          items: data.products.map((product) => ({
            url: `/products/${product.slug}`,
            name: product.name,
          })),
        }),
      ],
    };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(productsListQueryOptions),
  errorComponent: RouteErrorFallback,
});
