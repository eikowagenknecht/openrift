import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const shellRenders = { card: 0, social: 0 };

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: ReactNode;
    to: string;
    search?: Record<string, unknown>;
  }) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {})
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => [key, String(value)]),
    ).toString();
    return <a href={query ? `${to}?${query}` : to}>{children}</a>;
  },
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  signUp: { email: vi.fn() },
}));

vi.mock("@/components/auth-form-shell", () => ({
  AuthFormCard: ({ children }: { children: ReactNode }) => {
    shellRenders.card += 1;
    return <div>{children}</div>;
  },
  SocialAuthButtons: () => {
    shellRenders.social += 1;
    return <div data-slot="social" />;
  },
}));

const { SignupForm } = await import("./signup-form");

describe("SignupForm", () => {
  beforeEach(() => {
    shellRenders.card = 0;
    shellRenders.social = 0;
  });

  it("does not re-render the surrounding card while typing an email", async () => {
    const user = userEvent.setup();
    render(<SignupForm emailPlaceholder="summoner@example.com" />);

    const rendersAfterMount = { ...shellRenders };
    expect(rendersAfterMount.social).toBeGreaterThan(0);

    const email = screen.getByLabelText("Email");
    await user.type(email, "jinx@example.com");

    expect(shellRenders.card).toBe(rendersAfterMount.card);
    expect(shellRenders.social).toBe(rendersAfterMount.social);
    expect(email).toHaveValue("jinx@example.com");
  });

  it("keeps the sign-in link in step with the typed email", async () => {
    const user = userEvent.setup();
    render(<SignupForm emailPlaceholder="summoner@example.com" />);

    await user.type(screen.getByLabelText("Email"), "vi@example.com");

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?email=vi%40example.com",
    );
  });
});
