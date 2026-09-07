import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const shellRenders = { card: 0, social: 0 };
const navigate = vi.fn();

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
  useNavigate: () => navigate,
}));

vi.mock("@/features/account/lib/auth-client", () => ({
  signIn: { email: vi.fn() },
  authClient: {
    sendVerificationEmail: vi.fn(),
    signIn: { emailOtp: vi.fn() },
    emailOtp: { sendVerificationOtp: vi.fn() },
  },
}));

vi.mock("@/features/account/components/auth-form-shell", () => ({
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
const { signIn, authClient } = await import("@/features/account/lib/auth-client");

function renderLoginForm(props?: { redirectTo?: string }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginForm emailPlaceholder="summoner@example.com" redirectTo={props?.redirectTo} />
    </QueryClientProvider>,
  );
}

// BaseUI can keep the outgoing tab panel mounted, so pick the input the user can actually type into.
function activeEmailInput() {
  const active = screen
    .getAllByLabelText("Email")
    .find((input) => input.closest("[inert]") === null);
  if (!active) {
    throw new Error("no Email input in the active tab panel");
  }
  return active;
}

const sendVerificationOtp = vi.mocked(authClient.emailOtp.sendVerificationOtp);
const signInEmail = vi.mocked(signIn.email);

describe("LoginForm", () => {
  beforeEach(() => {
    shellRenders.card = 0;
    shellRenders.social = 0;
    navigate.mockReset();
    sendVerificationOtp.mockReset();
    signInEmail.mockReset();
  });

  it("does not re-render the surrounding card while typing an email", async () => {
    const user = userEvent.setup();
    renderLoginForm();

    const rendersAfterMount = { ...shellRenders };
    expect(rendersAfterMount.social).toBeGreaterThan(0);

    const email = activeEmailInput();
    await user.type(email, "jinx@example.com");

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

  it("stays on the email step when the sign-in code could not be sent", async () => {
    const user = userEvent.setup();
    sendVerificationOtp.mockResolvedValue({ error: { status: 429 } });
    renderLoginForm();

    await user.click(screen.getByRole("tab", { name: "Email code" }));
    await user.type(activeEmailInput(), "jinx@example.com");
    await user.click(screen.getByRole("button", { name: "Send code" }));

    expect(screen.getByText(/Too many requests/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send code" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
  });

  it("advances to the code step once the sign-in code is sent", async () => {
    const user = userEvent.setup();
    sendVerificationOtp.mockResolvedValue({ error: null });
    renderLoginForm();

    await user.click(screen.getByRole("tab", { name: "Email code" }));
    await user.type(activeEmailInput(), "jinx@example.com");
    await user.click(screen.getByRole("button", { name: "Send code" }));

    expect(screen.getByRole("button", { name: "Verify" })).toBeInTheDocument();
  });

  it("sends a verification code and routes to the page that can take it", async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({ error: { code: "EMAIL_NOT_VERIFIED" } });
    sendVerificationOtp.mockResolvedValue({ error: null });
    renderLoginForm({ redirectTo: "/collections" });

    await user.type(activeEmailInput(), "vi@example.com");
    await user.type(screen.getByLabelText("Password", { selector: "input" }), "hunter2hunter2");
    await user.click(screen.getByRole("button", { name: "Login" }));

    await user.click(screen.getByRole("button", { name: "Send a verification code" }));

    expect(sendVerificationOtp).toHaveBeenCalledWith({
      email: "vi@example.com",
      type: "email-verification",
    });
    expect(navigate).toHaveBeenCalledWith({
      to: "/verify-email",
      search: { email: "vi@example.com", redirect: "/collections" },
    });
  });

  it("reports a failed verification send instead of navigating", async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({ error: { code: "EMAIL_NOT_VERIFIED" } });
    sendVerificationOtp.mockResolvedValue({ error: { status: 429 } });
    renderLoginForm();

    await user.type(activeEmailInput(), "vi@example.com");
    await user.type(screen.getByLabelText("Password", { selector: "input" }), "hunter2hunter2");
    await user.click(screen.getByRole("button", { name: "Login" }));
    await user.click(screen.getByRole("button", { name: "Send a verification code" }));

    expect(screen.getByText(/Too many requests/u)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
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
