import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Regression coverage: the Send invite handler used to
// `await invite.mutateAsync(...)` without a catch, so an expected API failure
// (404 "No user with that email") escaped the click handler as an unhandled
// rejection. The real hook wraps a server fn; replace it with a plain
// react-query mutation whose mutationFn the tests control.
let inviteImpl: (vars: { slug: string; email: string }) => Promise<unknown>;
const mutationSpy = vi.fn((vars: { slug: string; email: string }) => inviteImpl(vars));

vi.mock("@/hooks/use-friend-groups", () => ({
  useInviteFriendByEmail: () => useMutation({ mutationFn: mutationSpy }),
}));

const { InviteByEmailForm } = await import("./invite-by-email-form");

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <InviteByEmailForm slug="my-group" />
    </QueryClientProvider>,
  );
}

describe("InviteByEmailForm", () => {
  it("sends the trimmed email and clears the input on success", async () => {
    inviteImpl = () => Promise.resolve(undefined);
    mutationSpy.mockClear();
    renderForm();

    const input = screen.getByPlaceholderText("friend@example.com");
    await userEvent.type(input, " friend@example.com ");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(mutationSpy).toHaveBeenCalledWith(
      { slug: "my-group", email: "friend@example.com" },
      expect.anything(), // react-query's mutation function context
    );
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("keeps the typed email and does not leak a rejection when the invite fails", async () => {
    // With the old mutateAsync version this test fails: the rejection escapes
    // the click handler and Vitest reports it as an unhandled error.
    inviteImpl = () => Promise.reject(new Error("No user with that email"));
    mutationSpy.mockClear();
    renderForm();

    const input = screen.getByPlaceholderText("friend@example.com");
    await userEvent.type(input, "nobody@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(mutationSpy).toHaveBeenCalled());
    // The input keeps its value so the user can correct the address.
    expect(input).toHaveValue("nobody@example.com");
  });

  it("disables the button while the input is empty", () => {
    inviteImpl = () => Promise.resolve(undefined);
    renderForm();

    expect(screen.getByRole("button", { name: "Send invite" })).toBeDisabled();
  });
});
