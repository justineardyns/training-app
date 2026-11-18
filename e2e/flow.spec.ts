import { expect, test } from '@playwright/test';
import { agendaDay, preferStrengthToday } from './helpers.ts';

const shots = process.env.SHOTS_DIR;
const snap = async (page: import('@playwright/test').Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test('eerste opstart → plannen → trainen → bewaren', async ({ page }) => {
  // Maandag 23 november 2026, 8u.
  await page.clock.setFixedTime(new Date('2026-11-23T08:00:00'));
  await page.goto('./');

  // Setup
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Later koppelen' }).click();
  await expect(page.getByRole('heading', { name: 'Jims', exact: true })).toBeVisible();
  await snap(page, '01-jims');
  await page.getByRole('button', { name: 'Verder' }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();

  // Meteen: de Agenda. Dinsdag kan niet (rood), donderdag tennis 1u, de rest klopt.
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();
  await agendaDay(page, /^dinsdag 24 november/).click();
  await expect(agendaDay(page, /^dinsdag 24 november/)).toHaveClass(/cannot/);
  await agendaDay(page, /^donderdag 26 november/).click();
  await page.getByRole('group', { name: 'Tennis op do 26/11' }).getByRole('button', { name: /1u/ }).click();
  await snap(page, '02-agenda');
  await page.getByRole('button', { name: /De komende 14 dagen kloppen/ }).click();
  await page.getByRole('link', { name: /Week/ }).click();
  await expect(page.getByRole('heading', { name: 'Komende 7 dagen' })).toBeVisible();
  // Beginner: 4 trainingen (opbouw). Tennis op do, indoor cycling op zondag om 10u, de rest kracht.
  await expect(page.locator('.plan').first().locator('.plan-day.sweat')).toHaveCount(4);
  await expect(page.locator('.plan').first().locator('.plan-day').nth(1)).not.toHaveClass(/sweat/);
  await expect(page.locator('.plan').first().locator('.plan-day').nth(3)).toContainText('Tennis');
  await expect(page.locator('.plan').first().locator('.plan-day').nth(6)).toContainText('Indoor cycling (groepsles) · Jims · 10u');
  // Vandaag liever kracht dan indoor cycling: één tik.
  await preferStrengthToday(page);
  await expect(page.locator('.plan').first().locator('.plan-day').first()).toContainText('Full body A');
  await snap(page, '03-week');

  // Vandaag
  await page.getByRole('link', { name: /Vandaag/ }).click();
  await expect(page.getByRole('heading', { name: /Full body A/ })).toBeVisible();
  await page.getByRole('button', { name: /Oké/ }).click();
  await expect(page.locator('.card.readiness.green')).toBeVisible();
  await snap(page, '04-vandaag');
  // Oefening bekijken: foto's van het toestel + uitleg
  await page.locator('.preview-name').first().click();
  await expect(page.getByRole('heading', { name: 'Leg press' })).toBeVisible();
  await expect(page.locator('.demo img').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Het toestel' })).toBeVisible();
  await snap(page, '04b-oefening');
  await page.getByRole('button', { name: 'Terug' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  // Training: eerste oefening, alle sets afvinken
  await expect(page.locator('.item-name').first()).toContainText('Leg press');
  const checks = page.getByRole('button', { name: /^Set \d gedaan$/ });
  await expect(page.locator('.load-banner')).toContainText('Startvoorstel');
  await checks.first().click();
  await expect(page.locator('.restbar')).toBeVisible();
  await snap(page, '05-rust');
  await page.getByRole('button', { name: 'Overslaan', exact: true }).click();
  while ((await checks.count()) > 0) await checks.first().click();
  await snap(page, '05b-gelukt');
  await page.getByRole('button', { name: /Gelukt/ }).click();

  // Tweede oefening (beginner: eerst het toestel): ik nam meer
  await expect(page.locator('.item-name').first()).toContainText('Chest press');
  await expect(page.locator('.demo').first()).toBeVisible();
  while ((await checks.count()) > 0) await checks.first().click();
  await page.getByRole('button', { name: /Ik nam meer/ }).click();
  await snap(page, '06-meer');
  await page.locator('.feel .chip').first().click();
  await expect(page.locator('.item-name').first()).toContainText('Lat pulldown');

  // Toestel bezet → alternatief
  await page.getByRole('button', { name: 'Toestel bezet' }).click();
  await snap(page, '07-bezet');
  await page.locator('.sheet .btn.alt').first().click();
  await expect(page.locator('.item-name').first()).not.toContainText('Lat pulldown');
  await snap(page, '08-training');

  // Stoppen en bewaren
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: 'Afronden en bewaren' }).click();
  await expect(page.getByRole('heading', { name: /Klaar/ })).toBeVisible();
  await page.getByRole('button', { name: 'Bewaar training' }).click();
  await expect(page.locator('.card.done')).toBeVisible();
  await snap(page, '09-gedaan');

  // Blijft bewaard na herladen
  await page.reload();
  await expect(page.locator('.card.done')).toBeVisible();
  await page.getByRole('link', { name: /Week/ }).click();
  await expect(page.locator('.plan-day.done')).toHaveCount(1);
  await expect(page.locator('.plan').first().locator('.plan-day').first()).toContainText('vandaag');
});
