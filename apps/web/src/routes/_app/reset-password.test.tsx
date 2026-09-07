import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let search: { email: string } = { email: "" };
let PageComponent: (() => ReactNode) | undefined;

vi.mock("@tanstack/react-router", () => ({
  createLazyFileRoute: () => (options: { component: () => ReactNode }) => {
    PageComponent = options.component;
    return {
      useSearch: () => search,
      useLoaderData: () => ({ emailPlaceholder: "summoner@example.com" }),
    };
  },
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: vi.fn(), resetPassword: vi.fn() },
  },
}));

await import("./reset-password.lazy");
const { authClient } = await import("@/lib/auth-client");
const sendVerificationOtp = vi.mocked(authClient.emailOtp.sendVerificationOtp);

function renderResetPassword() {
  if (!PageComponent) {
    throw new Error("reset-password.lazy did not register a component");
  }
  return render(<PageComponent />);
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    search = { email: "" };
    sendVerificationOtp.mockReset();
  });

  it("starts on the email step with a prefilled address and sends nothing", () => {
    search = { email: "vi@example.com" };
    renderResetPassword();

    expect(screen.getByLabelText("Email")).toHaveValue("vi@example.com");
    expect(screen.getByRole("button", { name: "Send code" })).toBeInTheDocument();
    expect(screen.queryByText(/Enter the 6-digit code/u)).not.toBeInTheDocument();
    expect(sendVerificationOtp).not.toHaveBeenCalled();
  });

  it("reaches the code step once a code is actually sent", async () => {
    const user = userEvent.setup();
    search = { email: "vi@example.com" };
    sendVerificationOtp.mockResolvedValue({ error: null });
    renderResetPassword();

    await user.click(screen.getByRole("button", { name: "Send code" }));

    expect(sendVerificationOtp).toHaveBeenCalledWith({
      email: "vi@example.com",
      type: "forget-password",
    });
    expect(screen.getByText(/Enter the 6-digit code/u)).toBeInTheDocument();
  });

  it("stays on the email step when the send fails", async () => {
    const user = userEvent.setup();
    search = { email: "vi@example.com" };
    sendVerificationOtp.mockResolvedValue({ error: { status: 429 } });
    renderResetPassword();

    await user.click(screen.getByRole("button", { name: "Send code" }));

    expect(screen.getByText(/Too many requests/u)).toBeInTheDocument();
    expect(screen.queryByText(/Enter the 6-digit code/u)).not.toBeInTheDocument();
  });
});
