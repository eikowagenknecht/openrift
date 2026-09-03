import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// CardLink is the design-system's clickable tile: a whole Card that navigates
// somewhere (or fires a single action). It owns the app's one hover language
// for tiles — shadow lift, muted wash, and a 1px primary recolor of the
// resting edge — plus the focus-visible ring that hand-rolled
// Link-around-Card tiles never had.
//
// Tiles that can't be a CardLink still share the hover via
// `cardLinkVariants()`: cards with secondary interactive elements inside
// (menus, inner links) keep the Card as the outer element, and non-Card link
// tiles (the deck grid/list tiles) apply it to their own root alongside the
// Card edge (`ring-1 ring-border`) and focus classes.

// The hover treatment mirrors StatTile (shadow lift + 1px primary edge +
// muted wash) so the two tile families read as siblings; keep them in sync.
const cardLinkVariants = cva(
  "transition-all hover:bg-muted/50 hover:shadow-md hover:ring-primary/30",
);

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
  size,
  children,
  render,
  ...props
}: useRender.ComponentProps<"a"> & { size?: "default" | "sm" }) {
  return useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        className:
          "focus-visible:ring-ring/50 block h-full rounded-lg no-underline outline-none focus-visible:ring-2",
        children: (
          <Card size={size} className={cn(cardLinkVariants(), "h-full", className)}>
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
