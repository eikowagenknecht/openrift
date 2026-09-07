export type PresentationAction =
  | "prev"
  | "next"
  | "first"
  | "last"
  | "toggleText"
  | "toggleStrip"
  | "toggleHelp"
  | "toggleBoard"
  | "toggleHero"
  | "toggleRank"
  | "toggleReveal"
  | "toggleDirection"
  | "toggleObs"
  | "toggleEdit"
  | "push"
  | "toggleHidden"
  | "exit";

export const BOARD_ACTIONS: ReadonlySet<PresentationAction> = new Set<PresentationAction>([
  "toggleBoard",
  "toggleHero",
  "toggleRank",
  "toggleReveal",
  "toggleDirection",
  "toggleObs",
]);

/**
 * WALK_ACTIONS is a superset of BOARD_ACTIONS. `toggleHidden` is deliberately
 * excluded: hiding the overlay is distinct from leaving the walk.
 */
export const WALK_ACTIONS: ReadonlySet<PresentationAction> = new Set<PresentationAction>([
  "prev",
  "next",
  "first",
  "last",
  "toggleText",
  "toggleStrip",
  "push",
  ...BOARD_ACTIONS,
]);

interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** Modifier-carrying presses resolve to null so OS/browser shortcuts (Cmd+Left, Ctrl+F) keep working. */
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
    case "c":
    case "C": {
      return "toggleHero";
    }
    case "k":
    case "K": {
      return "toggleRank";
    }
    case "r":
    case "R": {
      return "toggleReveal";
    }
    case "d":
    case "D": {
      return "toggleDirection";
    }
    case "o":
    case "O": {
      return "toggleObs";
    }
    case "e":
    case "E": {
      return "toggleEdit";
    }
    case "p":
    case "P": {
      return "push";
    }
    case "h":
    case "H": {
      return "toggleHidden";
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

/** Space also activates a focused button/link; swallowing it here would break Tab navigation. */
export function ownsSpaceKey(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.closest("button, a, [role='button'], summary") !== null;
}
