import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * A button that swaps itself for a card search when pressed, with an X to swap
 * back. Three surfaces grew their own copy of this (the card pipeline's
 * "Assign", the meta pipeline's "Link card", and the contribute form's "Select
 * an existing card"), each repeating the open state, the trigger, the wrapper
 * and the close button.
 *
 * The search itself stays with the caller, passed as a render prop rather than
 * props: the contribute form has to keep its catalog-backed half behind a
 * Suspense boundary that mounts only once the trigger is used, which it cannot
 * do if this component resolves the results.
 *
 * @param props.children Renders the search; call `close` after a pick.
 * @returns The trigger, or the search once it is open.
 */
export function CardPickerButton({
  label,
  icon,
  variant = "outline",
  size,
  type,
  disabled,
  closeLabel = "Close search",
  className,
  children,
}: {
  label: string;
  icon: ReactNode;
  variant?: "outline" | "ghost";
  size?: "xs" | "sm";
  /** Set to "button" inside a form, so the trigger can't submit it. */
  type?: "button";
  disabled?: boolean;
  closeLabel?: string;
  className?: string;
  children: (helpers: { close: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  if (!open) {
    return (
      <Button
        type={type}
        variant={variant}
        size={size}
        disabled={disabled}
        className={className}
        onClick={() => setOpen(true)}
      >
        {icon}
        {label}
      </Button>
    );
  }

  return (
    <span
      className={className ? `inline-flex items-center ${className}` : "inline-flex items-center"}
    >
      {children({ close })}
      <Button
        type={type}
        variant="ghost"
        size={size}
        className="ml-1"
        aria-label={closeLabel}
        onClick={close}
      >
        <XIcon />
      </Button>
    </span>
  );
}
