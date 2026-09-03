import * as React from "react";

import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// The two list shapes that carry the Card edge without being a `Card`. Both
// existed as hand-copied token strings before this file — six spellings of the
// panel and two of the row — which is exactly the drift `design-language.md`
// warns about: the edge tokens (`bg-card`, `rounded-lg`, `ring-1
// ring-border`) live in `Card`, and a copy skips any change to them.
//
// They are alternatives, not a pair — a `CardRow` never goes inside a
// `CardList`:
//
//   CardList — one panel, rows flush inside it and separated by their own
//     hover wash. For a rail of same-shaped rows (a group's newest shares, a
//     tournament's rounds and staff).
//   CardRow — a standalone bordered row in a gapped list. For rows that stand
//     apart because each is its own entity with its own actions (a bye, a
//     team).
//
// `Card` stays the primitive for anything with a header, a footer, or real
// content padding; these two are flush containers and carry none.

/**
 * A `ul` panel carrying the Card edge, with its rows flush inside it.
 *
 * @returns The list panel element.
 */
function CardList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="card-list"
      className={cn(
        "bg-card text-card-foreground ring-border flex flex-col rounded-lg p-1.5 ring-1",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A standalone `li` row carrying the Card edge, for gapped lists of entities.
 *
 * @returns The row element.
 */
function CardRow({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="card-row"
      className={cn(
        "bg-card text-card-foreground ring-border flex items-center justify-between gap-2 rounded-lg px-3 py-2 ring-1",
        className,
      )}
      {...props}
    />
  );
}

export { CardList, CardRow };
