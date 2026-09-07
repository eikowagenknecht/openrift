/**
 * A raw element reference reports an all-zero rect once unmounted, snapping
 * an anchored popover to the top-left; this holds the last live rect instead.
 */
export interface FrozenAnchor {
  getBoundingClientRect: () => DOMRect;
  contextElement: HTMLElement;
}

/** Call while `element` is still connected so the captured initial rect is valid. */
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
