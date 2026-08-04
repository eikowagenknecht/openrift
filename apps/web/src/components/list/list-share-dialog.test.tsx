import type { ListIntent } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

const shareMutate = vi.fn();
const unshareMutate = vi.fn();

// The dialog links to /profile#sharing; no router is mounted here, so render a
// plain anchor carrying the resolved target.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, hash, children }: { to: string; hash?: string; children?: ReactNode }) => (
    <a href={hash ? `${to}#${hash}` : to}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-lists", () => ({
  useShareList: () => ({ mutate: shareMutate, isPending: false }),
  useUnshareList: () => ({ mutate: unshareMutate, isPending: false }),
}));

vi.mock("@/lib/site-config", () => ({
  getSiteUrl: () => "https://openrift.test",
}));

const { ListShareDialog } = await import("./list-share-dialog");

const queryClient = new QueryClient();

function Harness({
  shareToken,
  onManageGroups = vi.fn(),
  intent = "wish",
}: {
  shareToken: string | null;
  onManageGroups?: () => void;
  intent?: ListIntent;
}) {
  const [open, setOpen] = useState(true);
  return (
    <QueryClientProvider client={queryClient}>
      <ListShareDialog
        listId="abc"
        listName="Holiday Targets"
        kind="card"
        intent={intent}
        tradeDefaults={{ pricePref: null, priceAbsoluteCents: null, tradeType: null }}
        currency={null}
        shareToken={shareToken}
        updatedAt="2026-06-09T00:00:00.000Z"
        entries={[]}
        open={open}
        onOpenChange={setOpen}
        onManageGroups={onManageGroups}
      />
    </QueryClientProvider>
  );
}

describe("ListShareDialog", () => {
  it("renders 'Create link' when the list is not yet shared", () => {
    render(<Harness shareToken={null} />);
    expect(screen.getByRole("button", { name: /create link/iu })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stop sharing/iu })).not.toBeInTheDocument();
  });

  it("triggers useShareList when 'Create link' is clicked", async () => {
    const user = userEvent.setup();
    shareMutate.mockClear();
    render(<Harness shareToken={null} />);
    await user.click(screen.getByRole("button", { name: /create link/iu }));
    expect(shareMutate).toHaveBeenCalledWith("abc");
  });

  it("renders the share URL and a Stop sharing button when shared", () => {
    render(<Harness shareToken="AbCdEfGhIjKl" />);
    const input = screen.getByDisplayValue("https://openrift.test/lists/share/AbCdEfGhIjKl");
    expect(input).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop sharing/iu })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create link/iu })).not.toBeInTheDocument();
  });

  it("triggers useUnshareList when 'Stop sharing' is clicked", async () => {
    const user = userEvent.setup();
    unshareMutate.mockClear();
    render(<Harness shareToken="AbCdEfGhIjKl" />);
    await user.click(screen.getByRole("button", { name: /stop sharing/iu }));
    expect(unshareMutate).toHaveBeenCalledWith("abc");
  });

  it("flips the link Copy button label to 'Copied' after clicking", async () => {
    const user = userEvent.setup();
    render(<Harness shareToken="AbCdEfGhIjKl" />);
    await user.click(screen.getByRole("button", { name: /^copy$/iu }));
    expect(screen.getByRole("button", { name: /^copied$/iu })).toBeInTheDocument();
  });

  it("shows the 'Post to a chat' controls whether or not the list is shared", () => {
    const { rerender } = render(<Harness shareToken={null} />);
    expect(screen.getByText(/post to a chat/iu)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy text/iu })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download image/iu })).toBeInTheDocument();

    rerender(<Harness shareToken="AbCdEfGhIjKl" />);
    expect(screen.getByText(/post to a chat/iu)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy text/iu })).toBeInTheDocument();
  });

  it("calls onManageGroups from the Group visibility cross-link", async () => {
    const user = userEvent.setup();
    const onManageGroups = vi.fn();
    render(<Harness shareToken={null} onManageGroups={onManageGroups} />);
    await user.click(screen.getByRole("button", { name: /group visibility/iu }));
    expect(onManageGroups).toHaveBeenCalledOnce();
  });

  it("points wish and trade lists at the profile's Public sharing section", () => {
    const { rerender } = render(<Harness shareToken={null} intent="wish" />);
    expect(screen.getByRole("link", { name: /public sharing/iu })).toHaveAttribute(
      "href",
      "/profile#sharing",
    );

    rerender(<Harness shareToken={null} intent="trade" />);
    expect(screen.getByRole("link", { name: /public sharing/iu })).toBeInTheDocument();
  });

  it("omits the bundle cross-link for organize lists, which the bundle excludes", () => {
    render(<Harness shareToken={null} intent="organize" />);
    expect(screen.queryByRole("link", { name: /public sharing/iu })).not.toBeInTheDocument();
  });
});
