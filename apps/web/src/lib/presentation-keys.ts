/**
 * Every action presentation mode's keyboard can trigger. The mapping lives
 * apart from the component so the key table is testable without a DOM, and so
 * the OBS control dashboard can reuse `prev`/`next` later.
 */
export type PresentationAction =
  | "prev"
  | "next"
  | "first"
  | "last"
  | "toggleText"
  | "toggleStrip"
  | "toggleHelp"
  | "toggleBoard"
  | "toggleReveal"
  | "toggleDirection"
  | "exit";

/**
 * The actions only a source with a board answers to. A stage without one
 * resolves them and drops them untouched, so the key keeps whatever the browser
 * or the OS does with it rather than being swallowed for nothing.
 */
export const BOARD_ACTIONS: ReadonlySet<PresentationAction> = new Set<PresentationAction>([
  "toggleBoard",
  "toggleReveal",
  "toggleDirection",
]);

interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/**
 * Maps a keydown to a presentation action.
 *
 * Modifier-carrying presses resolve to null so browser and OS shortcuts
 * (Cmd+←, Ctrl+F, Alt+Tab) keep working while the show is up — a creator who
 * loses their back button mid-stream has no way to say so.
 *
 * @returns The action to run, or null when the key isn't ours.
 */
export function resolvePresentationKey(event: KeyEventLike): PresentationAction | null {
  if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) {
    return null;
  }
  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
    case " ": {
      return "next";
    }
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp": {
      return "prev";
    }
    case "Home": {
      return "first";
    }
    case "End": {
      return "last";
    }
    case "t":
    case "T": {
      return "toggleText";
    }
    case "f":
    case "F": {
      return "toggleStrip";
    }
    case "b":
    case "B": {
      return "toggleBoard";
    }
    case "r":
    case "R": {
      return "toggleReveal";
    }
    case "d":
    case "D": {
      return "toggleDirection";
    }
    case "?": {
      return "toggleHelp";
    }
    case "Escape": {
      return "exit";
    }
    default: {
      return null;
    }
  }
}

/**
 * Whether a keydown landed in a field the user is typing into. The queue
 * builder shares the page with the show, so `f` must type an "f" in the search
 * box rather than flipping the filmstrip.
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

/**
 * Whether the focused element already owns the space bar.
 *
 * Space is "next card" here, but it is also how a keyboard user activates a
 * focused button — swallowing it would leave the exit button and the filmstrip
 * thumbnails reachable by Tab and impossible to press. Only Space is affected;
 * the arrows and letter shortcuts stay ours wherever focus sits.
 *
 * @returns True when Space should be left to the element.
 */
export function ownsSpaceKey(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.closest("button, a, [role='button'], summary") !== null;
}
