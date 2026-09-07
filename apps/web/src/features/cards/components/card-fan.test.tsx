import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardFan } from "./card-fan";

const COVERS = [
  { key: "a", imageId: "image-a" },
  { key: "b", imageId: "image-b" },
];

describe("CardFan", () => {
  it("renders one image per cover, up to the layout's slot count", () => {
    const { container } = render(<CardFan covers={COVERS} />);
    expect(container.querySelectorAll("img").length).toBe(2);
  });

  it("caps the fan at the largest layout when given more covers than slots", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      key: `cover-${index}`,
      imageId: `image-${index}`,
    }));
    const { container } = render(<CardFan covers={many} />);
    expect(container.querySelectorAll("img").length).toBe(4);
  });

  it("renders nothing for an empty cover list", () => {
    const { container } = render(<CardFan covers={[]} />);
    expect(container.querySelectorAll("img").length).toBe(0);
  });

  it("lazy-loads by default so off-screen tiles cost no bandwidth", () => {
    const { container } = render(<CardFan covers={COVERS} />);
    for (const img of container.querySelectorAll("img")) {
      expect(img.getAttribute("loading")).toBe("lazy");
      expect(img.getAttribute("fetchpriority")).toBeNull();
    }
  });

  it("loads eagerly at high priority when marked priority", () => {
    const { container } = render(<CardFan covers={COVERS} priority />);
    for (const img of container.querySelectorAll("img")) {
      expect(img.getAttribute("loading")).toBe("eager");
      expect(img.getAttribute("fetchpriority")).toBe("high");
    }
  });
});
