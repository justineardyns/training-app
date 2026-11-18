import { expect, test } from '@playwright/test';
import { quickSetup } from './helpers.ts';

test('"Ik heb last van…" past de training aan en volgt op', async ({ page }) => {
  await quickSetup(page);
  await page.getByRole('link', { name: /Vandaag/ }).click();
  await expect(page.locator('.preview')).toContainText('Leg press');

  await page.getByRole('button', { name: 'Ik heb last van…' }).click();
  await page.getByRole('button', { name: 'Knie' }).click();
  await page.getByRole('button', { name: /Matig/ }).click();
  await page.getByRole('button', { name: 'Bewaar' }).click();
  await expect(page.getByText(/Ik pas je trainingen aan voor je knie/)).toBeVisible();
  await page.getByRole('button', { name: 'Naar vandaag' }).click();

  await expect(page.locator('.preview')).not.toContainText('Leg press');
  await expect(page.locator('.card.injuries')).toContainText('Knie');
  await page.locator('.card.injuries').getByRole('button', { name: 'Erger' }).click();
  await expect(page.locator('.card.injuries .note.warn')).toContainText('arts of kinesist');
  await page.locator('.card.injuries').getByRole('button', { name: 'Weg' }).click();
  await expect(page.locator('.card.injuries')).toContainText('hersteld, we bouwen op');
});
