import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
    className,
  }: {
    children: ReactNode;
    to: string;
    search?: Record<string, unknown>;
    className?: string;
  }) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {})
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => [key, String(value)]),
    ).toString();
    return (
      <a href={query ? `${to}?${query}` : to} className={className}>
        {children}
      </a>
    );
  },
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  signIn: { email: vi.fn() },
  authClient: {
    sendVerificationEmail: vi.fn(),
    signIn: { emailOtp: vi.fn() },
    emailOtp: { sendVerificationOtp: vi.fn() },
  },
}));

// Stand-ins for the parts of the card that have nothing to do with the email
// field. Counting their renders is how we detect the whole tree rebuilding.
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

const { LoginForm } = await import("./login-form");

function renderLoginForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginForm emailPlaceholder="summoner@example.com" />
    </QueryClientProvider>,
  );
}

// Both tabs render an "Email" field and BaseUI can keep the outgoing panel
// mounted for a while, so pick the one the user can actually type into rather
// than indexing into the matches.
function activeEmailInput() {
  const active = screen
    .getAllByLabelText("Email")
    .find((input) => input.closest("[inert]") === null);
  if (!active) {
    throw new Error("no Email input in the active tab panel");
  }
  return active;
}

describe("LoginForm", () => {
  beforeEach(() => {
    shellRenders.card = 0;
    shellRenders.social = 0;
  });

  it("does not re-render the surrounding card while typing an email", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    const rendersAfterMount = { ...shellRenders };
    expect(rendersAfterMount.social).toBeGreaterThan(0);

    const email = activeEmailInput();
    await user.type(email, "jinx@example.com");

    // Regression: the email watch used to live in LoginForm, so all 16
    // characters re-rendered the card, both tab panels, and the social buttons.
    expect(shellRenders.card).toBe(rendersAfterMount.card);
    expect(shellRenders.social).toBe(rendersAfterMount.social);
    expect(email).toHaveValue("jinx@example.com");
  });

  it("keeps links in step with the typed email", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(activeEmailInput(), "vi@example.com");

    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/signup?email=vi%40example.com",
    );
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
      "href",
      "/reset-password?email=vi%40example.com",
    );
  });

  it("carries the email across a tab switch", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(activeEmailInput(), "caitlyn@example.com");
    await user.click(screen.getByRole("tab", { name: "Email code" }));

    expect(activeEmailInput()).toHaveValue("caitlyn@example.com");

    await user.clear(activeEmailInput());
    await user.type(activeEmailInput(), "ekko@example.com");
    await user.click(screen.getByRole("tab", { name: "Password" }));

    expect(activeEmailInput()).toHaveValue("ekko@example.com");
  });

  it("does not re-render the card while typing in the email-code tab", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await user.click(screen.getByRole("tab", { name: "Email code" }));
    const rendersAfterSwitch = { ...shellRenders };

    await user.type(activeEmailInput(), "ekko@example.com");

    expect(shellRenders.card).toBe(rendersAfterSwitch.card);
    expect(shellRenders.social).toBe(rendersAfterSwitch.social);
  });
});
