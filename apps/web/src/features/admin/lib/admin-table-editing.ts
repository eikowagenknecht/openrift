export type AdminEditingMode<TDraft> =
  | { kind: "idle" }
  | { kind: "adding"; underKey: string | null; draft: TDraft }
  | { kind: "editing"; key: string; draft: TDraft };

export interface AdminEditingState<TDraft> {
  mode: AdminEditingMode<TDraft>;
  error: string;
  pending: boolean;
}

export type AdminEditingAction<TDraft> =
  | { type: "startAdding"; draft: TDraft; underKey: string | null }
  | { type: "startEditing"; key: string; draft: TDraft }
  | { type: "updateDraft"; update: (prev: TDraft) => TDraft }
  | { type: "setError"; error: string }
  | { type: "submitStart" }
  | { type: "submitFailed"; error: string }
  | { type: "close" };

export function adminEditingInitialState<TDraft>(): AdminEditingState<TDraft> {
  return { mode: { kind: "idle" }, error: "", pending: false };
}

export function adminEditingReducer<TDraft>(
  state: AdminEditingState<TDraft>,
  action: AdminEditingAction<TDraft>,
): AdminEditingState<TDraft> {
  switch (action.type) {
    case "startAdding": {
      return {
        mode: { kind: "adding", underKey: action.underKey, draft: action.draft },
        error: "",
        pending: false,
      };
    }
    case "startEditing": {
      return {
        mode: { kind: "editing", key: action.key, draft: action.draft },
        error: "",
        pending: false,
      };
    }
    case "updateDraft": {
      const { mode } = state;
      if (mode.kind === "idle") {
        return state;
      }
      return { ...state, mode: { ...mode, draft: action.update(mode.draft) } };
    }
    case "setError": {
      return { ...state, error: action.error, pending: false };
    }
    case "submitStart": {
      return { ...state, error: "", pending: true };
    }
    case "submitFailed": {
      return { ...state, error: action.error, pending: false };
    }
    case "close": {
      return adminEditingInitialState();
    }
  }
}
