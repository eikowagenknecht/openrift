import { cn } from "@/lib/utils";

function Callout({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="callout"
      className={cn("bg-muted/30 relative rounded-lg border p-4", className)}
      {...props}
    />
  );
}

export { Callout };
