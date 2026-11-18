import { expect, test } from '@playwright/test';

test('app laadt en werkt volledig offline', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /Ik ben je coach/ })).toBeVisible();
  // Wachten tot de service worker alles in cache heeft.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Ik ben je coach/ })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Je privé-opslag' })).toBeVisible();
});
