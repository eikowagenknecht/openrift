import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/collections/hooks/use-collections", () => ({
  useUpdateCollection: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

const { EditCollectionDialog } = await import("./edit-collection-dialog");

function Harness({ initialName }: { initialName: string }) {
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
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

describe("EditCollectionDialog", () => {
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
});
