/**
 * Route `*.tsx` files import these strings for their head metadata on every
 * page load. Keep this module free of page-component imports, or their
 * whole graph (deck tile, export dialogs) loads on every visit.
 */

export const META_DESCRIPTION =
  "Riftbound tournament results: who won each event, the full standings, and the decklists they played. Every list links into the catalog and shows what you already own.";

export const META_DECKS_DESCRIPTION =
  "Every decklist in the Riftbound meta archive, grouped by event with the newest first, with what each list is worth and how much of it you already own.";

export const META_EVENTS_DESCRIPTION =
  "Every Riftbound tournament in the archive, from store nights to premier qualifiers. Search by name, venue or organizer, and see who won each one.";

export const META_LEGENDS_DESCRIPTION =
  "Every legend the archive holds a tournament result for, by name. Open one to see its finishes, the players behind them, and the lists they registered.";
