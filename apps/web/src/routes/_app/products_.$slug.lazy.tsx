import { createLazyFileRoute } from "@tanstack/react-router";

import { ProductDetailView } from "@/features/cards/components/product-detail-view";
import { useProductDetail } from "@/features/cards/hooks/use-products";

export const Route = createLazyFileRoute("/_app/products_/$slug")({
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const { data } = useProductDetail(slug);
  return <ProductDetailView data={data} search={search} />;
}
