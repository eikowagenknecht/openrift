import type { Locator, Page } from "@playwright/test";

/**
 * Drag `source` onto `target` using mouse events that exceed dnd-kit's 8px
 * activation distance. A small intermediate move transitions the
 * PointerSensor from "pending" to "active" before the final move to the
 * target — a single long move sometimes misses the activation threshold.
 * @returns Nothing.
 */
export async function dndDrag(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("dnd source/target not visible");
  }
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 20, startY, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 20 });
  await page.mouse.up();
}

/**
 * Drag `source` to an absolute viewport coordinate. Useful for testing
 * "drop outside any zone" behavior where there is no target locator.
 * @returns Nothing.
 */
export async function dndDragToPoint(page: Page, source: Locator, endX: number, endY: number) {
  const sourceBox = await source.boundingBox();
  if (!sourceBox) {
    throw new Error("dnd source not visible");
  }
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 20, startY, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 20 });
  await page.mouse.up();
}
