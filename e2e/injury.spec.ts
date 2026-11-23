import { expect, test } from '@playwright/test';
import { preferStrengthToday, quickSetup } from './helpers.ts';

test('"Ik heb last van…" past de training aan en volgt op', async ({ page }) => {
  await quickSetup(page);
  await preferStrengthToday(page);
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

test('"Ik ben ziek": één tik = rust, genezen = rustiger terug zonder extra uitleg', async ({ page }) => {
  await quickSetup(page);
  await page.getByRole('link', { name: /Vandaag/ }).click();
  await page.getByRole('button', { name: 'Ik heb last van…' }).click();
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/16-ziek.png`, fullPage: true });
  await page.getByRole('button', { name: /Ik ben ziek/ }).click();
  await expect(page.getByRole('heading', { name: 'Beterschap' })).toBeVisible();
  await expect(page.getByText(/Ziek: rust tot je beter bent/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Naar vandaag' }).click();
  await expect(page.locator('.card.illness')).toContainText('Ziek');
  await expect(page.getByRole('heading', { name: 'Rust en herstel' })).toBeVisible();
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/17-ziek-vandaag.png`, fullPage: true });
  await page.getByRole('link', { name: /Week/ }).click();
  await expect(page.locator('.plan-day.sweat')).toHaveCount(0);
  await page.getByRole('link', { name: /Vandaag/ }).click();
  await page.locator('.card.illness').getByRole('button', { name: 'Genezen' }).click();
  // Genezen: de kaart verdwijnt, geen extra uitleg; de eerste trainingen zijn wel rustiger.
  await expect(page.locator('.card.illness')).toHaveCount(0);
  await page.getByRole('link', { name: /Week/ }).click();
  await expect(page.locator('.plan-day.sweat').first()).toContainText('lichter');
  await expect(page.locator('main')).not.toContainText('ziekte');
});
