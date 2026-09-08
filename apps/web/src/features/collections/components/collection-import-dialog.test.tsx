import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useImportHandoffStore } from "@/features/collections/stores/import-handoff-store";
import { createStoreResetter } from "@/test/store-helpers";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

const { CollectionImportDialog } = await import("./collection-import-dialog");

const resetStore = createStoreResetter(useImportHandoffStore);

beforeEach(() => {
  resetStore();
  navigate.mockReset();
});

afterEach(() => {
  resetStore();
});

function setup(
  props: { collectionId?: string; open?: boolean; onOpenChange?: (open: boolean) => void } = {},
) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const view = render(
    <CollectionImportDialog
      collectionId={props.collectionId}
      open={props.open ?? true}
      onOpenChange={onOpenChange}
    />,
  );
  return { onOpenChange, ...view };
}

describe("CollectionImportDialog", () => {
  it("disables Continue while the textarea is blank", () => {
    setup();

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("enables Continue once text is entered", async () => {
    const user = userEvent.setup();
    setup();

    await user.type(
      screen.getByPlaceholderText("Paste CSV data or a plain text list here..."),
      "1 Yasuo",
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("stores the handoff and navigates to the import page on Continue", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup({ collectionId: "col-1" });

    await user.type(
      screen.getByPlaceholderText("Paste CSV data or a plain text list here..."),
      "1 Yasuo",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(useImportHandoffStore.getState().handoff).toEqual({
      rawText: "1 Yasuo",
      collectionId: "col-1",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigate).toHaveBeenCalledWith({ to: "/collections/import" });
  });

  it("stores an undefined collectionId when none is given", async () => {
    const user = userEvent.setup();
    setup();

    await user.type(
      screen.getByPlaceholderText("Paste CSV data or a plain text list here..."),
      "1 Yasuo",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(useImportHandoffStore.getState().handoff).toEqual({ rawText: "1 Yasuo" });
  });

  it("reads an uploaded file into the textarea and continues", async () => {
    const user = userEvent.setup();
    setup({ collectionId: "col-2" });

    const file = new File(["3 Jinx"], "cards.txt", { type: "text/plain" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(useImportHandoffStore.getState().handoff).toEqual({
      rawText: "3 Jinx",
      collectionId: "col-2",
    });
    expect(navigate).toHaveBeenCalledWith({ to: "/collections/import" });
  });

  it("clears the textarea after the dialog closes", () => {
    const { rerender } = render(
      <CollectionImportDialog collectionId={undefined} open onOpenChange={vi.fn()} />,
    );

    rerender(
      <CollectionImportDialog collectionId={undefined} open={false} onOpenChange={vi.fn()} />,
    );
    rerender(<CollectionImportDialog collectionId={undefined} open onOpenChange={vi.fn()} />);

    expect(screen.getByPlaceholderText("Paste CSV data or a plain text list here...")).toHaveValue(
      "",
    );
  });
});
