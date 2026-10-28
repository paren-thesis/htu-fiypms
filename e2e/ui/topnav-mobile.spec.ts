import { test, expect } from '@playwright/test';
import {
  widths,
  expectNoHorizontalScroll,
  expectWithinViewportX,
  expectNoOverlap,
  expectTouchTarget,
  expectSingleIndicator,
} from './helpers';

test.describe('TopNav and Dashboard mobile responsiveness (375, 768, 1280px)', () => {
  for (const width of widths) {
    test(`TopNav controls and LifecycleStepper all fit within ${width}px viewport for multi-role Coordinator`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto('/dev/login');
      await page.locator('[data-testid="dev-login-staff-coordinator@htu.edu.gh"]').click();
      await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });

      const searchBtn = page.getByRole('button', { name: 'Open command palette' });
      const bellBtn = page.getByRole('button', { name: /Notifications/i });
      const roleBtn = page.getByRole('button', { name: 'Switch active role' });
      const avatarBtn = page.getByRole('button', { name: 'User account menu' });

      await expect(searchBtn).toBeVisible();
      await expect(bellBtn).toBeVisible();
      await expect(roleBtn).toBeVisible();
      await expect(avatarBtn).toBeVisible();

      // Every TopNav button must sit completely within [0, width]
      await expectWithinViewportX(page, searchBtn);
      await expectWithinViewportX(page, bellBtn);
      await expectWithinViewportX(page, roleBtn);
      await expectWithinViewportX(page, avatarBtn);

      // Adjacent TopNav buttons must not overlap
      await expectNoOverlap(searchBtn, bellBtn);
      await expectNoOverlap(bellBtn, roleBtn);
      await expectNoOverlap(roleBtn, avatarBtn);

      if (width < 768) {
        const menuBtn = page.getByRole('button', { name: 'Open navigation menu' });
        await expect(menuBtn).toBeVisible();
        await expectWithinViewportX(page, menuBtn);
        await expectNoOverlap(menuBtn, searchBtn);

        // Mobile touch targets >= 44px
        await expectTouchTarget(menuBtn, 44);
        await expectTouchTarget(searchBtn, 44);
        await expectTouchTarget(bellBtn, 44);
        await expectTouchTarget(roleBtn, 44);
        await expectTouchTarget(avatarBtn, 44);
      }

      // Every single step (1..6) of LifecycleStepper must be visible inside the viewport horizontally
      const stepItems = page.locator('nav[aria-label="Project Journey"] ol > li');
      await expect(stepItems).toHaveCount(6);
      for (let i = 0; i < 6; i++) {
        const stepItem = stepItems.nth(i);
        await expect(stepItem).toBeVisible();
        await expectWithinViewportX(page, stepItem);
      }

      const currentStepIndicator = page
        .locator('[aria-current="step"] > span:first-child')
        .first();
      await expectSingleIndicator(currentStepIndicator);
      await expectNoHorizontalScroll(page);

      await page.screenshot({
        path: `docs/screenshots/dashboard-${width}.png`,
        fullPage: false,
      });
    });
  }
});

