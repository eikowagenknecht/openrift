import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    ...props
  }: {
    children: ReactNode;
    to: string;
    search?: Record<string, unknown>;
  }) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {}).map(([key, value]) => [key, String(value)]),
    ).toString();
    return (
      <a href={query ? `${to}?${query}` : to} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { listAccounts: vi.fn(), changePassword: vi.fn() },
}));

const { PasswordSection } = await import("./password-section");
const { authClient } = await import("@/lib/auth-client");
const listAccounts = vi.mocked(authClient.listAccounts);

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PasswordSection currentEmail="vi@example.com" />
    </QueryClientProvider>,
  );
}

describe("PasswordSection", () => {
  beforeEach(() => {
    listAccounts.mockReset();
  });

  it("offers to set a password when only a social provider is linked", async () => {
    listAccounts.mockResolvedValue({ data: [{ providerId: "google" }], error: null });
    renderSection();

    expect(await screen.findByRole("button", { name: "Set a password" })).toHaveAttribute(
      "href",
      "/reset-password?email=vi%40example.com",
    );
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  });

  it("offers the change form once a password exists", async () => {
    listAccounts.mockResolvedValue({
      data: [{ providerId: "credential" }, { providerId: "google" }],
      error: null,
    });
    renderSection();

    expect(await screen.findByLabelText("Current password")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set a password" })).not.toBeInTheDocument();
  });

  it("falls back to the change form when the account list cannot be read", async () => {
    listAccounts.mockResolvedValue({ data: null, error: { message: "boom" } });
    renderSection();

    expect(await screen.findByLabelText("Current password")).toBeInTheDocument();
  });
});
