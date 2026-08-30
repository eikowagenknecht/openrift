import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UseEmailNotificationsResult } from "@/hooks/use-email-notifications";

import { AdminNotificationsSection } from "./admin-notifications-section";

const setChannel = vi.fn();
let hookValue: UseEmailNotificationsResult;

vi.mock("@/hooks/use-email-notifications", () => ({
  useEmailNotifications: () => hookValue,
}));

beforeEach(() => {
  setChannel.mockReset();
  hookValue = {
    gates: {
      tradeMatches: false,
      tradeRequests: true,
      tradeStatus: true,
      tradeRequestCadence: "5min",
      cardSubmissions: false,
      groupJoinRequests: true,
      groupApprovals: true,
    },
    isLoading: false,
    isSaving: false,
    setChannel,
    setCadence: vi.fn(),
  };
});

describe("AdminNotificationsSection", () => {
  it("renders the submission switch off when the admin hasn't opted in", () => {
    render(<AdminNotificationsSection />);
    expect(screen.getByRole("switch", { name: "New card submissions" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("turning it on calls setChannel with cardSubmissions", async () => {
    render(<AdminNotificationsSection />);
    await userEvent.click(screen.getByRole("switch", { name: "New card submissions" }));
    expect(setChannel).toHaveBeenCalledWith("cardSubmissions", true);
  });

  it("turning it off calls setChannel with false", async () => {
    hookValue = { ...hookValue, gates: { ...hookValue.gates, cardSubmissions: true } };
    render(<AdminNotificationsSection />);
    await userEvent.click(screen.getByRole("switch", { name: "New card submissions" }));
    expect(setChannel).toHaveBeenCalledWith("cardSubmissions", false);
  });

  it("disables the switch while the saved values are loading", () => {
    hookValue = { ...hookValue, isLoading: true };
    render(<AdminNotificationsSection />);
    expect(screen.getByRole("switch", { name: "New card submissions" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("disables the switch while saving", () => {
    hookValue = { ...hookValue, isSaving: true };
    render(<AdminNotificationsSection />);
    expect(screen.getByRole("switch", { name: "New card submissions" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
