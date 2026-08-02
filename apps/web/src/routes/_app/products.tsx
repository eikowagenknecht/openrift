import { imageUrl } from "@openrift/shared";
import type { ProductsListResponse } from "@openrift/shared/contracts/products";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { productsListQueryOptions } from "@/hooks/use-products";
import { collectionPageJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const PRODUCTS_TITLE = "Riftbound Products";

/** Shared by the meta description, the JSON-LD, and the visible page intro. */
export const PRODUCTS_DESCRIPTION =
  "Full card lists for every official Riftbound product. See exactly which cards are inside each starter set, champion deck, and pre-rift kit.";

export const Route = createFileRoute("/_app/products")({
  head: ({ loaderData }) => {
    const siteUrl = getSiteUrl();
    const head = seoHead({
      siteUrl,
      title: PRODUCTS_TITLE,
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
          name: PRODUCTS_TITLE,
          description: PRODUCTS_DESCRIPTION,
          path: "/products",
          items: data.products.map((product) => ({
            url: `/products/${product.slug}`,
            name: product.name,
            image: product.coverCards[0]
              ? imageUrl(product.coverCards[0].imageId, "full")
              : undefined,
          })),
        }),
      ],
    };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(productsListQueryOptions),
  errorComponent: RouteErrorFallback,
});
