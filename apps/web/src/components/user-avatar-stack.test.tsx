import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { UserAvatarStackMember } from "./user-avatar-stack";
import { UserAvatarStack } from "./user-avatar-stack";

function member(id: string, overrides?: Partial<UserAvatarStackMember>): UserAvatarStackMember {
  return { userId: id, userName: `User ${id}`, userImage: null, gravatarHash: "", ...overrides };
}

describe("UserAvatarStack", () => {
  it("renders one avatar per member and no overflow count when complete", () => {
    const { container, queryByText } = render(
      <UserAvatarStack members={[member("a"), member("b")]} />,
    );
    expect(container.querySelectorAll("[data-slot=avatar]")).toHaveLength(2);
    expect(queryByText(/^\+/u)).toBeNull();
  });

  it("shows the overflow count when totalCount exceeds the previews", () => {
    const { getByText } = render(
      <UserAvatarStack members={[member("a"), member("b")]} totalCount={17} />,
    );
    expect(getByText("+15")).toBeInTheDocument();
  });

  it("treats a totalCount smaller than the member list as no overflow", () => {
    const { queryByText } = render(
      <UserAvatarStack members={[member("a"), member("b")]} totalCount={1} />,
    );
    expect(queryByText(/^\+/u)).toBeNull();
  });

  it("renders empty (no avatars, no count) for an empty member list", () => {
    const { container, queryByText } = render(<UserAvatarStack members={[]} totalCount={0} />);
    expect(container.querySelectorAll("[data-slot=avatar]")).toHaveLength(0);
    expect(queryByText(/^\+/u)).toBeNull();
  });
});
