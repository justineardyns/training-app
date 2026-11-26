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

  // Begeleide opwarming: timer die zelf doorloopt, of overslaan.
  await expect(page.getByRole('heading', { name: /^Opwarming · \d min/ })).toBeVisible();
  await page.getByRole('button', { name: 'Start opwarming' }).click();
  await expect(page.locator('.warmup-time')).toHaveText(/^\d:\d\d$/);
  await expect(page.getByRole('heading', { name: /Fiets of roeier/ })).toBeVisible();
  await snap(page, '04c-opwarming');
  await page.getByRole('button', { name: 'Volgende' }).click();
  await expect(page.getByRole('heading', { name: 'Squats zonder gewicht' })).toBeVisible();
  await page.getByRole('button', { name: 'Klaar', exact: true }).click();

  // Tab Training: je hele training als lijst. De tab toont dat er een training bezig is.
  await expect(page.getByRole('heading', { name: 'Full body A' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Training: bezig' })).toBeVisible();
  await expect(page.locator('.wgroup.next')).toContainText('Leg press');
  await snap(page, '05a-lijst');

  // ▶ Start bij de eerste oefening: sets afvinken, rust start vanzelf.
  await page.getByRole('button', { name: 'Leg press starten' }).click();
  await expect(page.locator('.item-name')).toContainText('Leg press');
  await expect(page.locator('.wactive .elapsed')).toHaveText(/^⏱ \d+:\d\d$/);
  const checks = page.getByRole('button', { name: /^Set \d gedaan$/ });
  await expect(page.locator('.load-banner')).toContainText('Startvoorstel');
  await checks.first().click();
  await expect(page.locator('.restbar')).toBeVisible();
  await snap(page, '05-rust');
  await page.getByRole('button', { name: 'Overslaan', exact: true }).click();
  while ((await checks.count()) > 0) await checks.first().click();
  await snap(page, '05b-gelukt');
  await page.getByRole('button', { name: 'Goed', exact: true }).click();
  // Dicht en afgevinkt; de volgende staat klaar.
  await expect(page.locator('.item-name')).toHaveCount(0);
  await expect(page.locator('.wgroup.klaar')).toContainText('Leg press');
  await expect(page.locator('.wgroup.next')).toContainText('Chest press');
  await expect(page.getByText(/^1\/\d+ klaar/)).toBeVisible();

  // Jij kiest de volgorde: eerst de derde oefening (beginner: eerst het toestel), ik nam meer.
  const third = (await page.locator('.wgroup').nth(2).locator('.wrow-name').textContent())!.trim();
  await page.locator('.wgroup').nth(2).getByRole('button', { name: /starten$/ }).click();
  await expect(page.locator('.item-name')).toContainText(third);
  await expect(page.locator('.demo').first()).toBeVisible();
  while ((await checks.count()) > 0) await checks.first().click();
  await page.getByRole('button', { name: /Ik nam meer/ }).click();
  await snap(page, '06-meer');
  await page.locator('.feel .chip').first().click();
  await expect(page.locator('.wgroup.klaar')).toHaveCount(2);

  // Toestel bezet → alternatief
  await page.getByRole('button', { name: /^Chest press.* starten$/ }).click();
  await page.getByRole('button', { name: 'Toestel bezet' }).click();
  await snap(page, '07-bezet');
  await page.locator('.sheet .btn.alt').first().click();
  await expect(page.locator('.item-name')).not.toContainText('Chest press');
  // ■ Stop na 1 set: de app vraagt meteen hoe het ging.
  await checks.first().click();
  await page.getByRole('button', { name: 'Overslaan', exact: true }).click();
  await snap(page, '08-training');
  await page.getByRole('button', { name: '■ Stop' }).click();
  await page.getByRole('button', { name: 'Goed', exact: true }).click();
  await expect(page.locator('.wgroup.klaar')).toHaveCount(3);

  // Stoppen en bewaren
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Afronden en bewaren' }).click();
  await expect(page.getByRole('heading', { name: /Klaar/ })).toBeVisible();
  await page.getByRole('button', { name: 'Bewaar training' }).click();
  await expect(page.locator('.card.done')).toBeVisible();
  // Mijlpaal: je eerste training! Eén keer tonen.
  await expect(page.locator('.card.milestone')).toContainText('Je eerste training!');
  await snap(page, '09b-mijlpaal');
  await page.locator('.card.milestone').getByRole('button', { name: 'Top!' }).click();
  await expect(page.locator('.card.milestone')).toHaveCount(0);
  // In de Agenda: vandaag gedaan, telling van de maand.
  await page.getByRole('link', { name: /Agenda/ }).click();
  await expect(page.getByRole('gridcell', { name: /^maandag 23 november: gedaan/ })).toContainText('🏋️');
  await expect(page.getByText(/Deze maand: 1 training · 1× kracht/)).toBeVisible();
  await page.getByRole('link', { name: /Vandaag/ }).click();
  await snap(page, '09-gedaan');

  // Blijft bewaard na herladen
  await page.reload();
  await expect(page.locator('.card.done')).toBeVisible();
  await page.getByRole('link', { name: /Week/ }).click();
  await expect(page.locator('.plan-day.done')).toHaveCount(1);
  await expect(page.locator('.plan').first().locator('.plan-day').first()).toContainText('vandaag');
});
