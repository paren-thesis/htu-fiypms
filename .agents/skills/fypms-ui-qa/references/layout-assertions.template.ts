// Copy to e2e/ui/helpers.ts. Playwright helpers for layout regressions.
import { expect, type Locator, type Page } from '@playwright/test';

export const widths = [375, 768, 1280] as const;

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page scrolls horizontally').toBeLessThanOrEqual(0);
}

export async function expectNoOverlap(a: Locator, b: Locator) {
  const [ra, rb] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  expect(ra && rb, 'both elements must be visible').toBeTruthy();
  const overlap = !(ra!.x + ra!.width <= rb!.x || rb!.x + rb!.width <= ra!.x || ra!.y + ra!.height <= rb!.y || rb!.y + rb!.height <= ra!.y);
  expect(overlap, 'elements overlap').toBe(false);
}

/** `above` must sit fully above `below` (e.g. tabs above the table) and share the same left edge column. */
export async function expectAbove(above: Locator, below: Locator) {
  const [ra, rb] = await Promise.all([above.boundingBox(), below.boundingBox()]);
  expect(ra && rb).toBeTruthy();
  expect(ra!.y + ra!.height, 'not above').toBeLessThanOrEqual(rb!.y + 1);
}

/** Element fully inside the viewport horizontally (catches clipped rings, cut-off nodes). */
export async function expectWithinViewportX(page: Page, el: Locator) {
  const box = await el.boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
}

/** At most one of border, ring (box-shadow spread) or outline is visible on the element. */
export async function expectSingleIndicator(el: Locator) {
  const count = await el.evaluate((node) => {
    const cs = getComputedStyle(node);
    const border = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
    const ring = /0px 0px 0px [1-9]\d*(\.\d+)?px/.test(cs.boxShadow);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    return [border, ring, outline].filter(Boolean).length;
  });
  expect(count, 'element stacks border, ring and/or outline').toBeLessThanOrEqual(1);
}

export async function expectTouchTarget(el: Locator, min = 44) {
  const box = await el.boundingBox();
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(min);
}
