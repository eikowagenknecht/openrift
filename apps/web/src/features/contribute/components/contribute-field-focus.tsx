import { createContext, use, useMemo, useState } from "react";

import type { PlaceholderField } from "@/features/cards/lib/card-placeholder-regions";

interface FieldFocusValue {
  active: PlaceholderField | null;
  setActive: (field: PlaceholderField | null) => void;
}

const FieldFocusContext = createContext<FieldFocusValue | null>(null);

export function useFieldFocus(): FieldFocusValue | null {
  return use(FieldFocusContext);
}

export function useFieldFocusState(): FieldFocusValue {
  const [active, setActive] = useState<PlaceholderField | null>(null);
  return useMemo(() => ({ active, setActive }), [active]);
}

export function FieldFocusProvider({
  value,
  children,
}: {
  value: FieldFocusValue;
  children: React.ReactNode;
}) {
  return <FieldFocusContext value={value}>{children}</FieldFocusContext>;
}

interface FieldLinkProps {
  "data-field"?: PlaceholderField;
  "data-linked-active"?: true;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onFocusCapture?: () => void;
  onBlurCapture?: () => void;
}

export function useFieldLink(field?: PlaceholderField): {
  props: FieldLinkProps;
  active: boolean;
} {
  const focus = useFieldFocus();
  if (field === undefined || focus === null) {
    return { props: {}, active: false };
  }
  const active = focus.active === field;
  return {
    active,
    props: {
      "data-field": field,
      "data-linked-active": active || undefined,
      onPointerEnter: () => focus.setActive(field),
      onPointerLeave: () => focus.setActive(null),
      onFocusCapture: () => focus.setActive(field),
      onBlurCapture: () => focus.setActive(null),
    },
  };
}

/**
 * Moves keyboard focus to the control a preview region stands for. Printing rows only render their
 * fields while open, so the caller opens the owning printing before this runs.
 */
export function focusFormField(field: PlaceholderField): boolean {
  const row = document.querySelector<HTMLElement>(
    `[data-field="${field}"]:not([data-slot="pressable"])`,
  );
  if (!row) {
    return false;
  }
  // The hint popover's trigger sits before the control in the row, so text entry is looked for first.
  const control =
    row.querySelector<HTMLElement>(
      "input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
    ) ??
    row.querySelector<HTMLElement>(
      "button:not([disabled]):not([data-slot='popover-trigger']), [tabindex]:not([tabindex='-1'])",
    );
  row.scrollIntoView?.({ block: "center", behavior: "smooth" });
  control?.focus();
  return true;
}

/** Retries across frames because the section holding the field may still be opening. */
export function focusFormFieldSoon(field: PlaceholderField, attempts = 12): () => void {
  let frame = 0;
  let left = attempts;
  const tick = () => {
    left -= 1;
    if (focusFormField(field) || left <= 0) {
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
  };
}
