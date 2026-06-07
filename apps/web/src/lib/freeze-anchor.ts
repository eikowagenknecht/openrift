/**
 * A Floating UI virtual element that tracks a DOM element's position while the
 * element is mounted, then freezes at its last-known rect once the element
 * leaves the DOM.
 *
 * Anchored popovers (`Popover.Positioner`) read the anchor's
 * `getBoundingClientRect()` on every reposition. When the anchor element
 * unmounts — e.g. a collection card cell disappears after its last copy is
 * removed — a raw element reference reports an all-zero rect, so the popover
 * snaps to the top-left of the viewport. Holding the last good rect instead
 * keeps the popover where the user opened it.
 */
export interface FrozenAnchor {
  getBoundingClientRect: () => DOMRect;
  /** Lets Floating UI attach scroll/resize listeners while the element is live. */
  contextElement: HTMLElement;
}

/**
 * Build a {@link FrozenAnchor} for an element. Call this while the element is
 * still connected so the captured initial rect is valid.
 * @returns A virtual anchor that follows the element until it detaches, then holds its last rect.
 */
export function createFrozenAnchor(element: HTMLElement): FrozenAnchor {
  let lastRect = element.getBoundingClientRect();
  return {
    contextElement: element,
    getBoundingClientRect: () => {
      if (element.isConnected) {
        lastRect = element.getBoundingClientRect();
      }
      return lastRect;
    },
  };
}
