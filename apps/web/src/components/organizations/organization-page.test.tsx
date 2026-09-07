import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrganizationPage } from "./organization-page";

const { removeMutateAsync } = vi.hoisted(() => ({
  removeMutateAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/hooks/use-organizations", () => ({
  useOrganization: () => ({
    data: {
      id: "org-1",
      slug: "lgs-store",
      name: "LGS Store",
      description: null,
      ownerUserId: "owner-1",
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-06-01T10:00:00.000Z",
      viewerRole: "manager",
      members: [
        {
          userId: "member-1",
          name: "Bob Manager",
          role: "manager",
          joinedAt: "2026-06-01T10:00:00.000Z",
        },
      ],
    },
  }),
  useAddOrganizationMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveOrganizationMember: () => ({ mutateAsync: removeMutateAsync, isPending: false }),
  useUpdateOrganizationMemberRole: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Pulls in deck-check server wiring; stub it so the page renders in isolation.
vi.mock("@/components/deck-check/deck-check-keys-section", () => ({
  OrgDeckCheckKeysSection: () => <div>keys-section</div>,
}));

describe("OrganizationPage member removal", () => {
  beforeEach(() => {
    removeMutateAsync.mockClear();
  });

  it("opens a confirmation instead of removing the member immediately", async () => {
    const user = userEvent.setup();
    render(<OrganizationPage id="org-1" />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(removeMutateAsync).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Remove member");
  });

  it("removes the member only after the confirmation is accepted", async () => {
    const user = userEvent.setup();
    render(<OrganizationPage id="org-1" />);

    await user.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(removeMutateAsync).toHaveBeenCalledWith({ id: "org-1", userId: "member-1" });
  });
});
