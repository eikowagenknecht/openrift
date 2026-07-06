import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// Pressable is the design-system's "unstyled button": a large clickable region
// wrapping rich content (card images, palette rows, option rows) where Button's
// chrome would fight the design. It owns only the invariants every such region
// must have — button semantics, pointer cursor, left-aligned text, and a
// focus-visible ring — and leaves all layout (block, w-full, padding, radius)
// to the call site. If you find yourself adding background/border/height
// classes at a call site, you probably want Button instead.

/**
 * Unstyled-but-accessible clickable region. Renders a native `<button>` with
 * `type="button"`, pointer cursor, and a focus-visible ring; all layout comes
 * from `className`.
 *
 * @returns The pressable button element.
 */
function Pressable({ className, type, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      data-slot="pressable"
      type={type ?? "button"}
      className={cn(
        "focus-visible:ring-ring cursor-pointer text-left focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export { Pressable };
