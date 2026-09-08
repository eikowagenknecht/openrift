import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMutateAsync = vi.fn().mockResolvedValue(undefined);
const deckbuildingMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock("@/features/collections/hooks/use-collections", () => ({
  useUpdateCollection: () => ({
    mutateAsync: updateMutateAsync,
    isPending: false,
  }),
  useSetCollectionDeckbuilding: () => ({
    mutateAsync: deckbuildingMutateAsync,
    isPending: false,
  }),
}));

const { EditCollectionDialog } = await import("./edit-collection-dialog");

function Harness({
  initialName,
  availableForDeckbuilding = false,
}: {
  initialName: string;
  availableForDeckbuilding?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [currentName, setCurrentName] = useState(initialName);
  return (
    <>
      <button type="button" onClick={() => setCurrentName("RiftCoreImport")}>
        change-name
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        open-dialog
      </button>
      <EditCollectionDialog
        collectionId="abc"
        currentName={currentName}
        isInbox={false}
        availableForDeckbuilding={availableForDeckbuilding}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

describe("EditCollectionDialog", () => {
  beforeEach(() => {
    updateMutateAsync.mockClear();
    deckbuildingMutateAsync.mockClear();
  });

  it("shows the current name when opened after navigating to a different collection", async () => {
    const user = userEvent.setup();
    render(<Harness initialName="Inbox" />);

    await user.click(screen.getByRole("button", { name: "change-name" }));
    await user.click(screen.getByRole("button", { name: "open-dialog" }));

    expect(screen.getByLabelText("Name")).toHaveValue("RiftCoreImport");
  });

  it("seeds the input with the current name on first open", async () => {
    const user = userEvent.setup();
    render(<Harness initialName="RiftCoreImport" />);

    await user.click(screen.getByRole("button", { name: "open-dialog" }));

    expect(screen.getByLabelText("Name")).toHaveValue("RiftCoreImport");
  });

  it("seeds the deck building checkbox from the current value", async () => {
    const user = userEvent.setup();
    render(<Harness initialName="Binder" availableForDeckbuilding />);

    await user.click(screen.getByRole("button", { name: "open-dialog" }));

    expect(screen.getByRole("checkbox", { name: "Available for deck building" })).toBeChecked();
  });

  it("closes without any mutation when nothing changed", async () => {
    const user = userEvent.setup();
    render(<Harness initialName="Binder" />);

    await user.click(screen.getByRole("button", { name: "open-dialog" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMutateAsync).not.toHaveBeenCalled();
    expect(deckbuildingMutateAsync).not.toHaveBeenCalled();
  });

  it("renames the collection when only the name changed", async () => {
    const user = userEvent.setup();
    render(<Harness initialName="Binder" />);

    await user.click(screen.getByRole("button", { name: "open-dialog" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "New name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMutateAsync).toHaveBeenCalledWith({ id: "abc", name: "New name" });
    expect(deckbuildingMutateAsync).not.toHaveBeenCalled();
  });

  it("toggles deck building when only the checkbox changed", async () => {
    const user = userEvent.setup();
    render(<Harness initialName="Binder" availableForDeckbuilding={false} />);

    await user.click(screen.getByRole("button", { name: "open-dialog" }));
    await user.click(screen.getByRole("checkbox", { name: "Available for deck building" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(deckbuildingMutateAsync).toHaveBeenCalledWith({ id: "abc", available: true });
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it("runs both mutations when the name and the checkbox both changed", async () => {
    const user = userEvent.setup();
    render(<Harness initialName="Binder" availableForDeckbuilding={false} />);

    await user.click(screen.getByRole("button", { name: "open-dialog" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "New name");
    await user.click(screen.getByRole("checkbox", { name: "Available for deck building" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMutateAsync).toHaveBeenCalledTimes(1);
    expect(deckbuildingMutateAsync).toHaveBeenCalledTimes(1);
  });
});
