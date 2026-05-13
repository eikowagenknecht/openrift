import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-collections", () => ({
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
        currentAvailableForDeckbuilding
        isInbox={false}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

describe("EditCollectionDialog", () => {
  it("shows the current name when opened after navigating to a different collection", async () => {
    // Regression: dialog was mounted once by CollectionGrid and stayed mounted
    // across collection navigations. useState seeded `name` on first mount and
    // the onOpenChange-based reset never fired (BaseUI doesn't echo controlled
    // open prop changes), so the input stuck on whichever collection's name
    // was current when the dialog first mounted.
    const user = userEvent.setup();
    render(<Harness initialName="Inbox" />);

    // Simulate navigating to a different collection: the parent passes a new
    // `currentName` prop while the dialog is closed.
    await user.click(screen.getByRole("button", { name: "change-name" }));

    // Now open the dialog.
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
