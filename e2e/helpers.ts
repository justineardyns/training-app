import { expect, type Page } from '@playwright/test';

/** Eerste opstart doorlopen zonder koppeling (standaardmateriaal). */
export async function quickSetup(page: Page, when = '2026-11-23T08:00:00') {
  await page.clock.setFixedTime(new Date(when));
  await page.goto('./');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Later koppelen' }).click();
  await page.getByRole('button', { name: 'Verder' }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();
  await expect(page.getByRole('heading', { name: 'Wanneer kan je?' })).toBeVisible();
  await page.getByRole('button', { name: 'Bewaar en plan' }).click();
  await expect(page.getByRole('heading', { name: 'Komende 7 dagen' })).toBeVisible();
}
