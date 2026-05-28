import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { items: [{ groupId: "g1", groupSlug: "alpha", groupName: "Alpha" }] },
  }),
}));

// createServerFn runs a builder chain at module load; stub it so importing the
// component doesn't pull in the real server-fn runtime.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      inputValidator: () => builder,
      middleware: () => builder,
      handler: () => vi.fn(),
    };
    return builder;
  },
  createMiddleware: () => ({ server: () => ({}) }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "user-1",
}));

const { ListGroupSharesBadge } = await import("./list-group-shares-badge");

describe("ListGroupSharesBadge", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // Regression: PopoverTrigger defaults to nativeButton:true, but it renders a
  // <Badge> (a <span>). Without nativeButton={false}, Base UI logs an
  // accessibility warning about a non-native button being used as a trigger.
  it("renders the trigger without a Base UI nativeButton warning", () => {
    render(<ListGroupSharesBadge listId="list-1" />);
    const logged = [...errorSpy.mock.calls, ...warnSpy.mock.calls].flat().join(" ");
    expect(logged).not.toContain("nativeButton");
  });
});
