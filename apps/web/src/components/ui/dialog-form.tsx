import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Resolves initial focus for a dialog popup hosting a `DialogForm`. When the
 * popup contains a single `type="submit"` primary and no typable field,
 * initial focus moves to that primary so pressing Enter right after opening
 * confirms the dialog (BaseUI's default focuses the first tabbable element,
 * which is usually Cancel). Dialogs with a text field keep the default so
 * typing can start immediately, and implicit submission covers Enter from
 * there.
 *
 * Takes the popup element, not a ref: call it from an inline `initialFocus`
 * closure (`() => dialogFormInitialFocus(popupRef.current)`). Calling it with
 * the ref object during render makes the React Compiler bail on the whole
 * component ("Passing a ref to a function may read its value during render").
 * @returns The element to focus, or `true` to keep BaseUI's default.
 */
function dialogFormInitialFocus(popup: HTMLElement | null): HTMLElement | true {
  if (!popup) {
    return true;
  }
  const submit = popup.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!submit || submit.disabled) {
    return true;
  }
  const typable = popup.querySelector(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]), textarea:not([disabled]), [contenteditable="true"]',
  );
  return typable ? true : submit;
}

/**
 * Form wrapper for dialog content so Enter activates the dialog's primary
 * action via native implicit submission. Place it directly inside
 * `DialogContent` / `AlertDialogContent`, wrapping all existing children, and
 * give the primary button `type="submit"` (every other `Button` already
 * defaults to `type="button"` via BaseUI). `display: contents` keeps the
 * children participating in the content grid, so the layout is unchanged.
 * The submit handler always receives a `preventDefault()`-ed event, so
 * callers never trigger a page navigation.
 * @returns The wrapping form element.
 */
function DialogForm({ onSubmit, className, ...props }: React.ComponentProps<"form">) {
  return (
    <form
      data-slot="dialog-form"
      className={cn("contents", className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(event);
      }}
      {...props}
    />
  );
}

export { DialogForm, dialogFormInitialFocus };
