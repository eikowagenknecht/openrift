import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UseEmailNotificationsResult } from "@/hooks/use-email-notifications";

import { GroupNotificationsSection } from "./group-notifications-section";

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

describe("GroupNotificationsSection", () => {
  it("renders the join-request switch on, since the channel is opt-out", () => {
    render(<GroupNotificationsSection />);
    expect(screen.getByRole("switch", { name: "Join requests" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("turning it off calls setChannel with groupJoinRequests", async () => {
    render(<GroupNotificationsSection />);
    await userEvent.click(screen.getByRole("switch", { name: "Join requests" }));
    expect(setChannel).toHaveBeenCalledWith("groupJoinRequests", false);
  });

  it("turning it back on calls setChannel with true", async () => {
    hookValue = { ...hookValue, gates: { ...hookValue.gates, groupJoinRequests: false } };
    render(<GroupNotificationsSection />);
    await userEvent.click(screen.getByRole("switch", { name: "Join requests" }));
    expect(setChannel).toHaveBeenCalledWith("groupJoinRequests", true);
  });

  it("disables the switch while the saved values are loading", () => {
    hookValue = { ...hookValue, isLoading: true };
    render(<GroupNotificationsSection />);
    expect(screen.getByRole("switch", { name: "Join requests" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("disables the switch while saving", () => {
    hookValue = { ...hookValue, isSaving: true };
    render(<GroupNotificationsSection />);
    expect(screen.getByRole("switch", { name: "Join requests" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("renders the welcome switch on, since that channel is opt-out too", () => {
    render(<GroupNotificationsSection />);
    expect(screen.getByRole("switch", { name: "Welcome to a group" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("turning the welcome off calls setChannel with groupApprovals", async () => {
    render(<GroupNotificationsSection />);
    await userEvent.click(screen.getByRole("switch", { name: "Welcome to a group" }));
    expect(setChannel).toHaveBeenCalledWith("groupApprovals", false);
  });

  it("the two switches move independently", async () => {
    hookValue = { ...hookValue, gates: { ...hookValue.gates, groupApprovals: false } };
    render(<GroupNotificationsSection />);

    expect(screen.getByRole("switch", { name: "Join requests" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("switch", { name: "Welcome to a group" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});
