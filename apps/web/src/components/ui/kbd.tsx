import { cn } from "@/lib/utils";

/**
 * Renders a keyboard shortcut hint.
 *
 * @returns A styled `<kbd>` element.
 */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "bg-muted text-muted-foreground rounded px-1 py-0.5 font-mono text-[10px]",
        className,
      )}
      {...props}
    />
  );
}
