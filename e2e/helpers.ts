import { expect, type Page } from '@playwright/test';

/** Eerste opstart doorlopen zonder koppeling (standaardmateriaal). `clock: 'install'` = een klok die je kan doorspoelen. */
export async function quickSetup(page: Page, when = '2026-11-23T08:00:00', opts: { clock?: 'fixed' | 'install' } = {}) {
  if (opts.clock === 'install') await page.clock.install({ time: new Date(when) });
  else await page.clock.setFixedTime(new Date(when));
  await page.goto('./');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Later koppelen' }).click();
  await page.getByRole('button', { name: 'Verder' }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();
  await page.getByRole('button', { name: /De komende 14 dagen kloppen/ }).click();
  await page.getByRole('link', { name: /Week/ }).click();
  await expect(page.getByRole('heading', { name: 'Komende 7 dagen' })).toBeVisible();
}

/** In de Agenda: een dag aantikken (groen ↔ rood). */
export const agendaDay = (page: Page, label: RegExp) => page.getByRole('gridcell', { name: label });

/** In Week: vandaag liever kracht (de coach plant op maandag standaard indoor cycling). */
export async function preferStrengthToday(page: Page) {
  const today = page.locator('.plan').first().locator('.plan-day').first();
  if (await today.getByText(/Full body|Bovenlichaam|Benen & romp/).count()) return;
  await today.getByRole('button').first().click();
  await page.getByRole('button', { name: /Liever kracht/ }).click();
  await expect(page.locator('.plan').first().locator('.plan-day').first()).toContainText(/Full body|Bovenlichaam|Benen & romp/);
}

/** In Week: vandaag liever indoor cycling (de les van vandaag). */
export async function preferCardioToday(page: Page) {
  const today = page.locator('.plan').first().locator('.plan-day').first();
  if (await today.getByText(/Indoor cycling/).count()) return;
  await today.getByRole('button').first().click();
  await page.getByRole('button', { name: /Liever indoor cycling/ }).click();
  await expect(page.locator('.plan').first().locator('.plan-day').first()).toContainText(/Indoor cycling/);
}
