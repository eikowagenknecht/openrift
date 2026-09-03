import { cn } from "@/lib/utils";

function Code({ className, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      data-slot="code"
      className={cn("bg-muted rounded-md px-1.5 py-0.5 text-xs", className)}
      {...props}
    />
  );
}

export { Code };
