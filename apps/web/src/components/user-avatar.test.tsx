import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UserAvatar } from "./user-avatar";

describe("UserAvatar", () => {
  it("renders the initials fallback when nothing is provided", () => {
    const { container } = render(<UserAvatar name="Ada Lovelace" />);
    expect(container.textContent).toBe("AL");
  });

  it("renders without crashing for the common prop shapes", () => {
    // BaseUI's AvatarImage only injects an <img> once the image loads, and
    // jsdom never loads images: only the fallback shell renders.
    const { container: hashOnly } = render(
      <UserAvatar name="Ada Lovelace" gravatarHash="abc123" />,
    );
    expect(hashOnly.querySelector('[data-slot="avatar-fallback"]')).not.toBeNull();

    const { container: imageAndHash } = render(
      <UserAvatar name="Ada" gravatarHash="abc123" image="https://example.com/me.png" />,
    );
    expect(imageAndHash.querySelector('[data-slot="avatar-fallback"]')).not.toBeNull();
  });
});
