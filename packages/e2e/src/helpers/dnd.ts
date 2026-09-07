import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

// A small intermediate move transitions dnd-kit's PointerSensor from
// "pending" to "active" before the final move; a single long move sometimes
// misses its 8px activation threshold.
export async function dndDrag(page: Page, source: Locator, target: Locator) {
  await expect(source).toBeVisible({ timeout: 15_000 });
  await expect(target).toBeVisible({ timeout: 15_000 });
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

export async function dndDragToPoint(page: Page, source: Locator, endX: number, endY: number) {
  await expect(source).toBeVisible({ timeout: 15_000 });
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
