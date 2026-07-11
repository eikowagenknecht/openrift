import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// CardLink is the design-system's clickable tile: a whole Card that navigates
// somewhere (or fires a single action). It owns the app's one hover language
// for tiles — the `tint` background wash by default, or `ring` for
// image-dominated tiles where a tint would barely show — plus the
// focus-visible ring that hand-rolled Link-around-Card tiles never had.
//
// Tiles with secondary interactive elements inside (menus, inner links)
// cannot nest inside one anchor; keep the Card as the outer element there and
// apply `cardLinkVariants()` to it so the hover treatment stays in sync.

const cardLinkVariants = cva("", {
  variants: {
    variant: {
      tint: "hover:bg-muted transition-colors",
      ring: "hover:ring-ring/40 transition-shadow hover:ring-2",
    },
  },
  defaultVariants: {
    variant: "tint",
  },
});

/**
 * A Card that is itself the click target. Pass the navigation target via
 * `render={<Link ... />}` (or a `<Pressable>` / plain `<a>` for non-router
 * targets); `className` styles the inner Card, the wrapper carries the
 * focus-visible ring.
 *
 * @returns The clickable tile element.
 */
function CardLink({
  className,
  variant,
  size,
  children,
  render,
  ...props
}: useRender.ComponentProps<"a"> &
  VariantProps<typeof cardLinkVariants> & { size?: "default" | "sm" }) {
  return useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        className:
          "focus-visible:ring-ring/50 block h-full rounded-xl no-underline outline-none focus-visible:ring-2",
        children: (
          <Card size={size} className={cn(cardLinkVariants({ variant }), "h-full", className)}>
            {children}
          </Card>
        ),
      },
      props,
    ),
    state: {
      slot: "card-link",
    },
  });
}

export { CardLink, cardLinkVariants };
