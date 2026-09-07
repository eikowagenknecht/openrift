import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

// `children` is a render prop, not a resolved result: the contribute form's
// search stays behind a Suspense boundary that mounts only on open.
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
