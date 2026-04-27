import { getRouteApi } from "@tanstack/react-router";

const cardsRoute = getRouteApi("/_app/cards");

/**
 * SSR-only preview of the first row of catalog cards. Rendered inside the
 * route's `<Suspense fallback>` so the served HTML carries real `<img>` tags
 * for the LCP candidate. Reads slim card data from the route loader; on
 * client-side navigation the loader returns an empty array and this component
 * renders nothing (the live grid is already mounting).
 *
 * Column counts mirror `useResponsiveColumns` so the layout barely shifts
 * when `<CardBrowser>` swaps in. The intrinsic 400×558 ratio matches the
 * standard Riftbound card and prevents CLS while the browser picks the right
 * `srcset` entry for the rendered column width.
 * @returns The SSR preview row, or null when there's no loader data.
 */
export function FirstRowPreview() {
  const { firstRow } = cardsRoute.useLoaderData();
  if (firstRow.length === 0) {
    return null;
  }
  return (
    <div className="min-w-0 flex-1">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {firstRow.map((card, i) => (
          <img
            key={card.printingId}
            src={card.thumbnail}
            srcSet={`${card.thumbnail} 400w, ${card.full} 800w`}
            sizes="(min-width: 1536px) 14vw, (min-width: 1280px) 17vw, (min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
            width={400}
            height={558}
            alt={card.cardName}
            fetchPriority={i === 0 ? "high" : undefined}
            className="aspect-card w-full rounded-lg object-cover"
          />
        ))}
      </div>
    </div>
  );
}
