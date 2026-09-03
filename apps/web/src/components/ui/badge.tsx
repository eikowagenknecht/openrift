import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // custom: ring-2 focus ring — app-wide focus width (scaffold ships ring-3)
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        // custom: tonal success badge on the success token — replaces inline green label spans
        success: "bg-success-soft text-success",
        // custom: tonal warning badge on the warning token — replaces inline amber label spans
        warning: "bg-warning-soft text-warning",
        // custom: tonal violet label badge on the violet token — the admin role chip, matching IconChip's violet tone
        violet: "bg-violet-soft text-violet",
        // custom: info variant for shared-list chips on the info token — matching IconChip's info tone
        info: "bg-info-soft text-info",
        // custom: neutral muted badge — replaces inline bg-muted text-muted-foreground label spans
        muted: "bg-muted text-muted-foreground",
        // custom: subtle primary-tinted label badge — replaces inline bg-primary/10 text-primary label spans
        subtle: "bg-primary/10 text-primary",
        // custom: compact count/notification bubble — replaces hand-rolled bg-primary text-primary-foreground rounded-full count pills (header nav, group tabs); the base rounded-4xl is already fully round at this height
        count: "bg-primary text-primary-foreground h-auto px-1.5 py-0 text-2xs font-medium",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
