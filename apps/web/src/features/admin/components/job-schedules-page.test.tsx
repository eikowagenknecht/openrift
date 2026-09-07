import type { JobScheduleView } from "@openrift/shared/contracts/admin/job-schedules";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

// The top bar reaches for the admin sidebar context, which this page does not
// otherwise need.
vi.mock("@/features/admin/components/admin-page-top-bar", () => ({
  AdminPageTopBar: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
}));

const captured = {
  jobs: [] as JobScheduleView[],
  set: [] as { kind: string; schedule: string }[],
  disabled: [] as string[],
  ran: [] as string[],
  enabledSuggested: 0,
  runStatus: "running" as "running" | "already_running",
};

vi.mock("@/features/admin/hooks/use-job-schedules", () => ({
  useJobSchedules: () => ({ data: { jobs: captured.jobs } }),
  useSetJobSchedule: () => ({
    mutate: (vars: { kind: string; schedule: string }) => captured.set.push(vars),
    isPending: false,
  }),
  useDisableJobSchedule: () => ({
    mutate: (vars: { kind: string }) => captured.disabled.push(vars.kind),
    isPending: false,
  }),
  useEnableSuggestedJobSchedules: () => ({
    mutate: () => {
      captured.enabledSuggested += 1;
    },
    isPending: false,
  }),
  useRunJobNow: () => ({
    mutateAsync: (vars: { kind: string }) => {
      captured.ran.push(vars.kind);
      return Promise.resolve({ runId: "run-1", status: captured.runStatus });
    },
    isPending: false,
  }),
}));

const { toast } = await import("sonner");
const { JobSchedulesPage } = await import("./job-schedules-page");

function job(overrides: Partial<JobScheduleView> = {}): JobScheduleView {
  return {
    kind: "meta.uvsgames_sync",
    title: "UVS Games sync",
    description: "Mirror new events from the UVS Games calendar.",
    suggestedSchedule: "0 3 * * *",
    schedule: null,
    available: true,
    unavailableReason: null,
    nextRun: null,
    lastRun: null,
    updatedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  captured.jobs = [];
  captured.set = [];
  captured.disabled = [];
  captured.ran = [];
  captured.enabledSuggested = 0;
  captured.runStatus = "running";
  vi.clearAllMocks();
});

describe("JobSchedulesPage", () => {
  it("shows a job with no schedule as off, alongside its suggestion", () => {
    captured.jobs = [job()];
    render(<JobSchedulesPage />);

    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText("0 3 * * *")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run now" })).not.toBeInTheDocument();
  });

  it("writes the suggested expression when enabling a job", async () => {
    const user = userEvent.setup();
    captured.jobs = [job()];
    render(<JobSchedulesPage />);

    await user.click(screen.getByRole("button", { name: "Enable suggested" }));

    expect(captured.set).toEqual([{ kind: "meta.uvsgames_sync", schedule: "0 3 * * *" }]);
  });

  it("saves an edited expression, trimmed", async () => {
    const user = userEvent.setup();
    captured.jobs = [job({ schedule: "0 4 * * *" })];
    render(<JobSchedulesPage />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const input = screen.getByLabelText("Cron expression");
    expect(input).toHaveValue("0 4 * * *");

    await user.clear(input);
    await user.type(input, "  15 * * * *  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(captured.set).toEqual([{ kind: "meta.uvsgames_sync", schedule: "15 * * * *" }]);
  });

  it("blocks saving an empty expression", async () => {
    const user = userEvent.setup();
    captured.jobs = [job({ schedule: "0 4 * * *" })];
    render(<JobSchedulesPage />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Cron expression"));

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(captured.set).toEqual([]);
  });

  it("disables a scheduled job", async () => {
    const user = userEvent.setup();
    captured.jobs = [job({ schedule: "0 4 * * *" })];
    render(<JobSchedulesPage />);

    await user.click(screen.getByRole("button", { name: "Disable" }));

    expect(captured.disabled).toEqual(["meta.uvsgames_sync"]);
  });

  it("reports a started run and one that was already running", async () => {
    const user = userEvent.setup();
    captured.jobs = [job({ schedule: "0 4 * * *" })];
    render(<JobSchedulesPage />);

    await user.click(screen.getByRole("button", { name: "Run now" }));
    expect(captured.ran).toEqual(["meta.uvsgames_sync"]);
    expect(toast.success).toHaveBeenCalledWith("Started");

    captured.runStatus = "already_running";
    await user.click(screen.getByRole("button", { name: "Run now" }));
    expect(toast.info).toHaveBeenCalledWith("Already running");
  });

  it("keeps an unavailable job off and explains why", () => {
    captured.jobs = [
      job({ available: false, unavailableReason: "DISCORD_WEBHOOK_URL is not set" }),
    ];
    render(<JobSchedulesPage />);

    expect(screen.getByText("DISCORD_WEBHOOK_URL is not set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable suggested" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  });

  it("only offers enable-all while an available job is still off", async () => {
    const user = userEvent.setup();
    captured.jobs = [job(), job({ kind: "meta.playloltcg_sync", schedule: "0 5 * * *" })];
    render(<JobSchedulesPage />);

    await user.click(screen.getByRole("button", { name: "Enable all suggested" }));
    expect(captured.enabledSuggested).toBe(1);
  });

  it("stops offering enable-all once every available job is scheduled", () => {
    captured.jobs = [
      job({ schedule: "0 3 * * *" }),
      job({ kind: "meta.playloltcg_sync", available: false, unavailableReason: "No API key" }),
    ];
    render(<JobSchedulesPage />);

    expect(screen.getByRole("button", { name: "Enable all suggested" })).toBeDisabled();
  });
});
