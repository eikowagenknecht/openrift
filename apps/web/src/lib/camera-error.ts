/**
 * Human-readable message for a `getUserMedia` rejection.
 *
 * Browsers reject with `DOMException`s whose messages are written for
 * developers, not users. Firefox is the worst offender: a machine with no
 * usable camera rejects with NotFoundError and the message "The object can
 * not be found here." before any permission prompt is shown. Map the error
 * names we can act on to messages that tell the user what to check.
 *
 * @returns A user-facing message for the rejection, or the fallback for a
 *   non-Error throw.
 */
export function cameraErrorMessage(thrown: unknown, fallback: string): string {
  // DOMException is checked separately: it only gained Error in its prototype
  // chain in later engine versions, and jsdom's still lacks it.
  if (!(thrown instanceof Error || thrown instanceof DOMException)) {
    return fallback;
  }
  switch (thrown.name) {
    case "NotFoundError":
    case "DevicesNotFoundError": {
      return "No camera found. Check that a camera is connected and not disabled in your system's privacy settings.";
    }
    case "NotAllowedError":
    case "PermissionDeniedError": {
      return "Camera access was blocked. Allow camera access for this site in your browser settings and try again.";
    }
    case "NotReadableError":
    case "TrackStartError": {
      return "The camera could not be started. It may be in use by another app, close that app and try again.";
    }
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError": {
      return "No camera on this device supports the requested video settings.";
    }
    case "SecurityError": {
      return "Camera access is disabled in this browser.";
    }
    default: {
      return thrown.message || fallback;
    }
  }
}
