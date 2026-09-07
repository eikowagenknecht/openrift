import type { TournamentDetailResponse } from "@openrift/shared/types/api/tournament";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { combineLocalDateTimeToUtc } from "@/features/tournaments/lib/tournament-display";

const updateMutateAsync = vi.fn();
const toastError = vi.fn();

vi.mock("@/features/tournaments/hooks/use-tournaments", () => ({
  useUpdateTournament: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

const { ScheduleCard } = await import("./schedule-card");

// Mid-June avoids every DST transition in both hemispheres, so the local-time
// round trip through combineLocalDateTimeToUtc is exact regardless of the suite's timezone.
const START_DATE = "2026-06-10";
const START_TIME = "10:00";
const startsAtUtc = combineLocalDateTimeToUtc(START_DATE, START_TIME) ?? "";
const endsAtUtc = combineLocalDateTimeToUtc("2026-06-11", "18:00") ?? "";

function makeDetail(overrides: Partial<TournamentDetailResponse> = {}): TournamentDetailResponse {
  return {
    id: "tournament-1",
    name: "Summoner Skirmish",
    startsAt: startsAtUtc,
    endsAt: null,
    ...overrides,
  } as unknown as TournamentDetailResponse;
}

function dateInputs() {
  return screen.getAllByPlaceholderText("YYYY-MM-DD");
}

beforeEach(() => {
  updateMutateAsync.mockClear();
  updateMutateAsync.mockResolvedValue(undefined);
  toastError.mockClear();
});

describe("ScheduleCard initial state", () => {
  it("shows the stored instants as local date and time parts", () => {
    render(
      <ScheduleCard
        detail={makeDetail({ endsAt: endsAtUtc })}
        locked={false}
        canEndEarly={false}
      />,
    );

    expect(dateInputs()[0]).toHaveValue(START_DATE);
    expect(screen.getByLabelText("Start time (24h)")).toHaveValue(START_TIME);
    expect(dateInputs()[1]).toHaveValue("2026-06-11");
    expect(screen.getByLabelText("End time (24h)")).toHaveValue("18:00");
  });

  it("leaves both end parts blank when the tournament has no end", () => {
    render(<ScheduleCard detail={makeDetail()} locked={false} canEndEarly={false} />);

    expect(dateInputs()[1]).toHaveValue("");
    expect(screen.getByLabelText("End time (24h)")).toHaveValue("");
  });

  it("keeps Save disabled until the schedule actually changes", () => {
    render(<ScheduleCard detail={makeDetail()} locked={false} canEndEarly={false} />);

    expect(screen.getByRole("button", { name: "Save schedule" })).toBeDisabled();
  });
});

describe("ScheduleCard validation", () => {
  it("rejects an end that falls before the start", async () => {
    const user = userEvent.setup();
    render(<ScheduleCard detail={makeDetail()} locked={false} canEndEarly={false} />);

    await user.type(dateInputs()[1]!, START_DATE);
    await user.type(screen.getByLabelText("End time (24h)"), "09:00");

    expect(screen.getByText(/end must be at or after the start/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save schedule" })).toBeDisabled();
  });

  it("rejects an end with only one part filled", async () => {
    const user = userEvent.setup();
    render(<ScheduleCard detail={makeDetail()} locked={false} canEndEarly={false} />);

    await user.type(dateInputs()[1]!, "2026-06-11");

    expect(screen.getByText(/or leave both blank/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save schedule" })).toBeDisabled();
  });

  it("rejects a malformed start time", async () => {
    const user = userEvent.setup();
    render(<ScheduleCard detail={makeDetail()} locked={false} canEndEarly={false} />);

    await user.clear(screen.getByLabelText("Start time (24h)"));
    await user.type(screen.getByLabelText("Start time (24h)"), "25:00");

    expect(screen.getByText(/Enter a date \(YYYY-MM-DD\) and a 24-hour time/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save schedule" })).toBeDisabled();
  });

  it("treats an end equal to the start as valid", async () => {
    const user = userEvent.setup();
    render(<ScheduleCard detail={makeDetail()} locked={false} canEndEarly={false} />);

    await user.type(dateInputs()[1]!, START_DATE);
    await user.type(screen.getByLabelText("End time (24h)"), START_TIME);

    expect(screen.queryByText(/end must be at or after the start/u)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save schedule" })).toBeEnabled();
  });
});

describe("ScheduleCard saving", () => {
  it("stores the edited start as a UTC instant", async () => {
    const user = userEvent.setup();
    render(<ScheduleCard detail={makeDetail()} locked={false} canEndEarly={false} />);

    await user.clear(screen.getByLabelText("Start time (24h)"));
    await user.type(screen.getByLabelText("Start time (24h)"), "11:30");
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      startsAt: combineLocalDateTimeToUtc(START_DATE, "11:30"),
      endsAt: null,
    });
  });

  it("stores no end when both end parts are cleared", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleCard
        detail={makeDetail({ endsAt: endsAtUtc })}
        locked={false}
        canEndEarly={false}
      />,
    );

    await user.clear(dateInputs()[1]!);
    await user.clear(screen.getByLabelText("End time (24h)"));
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      startsAt: startsAtUtc,
      endsAt: null,
    });
  });

  it("leaves a failed save to the global mutation error toast", async () => {
    const user = userEvent.setup();
    updateMutateAsync.mockRejectedValue(new Error("Schedule conflicts with another round"));
    render(<ScheduleCard detail={makeDetail()} locked={false} canEndEarly={false} />);

    await user.clear(screen.getByLabelText("Start time (24h)"));
    await user.type(screen.getByLabelText("Start time (24h)"), "11:30");
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("ScheduleCard end-now action", () => {
  it("offers End now while the tournament can still be ended", () => {
    render(<ScheduleCard detail={makeDetail()} locked={false} canEndEarly />);

    expect(screen.getByRole("button", { name: "End now" })).toBeInTheDocument();
  });

  it("hides End now once the tournament is over", () => {
    render(<ScheduleCard detail={makeDetail()} locked={false} canEndEarly={false} />);

    expect(screen.queryByRole("button", { name: "End now" })).not.toBeInTheDocument();
  });
});

describe("ScheduleCard locked state", () => {
  it("disables the inputs and explains why on a cancelled tournament", () => {
    render(<ScheduleCard detail={makeDetail()} locked canEndEarly={false} />);

    expect(screen.getByLabelText("Start time (24h)")).toBeDisabled();
    expect(screen.getByLabelText("End time (24h)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save schedule" })).toBeDisabled();
    expect(screen.getByText(/cancelled and read-only/u)).toBeInTheDocument();
  });
});
