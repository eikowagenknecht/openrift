import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UseEmailNotificationsResult } from "@/hooks/use-email-notifications";

import { EmailNotificationsControls } from "./email-notifications-controls";

const setChannel = vi.fn();
const setCadence = vi.fn();
let hookValue: UseEmailNotificationsResult;

vi.mock("@/hooks/use-email-notifications", () => ({
  useEmailNotifications: () => hookValue,
}));

beforeEach(() => {
  setChannel.mockReset();
  setCadence.mockReset();
  hookValue = {
    // Defaults for an absent preference: request on, digest off, default cadence.
    gates: { tradeMatches: false, tradeRequests: true, tradeRequestCadence: "5min" },
    isLoading: false,
    isSaving: false,
    setChannel,
    setCadence,
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

  it("shows the current cadence and picking a new one calls setCadence", async () => {
    render(<EmailNotificationsControls />);
    const frequency = screen.getByLabelText("Frequency");
    expect(frequency).toHaveTextContent("Every 5 minutes");

    await userEvent.click(frequency);
    await userEvent.click(screen.getByRole("option", { name: "Instant" }));
    expect(setCadence).toHaveBeenCalledWith("instant");
  });

  it("disables the frequency control when trade-request emails are off", () => {
    hookValue = { ...hookValue, gates: { ...hookValue.gates, tradeRequests: false } };
    render(<EmailNotificationsControls />);
    expect(screen.getByLabelText("Frequency")).toBeDisabled();
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
