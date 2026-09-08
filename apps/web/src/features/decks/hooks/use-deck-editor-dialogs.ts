import { useState } from "react";

export type DeckEditorDialog =
  | "rename"
  | "details"
  | "cover"
  | "homeCollection"
  | "export"
  | "print"
  | "missing"
  | "share"
  | "variants"
  | "variantCreate"
  | "delete";

export interface DeckEditorDialogState {
  open: Record<DeckEditorDialog, boolean>;
  openDialog: (dialog: DeckEditorDialog) => void;
  setDialogOpen: (dialog: DeckEditorDialog, open: boolean) => void;
}

const ALL_CLOSED: Record<DeckEditorDialog, boolean> = {
  rename: false,
  details: false,
  cover: false,
  homeCollection: false,
  export: false,
  print: false,
  missing: false,
  share: false,
  variants: false,
  variantCreate: false,
  delete: false,
};

export function useDeckEditorDialogs(): DeckEditorDialogState {
  const [open, setOpen] = useState(ALL_CLOSED);

  const setDialogOpen = (dialog: DeckEditorDialog, next: boolean) => {
    setOpen((previous) => ({ ...previous, [dialog]: next }));
  };

  return {
    open,
    openDialog: (dialog) => setDialogOpen(dialog, true),
    setDialogOpen,
  };
}
