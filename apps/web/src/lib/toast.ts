import type { ExternalToast } from "sonner";

/**
 * Options for error toasts the user must acknowledge — network and mutation
 * failures (e.g. an add/remove that didn't reach the server) are easy to miss
 * against the steady stream of auto-dismissing success toasts. These stay up
 * until dismissed and carry an explicit close button.
 *
 * Used by the global mutation `onError` (covers every collection add / remove /
 * move / dispose) and the quick-add remove-failure path.
 */
export const PERSISTENT_ERROR_TOAST: ExternalToast = {
  duration: Infinity,
  closeButton: true,
};
