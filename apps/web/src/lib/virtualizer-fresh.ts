import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { PartialKeys, ReactVirtualizerOptions, Virtualizer } from "@tanstack/react-virtual";

// React Compiler over-memoizes getVirtualItems()/getTotalSize() based on
// reference stability, missing internal subscription state, so cold-loaded
// grids can render zero rows. "use no memo" opts these wrappers out; remove
// once https://github.com/TanStack/virtual/issues/736 is fixed.
export function useWindowVirtualizerFresh<TItemElement extends Element>(
  options: PartialKeys<
    ReactVirtualizerOptions<Window, TItemElement>,
    "getScrollElement" | "observeElementRect" | "observeElementOffset" | "scrollToFn"
  >,
): {
  virtualizer: Virtualizer<Window, TItemElement>;
  virtualItems: ReturnType<Virtualizer<Window, TItemElement>["getVirtualItems"]>;
  totalSize: number;
} {
  // eslint-disable-next-line react-compiler/react-compiler -- see file header
  "use no memo";
  const virtualizer = useWindowVirtualizer(options);
  return {
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
  };
}
