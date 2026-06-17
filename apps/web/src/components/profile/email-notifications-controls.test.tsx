import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UseEmailNotificationsResult } from "@/hooks/use-email-notifications";

import { EmailNotificationsControls } from "./email-notifications-controls";

const setChannel = vi.fn();
let hookValue: UseEmailNotificationsResult;

vi.mock("@/hooks/use-email-notifications", () => ({
  useEmailNotifications: () => hookValue,
}));

beforeEach(() => {
  setChannel.mockReset();
  hookValue = {
    // Defaults for an absent preference: request on, digest off.
    gates: { tradeMatches: false, tradeRequests: true },
    isLoading: false,
    isSaving: false,
    setChannel,
  };
});

describe("EmailNotificationsControls", () => {
  it("renders the request switch on and the digest switch off when the key is absent", () => {
    render(<EmailNotificationsControls />);
    expect(screen.getByRole("switch", { name: "Trade requests" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("switch", { name: "Daily match digest" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("turning on the digest calls setChannel with tradeMatches", async () => {
    render(<EmailNotificationsControls />);
    await userEvent.click(screen.getByRole("switch", { name: "Daily match digest" }));
    expect(setChannel).toHaveBeenCalledWith("tradeMatches", true);
  });

  it("turning off the request email calls setChannel with tradeRequests", async () => {
    render(<EmailNotificationsControls />);
    await userEvent.click(screen.getByRole("switch", { name: "Trade requests" }));
    expect(setChannel).toHaveBeenCalledWith("tradeRequests", false);
  });

  it("disables both switches while saving", () => {
    hookValue = { ...hookValue, isSaving: true };
    render(<EmailNotificationsControls />);
    expect(screen.getByRole("switch", { name: "Trade requests" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("switch", { name: "Daily match digest" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("disables both switches while the saved values are loading", () => {
    hookValue = { ...hookValue, isLoading: true };
    render(<EmailNotificationsControls />);
    expect(screen.getByRole("switch", { name: "Trade requests" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("switch", { name: "Daily match digest" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
