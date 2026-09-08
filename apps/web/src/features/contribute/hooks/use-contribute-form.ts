import { useReducer } from "react";

import { useSubmitCard } from "@/features/contribute/hooks/use-card-submission";
import {
  contributeFormInitialState,
  contributeFormReducer,
  printingErrorIndexes,
} from "@/features/contribute/lib/contribute-form-state";
import type {
  ContributeFormCard,
  ContributeFormPrinting,
  ContributeFormState,
} from "@/features/contribute/lib/contribute-json";
import {
  buildSubmissionPayload,
  validateContribution,
} from "@/features/contribute/lib/contribute-json";

interface UseContributeFormOptions {
  initial: ContributeFormState;
  lockedSlug?: string;
}

export function useContributeForm({ initial, lockedSlug }: UseContributeFormOptions) {
  const [state, dispatch] = useReducer(
    contributeFormReducer,
    contributeFormInitialState(initial, Boolean(lockedSlug)),
  );
  const submit = useSubmitCard();

  function clearSuccess() {
    if (submit.isSuccess) {
      submit.reset();
    }
  }

  function setCardField<K extends keyof ContributeFormCard>(key: K, value: ContributeFormCard[K]) {
    clearSuccess();
    dispatch({ type: "setCardField", key, value });
  }

  function setPrintingField<K extends keyof ContributeFormPrinting>(
    index: number,
    key: K,
    value: ContributeFormPrinting[K],
  ) {
    clearSuccess();
    dispatch({ type: "setPrintingField", index, key, value });
  }

  function addPrinting() {
    dispatch({ type: "addPrinting" });
  }

  function duplicatePrinting(index: number) {
    dispatch({ type: "duplicatePrinting", index });
  }

  function removePrinting(index: number) {
    dispatch({ type: "removePrinting", index });
  }

  function setActivePrinting(index: number | null) {
    dispatch({ type: "setActivePrinting", index });
  }

  function setNote(note: string) {
    clearSuccess();
    dispatch({ type: "setNote", note });
  }

  function prefillFromExisting(prefilled: ContributeFormState) {
    clearSuccess();
    dispatch({ type: "prefill", state: prefilled });
  }

  function startAnother() {
    submit.reset();
    dispatch({ type: "reset" });
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateContribution(state.form);
    dispatch({ type: "submitAttempt", result });
    if (result.ok) {
      submit.mutate(buildSubmissionPayload(state.form, state.note, state.baseline));
    }
  }

  function errorAt(path: string): string | undefined {
    return state.submitted ? state.errors.find((error) => error.path === path)?.message : undefined;
  }

  return {
    form: state.form,
    errors: state.errors,
    submitted: state.submitted,
    activePrinting: state.activePrinting,
    note: state.note,
    printingsWithErrors: state.submitted ? printingErrorIndexes(state.errors) : new Set<number>(),
    submit,
    setCardField,
    setPrintingField,
    addPrinting,
    duplicatePrinting,
    removePrinting,
    setActivePrinting,
    setNote,
    prefillFromExisting,
    startAnother,
    handleSubmit,
    errorAt,
  };
}

export type ContributeFormApi = ReturnType<typeof useContributeForm>;
