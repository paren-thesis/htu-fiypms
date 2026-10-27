import { test, expect } from '@playwright/test';
import { expectNoHorizontalScroll } from './helpers';

test.describe('Dev Login & Navigation E2E', () => {
  test('lists fixture users and renders responsive UI without overflow at 375, 768, 1280px', async ({ page }) => {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('http://localhost:3000/dev/login');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('HTU · FYPMS Dev Login')).toBeVisible();
      await expect(page.getByText('Dr. Samuel K. Ampofo')).toBeVisible();

      await expectNoHorizontalScroll(page);
    }
  });

  test('signing in as coordinator lands on coordinator dashboard with correct nav', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:3000/dev/login');
    await page.waitForLoadState('networkidle');

    // Click sign in as coordinator
    const signInBtn = page.getByRole('button', { name: /Sign in as coordinator/i });
    await signInBtn.click();

    // Verify redirect to dashboard
    await page.waitForURL('http://localhost:3000/', { timeout: 15000 });
    await expect(page).toHaveURL('http://localhost:3000/');

    // Verify coordinator nav elements exist
    await expect(page.getByRole('link', { name: /Students & Pool/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Staff Whitelist/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Matching/i })).toBeVisible();
  });

  test('signing in as student lands on student dashboard with correct nav', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:3000/dev/login');
    await page.waitForLoadState('networkidle');

    // Switch to Students tab
    await page.getByRole('tab', { name: /Students/i }).click();

    // Sign in as first student (Kwame Mensah)
    const studentBtn = page.getByRole('button', { name: /Sign in as Student/i }).first();
    await studentBtn.click();

    // Verify redirect to dashboard
    await page.waitForURL('http://localhost:3000/', { timeout: 15000 });
    await expect(page).toHaveURL('http://localhost:3000/');

    // Verify student nav elements exist
    await expect(page.getByRole('link', { name: /My Team/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Proposals/i })).toBeVisible();
  });
});
