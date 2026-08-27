import type { CollectionResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ScanAddAllDialog } from "./scan-add-all-dialog";

function collection(id: string, name: string, isInbox = false): CollectionResponse {
  return {
    id,
    name,
    description: null,
    availableForDeckbuilding: true,
    sidebarHidden: false,
    isInbox,
    sortOrder: 0,
    isPublic: false,
    shareToken: null,
    copyCount: 0,
    totalValueCents: null,
    unpricedCopyCount: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    groupId: null,
    groupSlug: null,
    groupName: null,
    viewerCanAdmin: true,
    homeDecks: [],
  };
}

const collections = [
  collection("inbox", "Inbox", true),
  collection("binder", "Binder"),
  collection("bulk", "Bulk"),
];

function Harness({ onConfirm }: { onConfirm: (collectionId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | undefined>(undefined);
  return (
    <>
      <button type="button" onClick={() => setTargetId("binder")}>
        pick-binder
      </button>
      <button type="button" onClick={() => setTargetId("bulk")}>
        pick-bulk
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        open-dialog
      </button>
      <ScanAddAllDialog
        open={open}
        onOpenChange={setOpen}
        collections={collections}
        count={10}
        targetId={targetId}
        onConfirm={onConfirm}
      />
    </>
  );
}

describe("ScanAddAllDialog", () => {
  it("commits to the inbox while the scanner only identifies", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "open-dialog" }));
    await user.click(screen.getByRole("button", { name: "Add 10 cards" }));

    expect(onConfirm).toHaveBeenCalledWith("inbox");
  });

  it("commits to the scanner's current target once one is picked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "pick-binder" }));
    await user.click(screen.getByRole("button", { name: "open-dialog" }));
    await user.click(screen.getByRole("button", { name: "Add 10 cards" }));

    expect(onConfirm).toHaveBeenCalledWith("binder");
  });

  it("follows a target switched between two openings", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "pick-binder" }));
    await user.click(screen.getByRole("button", { name: "open-dialog" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "pick-bulk" }));
    await user.click(screen.getByRole("button", { name: "open-dialog" }));
    await user.click(screen.getByRole("button", { name: "Add 10 cards" }));

    expect(onConfirm).toHaveBeenCalledWith("bulk");
  });

  it("offers to stay in identify-only mode when there is no target", async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "open-dialog" }));

    expect(screen.getByRole("button", { name: "Keep just identifying" })).toBeInTheDocument();
  });
});
