import type { TournamentDetailResponse } from "@openrift/shared/types/api/tournament";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { combineLocalDateTimeToUtc } from "@/features/tournaments/lib/tournament-display";

const updateMutateAsync = vi.fn();

vi.mock("@/features/tournaments/hooks/use-tournaments", () => ({
  useUpdateTournament: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@tanstack/react-router", () => ({
  createLink: (component: unknown) => component,
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));

const { DecksCard } = await import("./decks-card");

// Local wall-clock times through the card's own helper, so the expectations
// hold in any timezone. Mid-June sidesteps DST transitions in both hemispheres.
const endsAtUtc = combineLocalDateTimeToUtc("2026-06-11", "18:00") ?? "";
const closeAtUtc = combineLocalDateTimeToUtc("2026-06-09", "20:00") ?? "";

function makeDetail(overrides: Partial<TournamentDetailResponse> = {}): TournamentDetailResponse {
  return {
    id: "tournament-1",
    name: "Summoner Skirmish",
    deckSubmission: "required",
    deckPhase: "open",
    listLockMode: "on_submit",
    endsAt: endsAtUtc,
    submissionsCloseAt: null,
    ...overrides,
  } as unknown as TournamentDetailResponse;
}

function deadlineDate() {
  return screen.getByPlaceholderText("YYYY-MM-DD");
}

function deadlineTime() {
  return screen.getByLabelText("Deadline time (24h)");
}

beforeEach(() => {
  updateMutateAsync.mockClear();
  updateMutateAsync.mockResolvedValue(undefined);
});

describe("DecksCard deadline visibility", () => {
  it("hides the deadline block when no decks are collected", () => {
    render(<DecksCard detail={makeDetail({ deckSubmission: "none" })} locked={false} />);

    expect(screen.queryByPlaceholderText("YYYY-MM-DD")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Deadline time (24h)")).not.toBeInTheDocument();
  });

  it.each(["optional", "required"] as const)(
    "shows the deadline block for %s decks",
    (deckSubmission) => {
      render(<DecksCard detail={makeDetail({ deckSubmission })} locked={false} />);

      expect(screen.getByPlaceholderText("YYYY-MM-DD")).toBeInTheDocument();
      expect(screen.getByLabelText("Deadline time (24h)")).toBeInTheDocument();
    },
  );

  it("shows a stored deadline as local date and time parts", () => {
    render(<DecksCard detail={makeDetail({ submissionsCloseAt: closeAtUtc })} locked={false} />);

    expect(deadlineDate()).toHaveValue("2026-06-09");
    expect(deadlineTime()).toHaveValue("20:00");
  });
});

describe("DecksCard deadline validation", () => {
  it("keeps Save disabled until the deadline changes", () => {
    render(<DecksCard detail={makeDetail()} locked={false} />);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("rejects a deadline with only one part filled", async () => {
    const user = userEvent.setup();
    render(<DecksCard detail={makeDetail()} locked={false} />);

    await user.type(deadlineTime(), "20:00");

    expect(screen.getByText(/or clear both/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("rejects a deadline that falls after the tournament ends", async () => {
    const user = userEvent.setup();
    render(<DecksCard detail={makeDetail()} locked={false} />);

    await user.type(deadlineDate(), "2026-06-12");
    await user.type(deadlineTime(), "09:00");

    expect(screen.getByText(/at or before the tournament ends/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("accepts a deadline exactly at the end", async () => {
    const user = userEvent.setup();
    render(<DecksCard detail={makeDetail()} locked={false} />);

    await user.type(deadlineDate(), "2026-06-11");
    await user.type(deadlineTime(), "18:00");

    expect(screen.queryByText(/at or before the tournament ends/u)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("accepts any deadline when the tournament has no end", async () => {
    const user = userEvent.setup();
    render(<DecksCard detail={makeDetail({ endsAt: null })} locked={false} />);

    await user.type(deadlineDate(), "2027-01-01");
    await user.type(deadlineTime(), "09:00");

    expect(screen.queryByText(/at or before the tournament ends/u)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("explains that a blank deadline keeps lists open", () => {
    render(<DecksCard detail={makeDetail()} locked={false} />);

    expect(screen.getByText(/until you close the deck phase/u)).toBeInTheDocument();
  });
});

describe("DecksCard deadline saving", () => {
  it("stores the deadline as a UTC instant", async () => {
    const user = userEvent.setup();
    render(<DecksCard detail={makeDetail()} locked={false} />);

    await user.type(deadlineDate(), "2026-06-09");
    await user.type(deadlineTime(), "20:00");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      submissionsCloseAt: closeAtUtc,
    });
  });

  it("stores no deadline when both parts are cleared", async () => {
    const user = userEvent.setup();
    render(<DecksCard detail={makeDetail({ submissionsCloseAt: closeAtUtc })} locked={false} />);

    await user.clear(deadlineDate());
    await user.clear(deadlineTime());
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      submissionsCloseAt: null,
    });
  });
});

describe("DecksCard edit lock", () => {
  it.each([
    ["at_deadline", "true"],
    ["on_submit", "false"],
  ] as const)("reflects %s as the edit toggle being %s", (listLockMode, ariaChecked) => {
    render(<DecksCard detail={makeDetail({ listLockMode })} locked={false} />);

    expect(
      screen.getByRole("switch", { name: /edit their decks after submitting/u }),
    ).toHaveAttribute("aria-checked", ariaChecked);
  });

  it("switches the lock mode when toggled off", async () => {
    const user = userEvent.setup();
    render(<DecksCard detail={makeDetail({ listLockMode: "at_deadline" })} locked={false} />);

    await user.click(screen.getByRole("switch", { name: /edit their decks after submitting/u }));

    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      listLockMode: "on_submit",
    });
  });
});

describe("DecksCard locked state", () => {
  it("disables the deadline controls on a cancelled tournament", () => {
    render(<DecksCard detail={makeDetail()} locked />);

    expect(deadlineDate()).toBeDisabled();
    expect(deadlineTime()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
