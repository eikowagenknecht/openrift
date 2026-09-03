import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // custom: ring-2 focus/invalid rings — app-wide focus width (scaffold ships ring-3)
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // custom: corner-cut signature on the filled primary (docs/design-language.md); ring-inset because clip-path clips outset box-shadows
        default:
          "bg-primary text-primary-foreground hover:bg-primary/80 btn-corner-cut rounded-none focus-visible:ring-inset",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        // custom: corner-cut on the filled secondary too — all solid fills share the signature shape (docs/design-language.md)
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground btn-corner-cut rounded-none focus-visible:ring-inset",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        // custom: solid destructive fill with the corner-cut signature — destructive commits share the family shape (docs/design-language.md)
        // custom: dark:hover:bg-destructive/70 — scaffold's dark:bg-destructive/60 wins over hover:bg-destructive/90 in the cascade, leaving dark mode with no hover feedback
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:hover:bg-destructive/70 dark:focus-visible:ring-destructive/40 btn-corner-cut rounded-none focus-visible:ring-inset",
        link: "text-primary underline-offset-4 hover:underline",
        // custom: muted inline text-link for secondary actions (text-muted-foreground + persistent underline); distinct from `link` which is text-primary, offset-4, hover-only underline
        "link-muted":
          "font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground",
        // custom: dashed-border CTA for empty-state "add" targets (deck zones); `outline` is solid-border so it doesn't fit
        dashed:
          "border-border border-dashed text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/50 hover:text-foreground",
        // custom: translucent glass pill for a floating selector over content (card-table group jump); no other variant captures the blur + ring
        "glass-pill": "bg-background/60 ring-border/70 rounded-full shadow-sm ring-1 backdrop-blur",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // custom: smaller corner-cut and the rounded-md token radius for the compact size (see btn-corner-cut)
        xs: "[--btn-cut:5px] h-6 gap-1 rounded-md px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        // custom: smaller corner-cut and the rounded-md token radius for the compact size (see btn-corner-cut)
        sm: "[--btn-cut:5px] h-7 gap-1 rounded-md px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        // custom: smaller corner-cut and the rounded-md token radius for the compact size (see btn-corner-cut)
        "icon-xs":
          "[--btn-cut:5px] size-6 rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        // custom: smaller corner-cut and the rounded-md token radius for the compact size (see btn-corner-cut)
        "icon-sm": "[--btn-cut:5px] size-7 rounded-md in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  render,
  nativeButton,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  // custom: default nativeButton to false when a `render` prop is supplied.
  // Render is almost always used to swap in a TanStack <Link> (an <a>), and
  // Base UI warns at runtime if nativeButton stays true on a non-<button>.
  const resolvedNativeButton = nativeButton ?? render === undefined;
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      // custom: BaseUI's useRenderElement conditionally skips useMergedRefs on
      // the server (typeof document check), which causes the native <button>'s
      // `disabled` attribute to be absent from SSR HTML while present on the
      // client, triggering a React 19 hydration mismatch warning.
      suppressHydrationWarning
      render={render}
      nativeButton={resolvedNativeButton}
      {...props}
    />
  );
}

export { Button, buttonVariants };
