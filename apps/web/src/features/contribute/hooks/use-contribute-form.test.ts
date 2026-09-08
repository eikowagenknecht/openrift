import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useContributeForm } from "@/features/contribute/hooks/use-contribute-form";
import { emptyFormState } from "@/features/contribute/lib/contribute-json";

const reset = vi.fn();
const submit = { mutate: vi.fn(), reset, isSuccess: false };

vi.mock("@/features/contribute/hooks/use-card-submission", () => ({
  useSubmitCard: () => submit,
}));

beforeEach(() => {
  reset.mockClear();
  submit.mutate.mockClear();
  submit.isSuccess = false;
});

describe("useContributeForm", () => {
  it("clears the success alert when an edit follows a submission", () => {
    submit.isSuccess = true;
    const { result } = renderHook(() => useContributeForm({ initial: emptyFormState() }));

    act(() => {
      result.current.setCardField("name", "Ahri");
    });
    act(() => {
      result.current.setPrintingField(0, "publicCode", "OGN-066/298");
    });
    act(() => {
      result.current.setNote("Spotted in OGN.");
    });

    expect(reset).toHaveBeenCalledTimes(3);
  });

  it("leaves the mutation alone while no submission has succeeded", () => {
    const { result } = renderHook(() => useContributeForm({ initial: emptyFormState() }));

    act(() => {
      result.current.setCardField("name", "Ahri");
    });

    expect(reset).not.toHaveBeenCalled();
  });

  it("resets the mutation and the draft when starting another card", () => {
    const { result } = renderHook(() => useContributeForm({ initial: emptyFormState() }));

    act(() => {
      result.current.setCardField("name", "Ahri");
    });
    act(() => {
      result.current.startAnother();
    });

    expect(reset).toHaveBeenCalledTimes(1);
    expect(result.current.form).toEqual(emptyFormState());
  });
});
