import { expect, test, type Page } from '@playwright/test';
import { agendaDay as cellOf } from './helpers.ts';

const shots = process.env.SHOTS_DIR;
const snap = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};
const cell = cellOf;

test('agenda: maandkalender, één tik groen/rood, tennis, volgende maand en alles bevestigen', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-23T08:00:00'));
  await page.goto('./');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Later koppelen' }).click();
  await page.getByRole('button', { name: 'Verder' }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();
  // Na de opstart: meteen de Agenda, een eigen tab onderaan (met een bolletje zolang je niet aanvinkte).
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Agenda: vink je komende dagen aan' })).toBeVisible();
  await expect(page.locator('.tabbar a.on')).toHaveText(/Agenda/);
  await expect(page.getByRole('heading', { name: 'november 2026' })).toBeVisible();

  // Woensdag kan niet → rood, en het plan past zich aan.
  const wed = cell(page, /^woensdag 25 november/);
  await expect(wed).toHaveClass(/can/);
  await wed.click();
  await expect(wed).toHaveClass(/cannot/);
  await expect(wed).toHaveAttribute('aria-label', /kan niet/);
  await expect(page.locator('.agenda-detail')).toContainText('woensdag');

  // Donderdag tennis 1u via het detail onder de kalender.
  await cell(page, /^donderdag 26 november/).click();
  await expect(cell(page, /^donderdag 26 november/)).toHaveClass(/cannot/);
  await cell(page, /^donderdag 26 november/).click();
  await page.getByRole('group', { name: 'Tennis op do 26/11' }).getByRole('button', { name: /1u/ }).click();
  await expect(cell(page, /^donderdag 26 november/)).toContainText('🎾');
  await snap(page, '15-agenda');

  // Volgende maand: ook al aanduiden.
  await page.getByRole('button', { name: 'Volgende maand' }).click();
  await expect(page.getByRole('heading', { name: 'december 2026' })).toBeVisible();
  const dec10 = cell(page, /^donderdag 10 december/);
  await dec10.click();
  await expect(dec10).toHaveClass(/cannot/);
  await expect(dec10).toHaveClass(/saved/);
  await page.getByRole('button', { name: 'Vorige maand' }).click();

  // De rest van de 14 dagen in één tik bevestigen → de coach vraagt het niet meer (bolletje weg).
  await page.getByRole('button', { name: /De komende 14 dagen kloppen/ }).click();
  await expect(page.getByRole('button', { name: /De komende 14 dagen kloppen/ })).toHaveCount(0);
  await expect(page.locator('.tabbar .badge')).toHaveCount(0);

  // In het plan: woensdag rust, donderdag tennis.
  await page.getByRole('button', { name: 'Naar je planning' }).click();
  const week1 = page.locator('.plan').first().locator('.plan-day');
  await expect(week1.nth(2)).not.toHaveClass(/sweat/);
  await expect(week1.nth(3)).toContainText('Tennis');
  // Aanvinken gebeurt enkel in de Agenda: niet meer in Week.
  await expect(page.getByRole('button', { name: 'Dagen aanvinken' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Kan niet die dag' })).toHaveCount(0);
});
