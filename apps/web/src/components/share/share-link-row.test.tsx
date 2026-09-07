import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

import { ShareLinkRow } from "./share-link-row";

const URL = "https://openrift.app/lists/share/AbCdEf123456";
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue();
});

/**
 * user-event's setup installs its own `navigator.clipboard` stub, so the mock
 * has to be planted afterwards or the component writes to the stub instead.
 */
function setupUser() {
  const user = userEvent.setup();
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return user;
}

describe("ShareLinkRow", () => {
  it("shows the link in a read-only field named by its label", () => {
    render(<ShareLinkRow url={URL} label="Result reporting link" />);
    const field = screen.getByLabelText("Result reporting link");

    expect(field).toHaveValue(URL);
    expect(field).toHaveAttribute("readonly");
  });

  it("copies the link and confirms inline", async () => {
    const user = setupUser();
    render(<ShareLinkRow url={URL} label="Share link" />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(URL);
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
  });

  it("keeps the QR behind its toggle by default", async () => {
    const user = setupUser();
    render(<ShareLinkRow url={URL} label="Share link" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show QR code" }));

    expect(screen.getByRole("img", { name: "QR code for the share link" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide QR code" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the QR expanded when the surface asks for it", () => {
    render(<ShareLinkRow url={URL} label="Registration link" defaultQrOpen />);

    expect(
      screen.getByRole("img", { name: "QR code for the registration link" }),
    ).toBeInTheDocument();
  });

  it("drops the QR affordance entirely when hidden", () => {
    render(<ShareLinkRow url={URL} label="Share link" hideQr defaultQrOpen />);

    expect(screen.queryByRole("button", { name: /QR code/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders caller actions after the copy button", () => {
    render(<ShareLinkRow url={URL} label="Share link" actions={<Button>Rotate link</Button>} />);

    expect(screen.getByRole("button", { name: "Rotate link" })).toBeInTheDocument();
  });

  it("stays usable when the clipboard write is denied", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"));
    const user = setupUser();
    render(<ShareLinkRow url={URL} label="Share link" />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByLabelText("Share link")).toHaveValue(URL);
  });
});
