import { expect, test } from '@playwright/test';

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
  await expect(page.getByRole('heading', { name: 'Je materiaal thuis' })).toBeVisible();
  await page.getByRole('button', { name: 'plus' }).nth(5).click(); // 2× extra 2,5 kg
  await snap(page, '01-thuis');
  await page.getByRole('button', { name: 'Verder' }).click();
  await page.getByRole('button', { name: 'Verder' }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();

  // Meteen: dagen aanvinken (komende 7 dagen)
  await expect(page.getByRole('heading', { name: 'Wanneer kan je?' })).toBeVisible();
  await page.getByRole('group', { name: 'Momenten op di 24/11' }).getByRole('button', { name: /Avond/ }).click();
  await page.getByRole('group', { name: 'Tennis op do 26/11' }).getByRole('button', { name: /1u/ }).click();
  await snap(page, '02-beschikbaarheid');
  await page.getByRole('button', { name: 'Bewaar en plan' }).click();
  await expect(page.getByRole('heading', { name: 'Komende 7 dagen' })).toBeVisible();
  // ma kracht, do tennis, za kracht (wo/vr kunnen niet naast tennis, zo niet na za)
  await expect(page.locator('.plan-day.sweat')).toHaveCount(3);
  await expect(page.locator('.plan-day.sweat').nth(1)).toContainText('Tennis');
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
  await checks.first().click();
  await expect(page.locator('.restbar')).toBeVisible();
  await snap(page, '05-rust');
  await page.getByRole('button', { name: 'Overslaan', exact: true }).click();
  while ((await checks.count()) > 0) await checks.first().click();
  await page.getByRole('button', { name: 'Goed', exact: true }).click();

  // Tweede oefening (beginner: eerst het toestel): gewicht kiezen met het draaiwiel
  await expect(page.locator('.item-name').first()).toContainText('Chest press');
  await expect(page.locator('.demo').first()).toBeVisible();
  await page.getByRole('button', { name: 'Gewicht set 1' }).click();
  await snap(page, '06-draaiwiel');
  await page.getByRole('button', { name: /^20 kg$/ }).click();
  await expect(page.getByRole('button', { name: 'Gewicht set 1' })).toHaveText('20 kg');
  await page.getByRole('button', { name: 'plus' }).first().click();

  // Toestel bezet → alternatief
  await page.getByRole('button', { name: 'Toestel bezet' }).click();
  await snap(page, '07-bezet');
  await page.locator('.sheet .btn.alt').first().click();
  await expect(page.locator('.item-name').first()).not.toContainText('Chest press');
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
  await expect(page.locator('.plan-day').first()).toContainText('vandaag');
});
