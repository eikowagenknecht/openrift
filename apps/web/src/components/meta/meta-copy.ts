/**
 * Meta-archive page copy, kept in its own module because route files import it.
 *
 * A route's non-lazy `*.tsx` runs on every page load (the router builds the
 * whole tree up front), so a value import from a page component drags that
 * component's entire graph into the initial bundle. `meta_.decks.tsx` importing
 * this string from `meta-deck-browser-page` pulled `MetaDeckCard` → `DeckTile` →
 * `DeckActionsMenu` → the PDF and html2canvas export dialogs into every visit,
 * /cards included: ~25 extra chunks and ~650 KB of JS nobody on that page can
 * use. Strings the `head` needs live here; the pages import them from here too.
 */

/** The /meta page's description, for search results and social cards. */
export const META_DESCRIPTION =
  "Decklists from Riftbound tournaments, with the cards and legends they were built on. Every list links into the catalog and shows what you already own.";

/** Shared by the /meta/decks description, the JSON-LD, and the visible page intro. */
export const META_DECKS_DESCRIPTION =
  "Every decklist in the Riftbound meta archive, filterable by format, event, legend, and finish.";

/** Shared by the /meta/events description, the JSON-LD, and the visible page intro. */
export const META_EVENTS_DESCRIPTION =
  "Every Riftbound tournament in the archive, from store nights to premier qualifiers. Search by name, venue or organizer, and see who won each one.";
