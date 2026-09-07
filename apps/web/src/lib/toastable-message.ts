const MAX_TOAST_LENGTH = 300;

// A timed-out POST comes back as nginx's HTML error page, and that body
// reaches the mutation handler as the error's `message`.
function isPresentable(message: string): boolean {
  if (message === "") {
    return false;
  }
  if (message.startsWith("<") || /<\/?(?:html|head|body|center|h1)\b/iu.test(message)) {
    return false;
  }
  return message.length <= MAX_TOAST_LENGTH;
}

export function toastableMessage(message: string, fallback: string): string {
  const trimmed = message.trim();
  return isPresentable(trimmed) ? trimmed : fallback;
}
