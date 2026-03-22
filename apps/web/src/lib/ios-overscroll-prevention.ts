/**
 * Prevent iOS overscroll bounce / pull-to-refresh in PWA standalone mode.
 * CSS overscroll-behavior-y: none doesn't fully suppress the gesture on iOS Safari.
 */
export function preventIOSOverscroll(): void {
  let startY = 0;
  document.addEventListener(
    "touchstart",
    (e) => {
      startY = e.touches[0].clientY;
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      // Don't interfere when body scroll is locked (e.g. card detail overlay).
      if (document.body.style.overflow === "hidden") {
        return;
      }
      if (e.touches[0].clientY > startY && globalThis.scrollY <= 0) {
        e.preventDefault();
      }
    },
    { passive: false },
  );
}
