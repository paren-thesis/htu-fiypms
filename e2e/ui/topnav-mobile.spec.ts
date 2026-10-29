import { test, expect } from '@playwright/test';
import {
  widths,
  expectNoHorizontalScroll,
  expectWithinViewportX,
  expectNoOverlap,
  expectTouchTarget,
  expectSingleIndicator,
} from './helpers';

test.describe('Login, TopNav, Dashboard, and Staff Whitelist Sheet responsiveness (375, 768, 1280px)', () => {
  for (const width of widths) {
    test(`Login page, TopNav controls, LifecycleStepper, and Staff Whitelist Sheet all fit cleanly at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 812 });

      // 1. Verify /login page copy, logos, and responsiveness
      await page.goto('/login');
      await expect(page.getByText('Institutional Sign In')).toBeVisible();
      await expect(
        page.getByText(/Only verified @htu\.edu\.gh accounts are permitted\./i)
      ).toBeVisible();
      await expect(
        page.getByText(/Access the Final Year Project Management System using your official university account\./i)
      ).toHaveCount(0);

      const crestLogo = page.locator('img[src="/logo.svg"]');
      const textLogo = page.locator('img[src="/logo-with-text.svg"]');
      await expect(crestLogo).toBeVisible();
      await expect(textLogo).toBeVisible();
      await expectWithinViewportX(page, crestLogo);
      await expectWithinViewportX(page, textLogo);
      await expectNoHorizontalScroll(page);

      await page.screenshot({
        path: `docs/screenshots/login-${width}.png`,
        fullPage: false,
      });

      await page.goto('/dev/login');
      await page.getByRole('button', { name: 'Sign in as coordinator' }).click();
      await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });

      const bellBtn = page.getByRole('button', { name: /Notifications/i });
      const roleBtn = page.getByRole('button', { name: 'Switch active role' });
      const avatarBtn = page.getByRole('button', { name: 'User account menu' });

      await expect(bellBtn).toBeVisible();
      await expect(roleBtn).toBeVisible();
      await expect(avatarBtn).toBeVisible();

      // Every TopNav button must sit completely within [0, width]
      await expectWithinViewportX(page, bellBtn);
      await expectWithinViewportX(page, roleBtn);
      await expectWithinViewportX(page, avatarBtn);

      // Adjacent TopNav buttons must not overlap
      await expectNoOverlap(bellBtn, roleBtn);
      await expectNoOverlap(roleBtn, avatarBtn);

      if (width < 768) {
        const menuBtn = page.getByRole('button', { name: 'Open navigation menu' });
        await expect(menuBtn).toBeVisible();
        await expectWithinViewportX(page, menuBtn);
        await expectNoOverlap(menuBtn, bellBtn);

        // Mobile touch targets >= 44px
        await expectTouchTarget(menuBtn, 44);
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

      // Verify /admin/staff-whitelist Add Staff Member sheet padding & layout as admin
      await page.goto('/dev/login');
      await page.getByRole('button', { name: 'Sign in as admin' }).click();
      await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });

      await page.goto('/admin/staff-whitelist');
      const addBtn = page.getByRole('button', { name: /Add Staff Member/i });
      await expect(addBtn).toBeVisible();
      await addBtn.click();

      const sheet = page.locator('[data-slot="sheet-content"]');
      const fullNameInput = page.locator('#staff-fullname');
      await expect(sheet).toBeVisible();
      await expect(fullNameInput).toBeVisible();

      const [sheetBox, inputBox] = await Promise.all([
        sheet.boundingBox(),
        fullNameInput.boundingBox(),
      ]);
      expect(sheetBox && inputBox).toBeTruthy();
      // Input must have at least 16px horizontal padding inside the sheet on both left and right
      expect(inputBox!.x - sheetBox!.x).toBeGreaterThanOrEqual(16);
      expect(
        sheetBox!.x + sheetBox!.width - (inputBox!.x + inputBox!.width)
      ).toBeGreaterThanOrEqual(16);

      await page.screenshot({
        path: `docs/screenshots/staff-whitelist-sheet-${width}.png`,
        fullPage: false,
      });
    });
  }
});
