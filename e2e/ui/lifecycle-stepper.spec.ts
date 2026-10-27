import { test, expect } from '@playwright/test';
import {
  widths,
  expectNoHorizontalScroll,
  expectWithinViewportX,
  expectSingleIndicator,
} from './helpers';

const mockStudentPayload = {
  sub: 'student-cs-01',
  user_id: 'student-cs-01',
  email: 'kwame.owusu@htu.edu.gh',
  email_verified: true,
  roles: ['student'],
  activeRole: 'student',
  registered: true,
  profileComplete: true,
};

const mockToken = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(mockStudentPayload)).toString('base64url')}.`;

test.describe('LifecycleStepper layout and indicator tests', () => {
  for (const width of widths) {
    test(`stepper on /dev/ui renders clean single indicator without clipping at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('http://localhost:3000/dev/ui');

      const currentStepIndicators = page.locator('[aria-current="step"] > span:first-child');
      const count = await currentStepIndicators.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const indicator = currentStepIndicators.nth(i);
        await expectSingleIndicator(indicator);
        await expectWithinViewportX(page, indicator);
      }

      await expectNoHorizontalScroll(page);

      if (width === 1280) {
        await page.screenshot({
          path: 'docs/screenshots/lifecycle-stepper-1280.png',
          fullPage: false,
        });
      }
    });

    test(`stepper on / (dashboard step 1 Formation) renders clean single indicator without clipping at ${width}px`, async ({
      page,
      context,
    }) => {
      await context.addCookies([
        {
          name: '__session',
          value: mockToken,
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.setViewportSize({ width, height: 800 });
      await page.goto('http://localhost:3000/');

      const currentStepIndicator = page.locator('[aria-current="step"] > span:first-child').first();
      await expect(currentStepIndicator).toBeVisible();

      await expectSingleIndicator(currentStepIndicator);
      await expectWithinViewportX(page, currentStepIndicator);
      await expectNoHorizontalScroll(page);

      if (width === 1280) {
        const stepperCard = page.locator('nav[aria-label="Project Journey"]').first();
        await stepperCard.screenshot({
          path: 'docs/screenshots/lifecycle-stepper-dashboard-card-1280.png',
        });
      }
    });
  }
});
