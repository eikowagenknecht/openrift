import type {
  ContributeFormCard,
  ContributeFormPrinting,
  ContributeFormState,
  ValidationError,
  ValidationResult,
} from "@/features/contribute/lib/contribute-json";
import {
  emptyFormState,
  emptyPrinting,
  nameToSlug,
} from "@/features/contribute/lib/contribute-json";

export interface ContributeFormReducerState {
  form: ContributeFormState;
  baseline: ContributeFormState;
  errors: ValidationError[];
  submitted: boolean;
  activePrinting: number | null;
  note: string;
  slugLocked: boolean;
}

export type ContributeFormAction =
  | {
      type: "setCardField";
      key: keyof ContributeFormCard;
      value: ContributeFormCard[keyof ContributeFormCard];
    }
  | {
      type: "setPrintingField";
      index: number;
      key: keyof ContributeFormPrinting;
      value: ContributeFormPrinting[keyof ContributeFormPrinting];
    }
  | { type: "addPrinting" }
  | { type: "duplicatePrinting"; index: number }
  | { type: "removePrinting"; index: number }
  | { type: "setActivePrinting"; index: number | null }
  | { type: "setNote"; note: string }
  | { type: "prefill"; state: ContributeFormState }
  | { type: "reset" }
  | { type: "submitAttempt"; result: ValidationResult };

/** Matches the `printings[3].publicCode` form-state paths `validateContribution` returns. */
const PRINTING_ERROR_PATH = /^printings\[(?<index>\d+)\]\./u;

export function printingErrorIndexes(errors: ValidationError[]): Set<number> {
  const indexes = new Set<number>();
  for (const error of errors) {
    const index = PRINTING_ERROR_PATH.exec(error.path)?.groups?.index;
    if (index !== undefined) {
      indexes.add(Number(index));
    }
  }
  return indexes;
}

export function contributeFormInitialState(
  initial: ContributeFormState,
  slugLocked: boolean,
): ContributeFormReducerState {
  return {
    form: initial,
    baseline: initial,
    errors: [],
    submitted: false,
    activePrinting: 0,
    note: "",
    slugLocked,
  };
}

export function contributeFormReducer(
  state: ContributeFormReducerState,
  action: ContributeFormAction,
): ContributeFormReducerState {
  switch (action.type) {
    case "setCardField": {
      const { form } = state;
      const card: ContributeFormCard = { ...form.card, [action.key]: action.value };
      if (action.key !== "name") {
        return { ...state, form: { ...form, card } };
      }
      const previousName = form.card.name;
      return {
        ...state,
        form: {
          slug: state.slugLocked ? form.slug : nameToSlug(card.name),
          card,
          printings: form.printings.map((printing) =>
            printing.printedName === previousName || printing.printedName === ""
              ? { ...printing, printedName: card.name }
              : printing,
          ),
        },
      };
    }
    case "setPrintingField": {
      const { form } = state;
      return {
        ...state,
        form: {
          ...form,
          printings: form.printings.map((printing, index): ContributeFormPrinting =>
            index === action.index ? { ...printing, [action.key]: action.value } : printing,
          ),
        },
      };
    }
    case "addPrinting": {
      const printings = [...state.form.printings, emptyPrinting()];
      return {
        ...state,
        form: { ...state.form, printings },
        activePrinting: printings.length - 1,
      };
    }
    case "duplicatePrinting": {
      const source = state.form.printings[action.index];
      if (!source) {
        return state;
      }
      const printings = [
        ...state.form.printings.slice(0, action.index + 1),
        { ...source },
        ...state.form.printings.slice(action.index + 1),
      ];
      return { ...state, form: { ...state.form, printings }, activePrinting: action.index + 1 };
    }
    case "removePrinting": {
      const printings = state.form.printings.filter((_, index) => index !== action.index);
      return {
        ...state,
        form: { ...state.form, printings },
        activePrinting:
          state.activePrinting === null
            ? null
            : Math.min(state.activePrinting, printings.length - 1),
      };
    }
    case "setActivePrinting": {
      return { ...state, activePrinting: action.index };
    }
    case "setNote": {
      return { ...state, note: action.note };
    }
    case "prefill": {
      return {
        ...state,
        form: action.state,
        baseline: action.state,
        errors: [],
        submitted: false,
        activePrinting: null,
      };
    }
    case "reset": {
      return contributeFormInitialState(emptyFormState(), state.slugLocked);
    }
    case "submitAttempt": {
      const attempted = { ...state, submitted: true, errors: action.result.errors };
      if (action.result.ok) {
        return attempted;
      }
      // A closed printing renders none of its field errors, so the first failed one opens.
      const failed = [...printingErrorIndexes(action.result.errors)].toSorted((a, b) => a - b);
      const first = failed[0];
      return first === undefined ? attempted : { ...attempted, activePrinting: first };
    }
  }
}
