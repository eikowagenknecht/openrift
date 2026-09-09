import type { CardSubmissionSummaryResponse } from "@openrift/shared/contracts/card-submissions";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const summary = vi.hoisted(() => ({
  data: undefined as CardSubmissionSummaryResponse | undefined,
  isPending: false,
}));

vi.mock("@/features/contribute/hooks/use-card-submission-summary", () => ({
  useCardSubmissionSummary: () => summary,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { YourSubmissionsCard } from "@/features/contribute/components/your-submissions-card";

function renderCard(state: {
  data?: CardSubmissionSummaryResponse;
  isPending?: boolean;
  className?: string;
}) {
  summary.data = state.data;
  summary.isPending = state.isPending ?? false;
  return render(<YourSubmissionsCard className={state.className} />);
}

describe("YourSubmissionsCard", () => {
  it("shows the pending and applied counts", () => {
    renderCard({ data: { pending: 2, accepted: 5 } });

    expect(screen.getByText("2 waiting for review")).toBeInTheDocument();
    expect(screen.getByText("5 applied")).toBeInTheDocument();
  });

  it("shows a skeleton instead of the counts while the query is pending", () => {
    const { container } = renderCard({ isPending: true });

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByText(/waiting for review/u)).not.toBeInTheDocument();
  });

  it("keeps only the link when the query errored", () => {
    renderCard({});

    expect(screen.queryByText(/waiting for review/u)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all" })).toBeInTheDocument();
  });

  it("passes className to the card", () => {
    const { container } = renderCard({ data: { pending: 1, accepted: 1 }, className: "lg:mt-10" });

    expect(container.querySelector('[data-slot="card"]')).toHaveClass("lg:mt-10");
  });

  it("links to the submissions page", () => {
    renderCard({ data: { pending: 0, accepted: 0 } });

    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute(
      "href",
      "/contribute/submissions",
    );
  });
});
