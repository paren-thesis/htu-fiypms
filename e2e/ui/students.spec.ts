import { test, expect } from '@playwright/test';
import {
  widths,
  expectNoHorizontalScroll,
  expectAbove,
  expectNoOverlap,
} from './helpers';

const mockCoordinatorPayload = {
  sub: 'staff-coordinator',
  user_id: 'staff-coordinator',
  email: 'coordinator@htu.edu.gh',
  email_verified: true,
  roles: ['coordinator'],
  activeRole: 'coordinator',
  registered: true,
  profileComplete: true,
};

const mockCoordToken = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(mockCoordinatorPayload)).toString('base64url')}.`;

const mockSupervisorPayload = {
  sub: 'staff-kappiah',
  user_id: 'staff-kappiah',
  email: 'kappiah@htu.edu.gh',
  email_verified: true,
  roles: ['supervisor'],
  activeRole: 'supervisor',
  registered: true,
  profileComplete: true,
};

const mockSupToken = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(mockSupervisorPayload)).toString('base64url')}.`;

test.describe('Students page layout and role visibility', () => {
  for (const width of widths) {
    test(`renders /students for coordinator with tabs above table, no horizontal scroll at ${width}px`, async ({
      page,
      context,
    }) => {
      await context.addCookies([
        {
          name: '__session',
          value: mockCoordToken,
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.setViewportSize({ width, height: 800 });
      await page.goto('/students');

      // 1. Verify tabs sit above the table
      const tabsList = page.locator('[role="tablist"]').first();
      const table = page.locator('table').first();

      await expect(tabsList).toBeVisible();
      if (await table.isVisible()) {
        await expectAbove(tabsList, table);
      }

      // 2. Verify no horizontal page scrolling
      await expectNoHorizontalScroll(page);

      // 3. At desktop widths (1280px), verify sidebar footer is fully visible and not covered by dev badge
      if (width === 1280) {
        const sidebar = page.locator('aside[aria-label="Sidebar Navigation"]');
        await expect(sidebar).toBeVisible();

        const sidebarFooterText = sidebar.locator('text=/coordinator workspace/i');
        await expect(sidebarFooterText).toBeVisible();

        // Check if Next.js dev indicator exists
        const devBadge = page.locator('#nextjs-dev-indicator, [data-nextjs-dev-indicator], [data-next-dev-indicator]');
        if ((await devBadge.count()) > 0 && (await devBadge.first().isVisible())) {
          await expectNoOverlap(sidebarFooterText, devBadge.first());
        }

        await page.screenshot({
          path: 'docs/screenshots/students-1280.png',
          fullPage: false,
        });
      }
    });
  }

  test('supervisor role is blocked from /students and never sees the nav item', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: '__session',
        value: mockSupToken,
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/students');

    // Supervisors are redirected away from /students
    await expect(page).not.toHaveURL(/\/students$/);

    // Sidebar navigation does not contain Students link for supervisor
    const studentsNavLink = page.locator('aside nav a[href="/students"]');
    await expect(studentsNavLink).toHaveCount(0);
  });
});
