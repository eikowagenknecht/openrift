import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/account/lib/auth-client", () => ({
  authClient: {
    updateUser: vi.fn(),
    emailOtp: {
      sendVerificationOtp: vi.fn(),
      requestEmailChange: vi.fn(),
      changeEmail: vi.fn(),
    },
  },
}));

const { AccountInfoSection } = await import("./account-info-section");
const { authClient } = await import("@/features/account/lib/auth-client");
const sendVerificationOtp = vi.mocked(authClient.emailOtp.sendVerificationOtp);

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountInfoSection
        defaultName="Riven Fan"
        defaultRiotId="rivenfan#EUW"
        userId="user-1"
        currentEmail="vi@example.com"
      />
    </QueryClientProvider>,
  );
}

async function startEmailChange(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("New email"), "jinx@example.com");
  await user.click(screen.getByRole("button", { name: "Send code to current email" }));
}

describe("AccountInfoSection email change", () => {
  beforeEach(() => {
    sendVerificationOtp.mockReset();
  });

  it("stays on the email field when the code could not be sent", async () => {
    const user = userEvent.setup();
    sendVerificationOtp.mockResolvedValue({ error: { status: 429 } });
    renderSection();

    await startEmailChange(user);

    expect(screen.getByText(/Too many requests/u)).toBeInTheDocument();
    expect(screen.queryByText(/Enter the 6-digit code sent to/u)).not.toBeInTheDocument();
  });

  it("asks for the code once one has been sent", async () => {
    const user = userEvent.setup();
    sendVerificationOtp.mockResolvedValue({ error: null });
    renderSection();

    await startEmailChange(user);

    expect(sendVerificationOtp).toHaveBeenCalledWith({
      email: "vi@example.com",
      type: "email-verification",
    });
    expect(screen.getByText(/Enter the 6-digit code sent to/u)).toBeInTheDocument();
  });

  it("reports a failed resend rather than looking like it worked", async () => {
    const user = userEvent.setup();
    sendVerificationOtp.mockResolvedValue({ error: null });
    renderSection();
    await startEmailChange(user);

    sendVerificationOtp.mockResolvedValue({ error: { status: 429 } });
    await user.click(screen.getByRole("button", { name: "Resend code" }));

    expect(screen.getByText(/Too many requests/u)).toBeInTheDocument();
  });

  it("resends to the current email, the only address it can reach", async () => {
    const user = userEvent.setup();
    sendVerificationOtp.mockResolvedValue({ error: null });
    renderSection();
    await startEmailChange(user);

    sendVerificationOtp.mockClear();
    await user.click(screen.getByRole("button", { name: "Resend code" }));

    expect(sendVerificationOtp).toHaveBeenCalledWith({
      email: "vi@example.com",
      type: "email-verification",
    });
  });
});
