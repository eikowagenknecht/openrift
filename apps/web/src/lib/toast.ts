import type { ExternalToast } from "sonner";

// Stays up until dismissed, for error toasts (network/mutation failures) that
// are easy to miss against auto-dismissing success toasts.
export const PERSISTENT_ERROR_TOAST: ExternalToast = {
  duration: Infinity,
  closeButton: true,
};
