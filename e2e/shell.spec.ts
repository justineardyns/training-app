import { expect, test } from '@playwright/test';

test('app-shell laadt en werkt offline', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.locator('.tabbar')).toBeVisible();
  // Wachten tot de service worker alles in cache heeft.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.tabbar')).toBeVisible();
  await page.getByRole('link', { name: /Week/ }).click();
  await expect(page.locator('h1')).toHaveText('Week');
});
