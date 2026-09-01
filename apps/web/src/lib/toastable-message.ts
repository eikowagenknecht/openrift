const MAX_TOAST_LENGTH = 300;

/**
 * Whether a message is the app's own words rather than something a gateway
 * wrote. A timed-out POST comes back as nginx's HTML error page, and the body
 * reaches the mutation handler as the error's `message`, so without this the
 * user gets `<html>…405 Not Allowed…</html>` in a toast.
 */
function isPresentable(message: string): boolean {
  if (message === "") {
    return false;
  }
  if (message.startsWith("<") || /<\/?(?:html|head|body|center|h1)\b/iu.test(message)) {
    return false;
  }
  return message.length <= MAX_TOAST_LENGTH;
}

/**
 * The error text to show a user, falling back when the message is markup, empty
 * or too long to read in a toast. The original is never lost: callers log the
 * thrown value (and an `ApiError`'s `diagnostic`) to the console first.
 *
 * @returns The message when it is presentable, otherwise `fallback`.
 */
export function toastableMessage(message: string, fallback: string): string {
  const trimmed = message.trim();
  return isPresentable(trimmed) ? trimmed : fallback;
}
