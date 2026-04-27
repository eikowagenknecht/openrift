import { getRouteApi } from "@tanstack/react-router";

const cardsRoute = getRouteApi("/_app/cards");

/**
 * SSR-only preview of the first row of catalog cards. Rendered inside the
 * route's `<Suspense fallback>` so the served HTML carries real `<img>` tags
 * for the LCP candidate. Reads slim card data from the route loader; on
 * client-side navigation the loader returns an empty array and this component
 * renders nothing (the live grid is already mounting).
 *
 * The wrapper mirrors `<CardViewer>`'s layout — sticky toolbar bar above the
 * card grid, set-group header before the first row — so the swap to the live
 * grid on hydration doesn't shift the cards vertically. Column counts mirror
 * `useResponsiveColumns`. Intrinsic 400×558 ratio matches the standard
 * Riftbound card and prevents CLS while the browser picks the right `srcset`
 * entry for the rendered column width.
 * @returns The SSR preview, or null when there's no loader data.
 */
export function FirstRowPreview() {
  const { firstRow } = cardsRoute.useLoaderData();
  if (firstRow.length === 0) {
    return null;
  }
  return (
    <div className="@container flex flex-1 flex-col">
      {/* Toolbar slot — height/padding mirror CardViewer's sticky toolbar wrapper
          + the search-bar row inside CardBrowser, so the live toolbar lands
          here after hydration without shifting the grid down. */}
      <div className="-mx-3 px-3 pt-3" aria-hidden="true">
        <div className="bg-input mb-1.5 h-9 w-full rounded-md sm:mb-3" />
      </div>
      <div className="min-w-0 flex-1">
        {/* Set group header placeholder — same pt-4/pb-2 + content height as
            <HeaderRow> in card-grid. Two faint horizontal lines flanking a
            short stub stand in for the set name. */}
        <div className="flex items-center gap-3 pt-4 pb-2" aria-hidden="true">
          <div className="bg-border h-px flex-1" />
          <div className="bg-muted/40 h-5 w-24 rounded" />
          <div className="bg-border h-px flex-1" />
        </div>
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
    </div>
  );
}
