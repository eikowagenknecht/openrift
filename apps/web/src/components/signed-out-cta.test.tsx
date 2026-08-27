import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let currentUserId: string | null = null;
let currentHydrated = true;

vi.mock("@/lib/auth-session", () => ({
  useUserId: () => currentUserId,
}));

vi.mock("@/hooks/use-hydrated", () => ({
  useHydrated: () => currentHydrated,
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ href: "/lists/share/abc123" }),
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string;
    search: { redirect?: string };
    children: ReactNode;
  }) => (
    <a href={`${to}?redirect=${search.redirect ?? ""}`} {...rest}>
      {children}
    </a>
  ),
}));

const { PublicShareCta, SignedOutAuthButtons } = await import("./signed-out-cta");

beforeEach(() => {
  currentUserId = null;
  currentHydrated = true;
});

describe("SignedOutAuthButtons", () => {
  it("sends both links back to the page the visitor came from", () => {
    render(<SignedOutAuthButtons />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?redirect=/lists/share/abc123",
    );
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/signup?redirect=/lists/share/abc123",
    );
  });

  it("takes a custom sign-in label", () => {
    render(<SignedOutAuthButtons signInLabel="Sign in to request a spot" />);
    expect(screen.getByRole("link", { name: "Sign in to request a spot" })).toBeInTheDocument();
  });
});

describe("PublicShareCta", () => {
  it("prompts a visitor without an account", () => {
    render(
      <PublicShareCta title="Keep your own tradelist">Show what you have spare.</PublicShareCta>,
    );
    expect(screen.getByText("Keep your own tradelist")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a free account" })).toBeInTheDocument();
  });

  it("stays out of the way once someone is signed in", () => {
    currentUserId = "user-1";
    render(
      <PublicShareCta title="Keep your own tradelist">Show what you have spare.</PublicShareCta>,
    );
    expect(screen.queryByText("Keep your own tradelist")).not.toBeInTheDocument();
  });

  it("renders nothing before hydration, since the share page is cached for everyone", () => {
    currentHydrated = false;
    render(
      <PublicShareCta title="Keep your own tradelist">Show what you have spare.</PublicShareCta>,
    );
    expect(screen.queryByText("Keep your own tradelist")).not.toBeInTheDocument();
  });
});
