import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import type { PartialKeys, ReactVirtualizerOptions, Virtualizer } from "@tanstack/react-virtual";

// React Compiler over-memoizes `virtualizer.getVirtualItems()` and
// `getTotalSize()` based on the virtualizer's reference stability, but those
// methods depend on internal subscription state the compiler can't see, so
// stale results stick and cold-loaded grids render zero rows. The
// `"use no memo"` directive opts these wrappers out of compilation, and the
// helpers return the already-read values so consumers don't re-trip the
// memoization at the call site. See https://github.com/TanStack/virtual/issues/736

/**
 * Element-scroll virtualizer + pre-read `virtualItems`/`totalSize`.
 * @param options Forwarded verbatim to `useVirtualizer`.
 * @returns The virtualizer instance and its currently-visible items/size.
 */
export function useVirtualizerFresh<
  TScrollElement extends Element,
  TItemElement extends Element = Element,
>(
  options: PartialKeys<
    ReactVirtualizerOptions<TScrollElement, TItemElement>,
    "observeElementRect" | "observeElementOffset" | "scrollToFn"
  >,
) {
  // eslint-disable-next-line react-compiler/react-compiler -- see file header
  "use no memo";
  const virtualizer = useVirtualizer(options);
  return {
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
  };
}

/**
 * Window-scroll virtualizer + pre-read `virtualItems`/`totalSize`.
 * @param options Forwarded verbatim to `useWindowVirtualizer`.
 * @returns The virtualizer instance and its currently-visible items/size.
 */
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
