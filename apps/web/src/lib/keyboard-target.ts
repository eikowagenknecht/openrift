/**
 * Whether a keydown landed in a field the user is typing into. Every bare-key
 * shortcut in the app checks this first, so `/` opens the command palette from
 * the page but types a slash in a search box.
 *
 * @returns True when the event target takes text input.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
