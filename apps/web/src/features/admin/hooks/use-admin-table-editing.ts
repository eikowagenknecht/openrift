import { useReducer } from "react";

import {
  adminEditingInitialState,
  adminEditingReducer,
} from "@/features/admin/lib/admin-table-editing";
import { errorText } from "@/lib/error-text";

interface DraftSaver<TDraft> {
  onSave: (draft: TDraft) => Promise<unknown>;
  validate?: (draft: TDraft) => string | null;
}

interface UseAdminTableEditingOptions<TDraft> {
  add?: DraftSaver<TDraft> & { emptyDraft: TDraft };
  edit?: DraftSaver<TDraft>;
}

export function useAdminTableEditing<TDraft>({ add, edit }: UseAdminTableEditingOptions<TDraft>) {
  const [state, dispatch] = useReducer(
    adminEditingReducer<TDraft>,
    adminEditingInitialState<TDraft>(),
  );

  const { mode } = state;
  const adding = mode.kind === "adding";
  const addDraft = mode.kind === "adding" ? mode.draft : null;
  const addingUnderKey = mode.kind === "adding" ? mode.underKey : null;
  const editingKey = mode.kind === "editing" ? mode.key : null;
  const editDraft = mode.kind === "editing" ? mode.draft : null;

  function startAdding(draft?: TDraft, underKey: string | null = null) {
    if (!add) {
      return;
    }
    dispatch({
      type: "startAdding",
      draft: structuredClone(draft ?? add.emptyDraft),
      underKey,
    });
  }

  function startEditing(key: string, draft: TDraft) {
    dispatch({ type: "startEditing", key, draft });
  }

  function updateDraft(update: (prev: TDraft) => TDraft) {
    dispatch({ type: "updateDraft", update });
  }

  function cancel() {
    dispatch({ type: "close" });
  }

  async function save() {
    if (mode.kind === "idle") {
      return;
    }
    const config = mode.kind === "adding" ? add : edit;
    if (!config) {
      return;
    }
    const { draft } = mode;
    const invalid = config.validate ? config.validate(draft) : null;
    if (invalid) {
      dispatch({ type: "setError", error: invalid });
      return;
    }
    dispatch({ type: "submitStart" });
    try {
      await config.onSave(draft);
      dispatch({ type: "close" });
    } catch (error) {
      dispatch({ type: "submitFailed", error: errorText(error, "Save failed") });
    }
  }

  return {
    adding,
    addDraft,
    addingUnderKey,
    editingKey,
    editDraft,
    error: state.error,
    pending: state.pending,
    startAdding,
    startEditing,
    updateDraft,
    cancel,
    save,
  };
}
