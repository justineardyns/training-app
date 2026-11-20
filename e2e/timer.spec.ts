import { expect, test } from '@playwright/test';
import { preferCardioToday, preferStrengthToday, quickSetup } from './helpers.ts';

const shots = process.env.SHOTS_DIR;
const snap = async (page: import('@playwright/test').Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test('cardio: intervaltimer loopt zelf door, met pauze, volgende en stop', async ({ page }) => {
  await quickSetup(page, '2026-11-23T08:00:00', { clock: 'install' });
  await preferCardioToday(page);
  await page.clock.pauseAt(new Date('2026-11-23T08:30:00'));
  // Maandag: indoor cycling. Starten → conditiescherm.
  await page.getByRole('link', { name: /Vandaag/ }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const card = page.locator('.card').filter({ hasText: 'Intervallen op fiets of roeier' });
  await card.getByRole('button', { name: /Start timer/ }).click();
  const timer = card.locator('.itimer');
  await expect(timer.locator('.itimer-label')).toHaveText(/^Opwarmen/);
  await expect(timer.locator('.itimer-time')).toHaveText('5:00');
  await expect(timer).toContainText('Hierna: stevig (1/10), 30 s');

  // 5 minuten later: vanzelf het eerste stevige blok.
  await page.clock.runFor(300_300);
  await expect(timer.locator('.itimer-label')).toHaveText('Stevig (1/10)');
  await expect(timer).toHaveClass(/hard/);
  await page.clock.runFor(10_000);
  await expect(timer.locator('.itimer-time')).toHaveText('0:20');
  await snap(page, '10-cardio-timer');

  // Pauze: de tijd staat stil.
  await timer.getByRole('button', { name: /Pauze/ }).click();
  await page.clock.runFor(60_000);
  await expect(timer.locator('.itimer-time')).toHaveText('0:20');
  await timer.getByRole('button', { name: /Verder/ }).click();
  await page.clock.runFor(20_000);
  await expect(timer.locator('.itimer-label')).toHaveText('Rustig');
  await expect(timer.locator('.itimer-time')).toHaveText('1:30');
  await expect(timer).toHaveClass(/easy/);

  // Volgende: meteen naar het volgende blok.
  await timer.getByRole('button', { name: /Volgende/ }).click();
  await expect(timer.locator('.itimer-label')).toHaveText('Stevig (2/10)');

  // Even naar een ander scherm en terug: de timer loopt verder.
  await page.evaluate(() => (location.hash = '#/vandaag'));
  await expect(page.locator('.itimer')).toHaveCount(0);
  await page.evaluate(() => (location.hash = '#/cardio'));
  await expect(page.locator('.itimer .itimer-label')).toHaveText('Stevig (2/10)');

  await page.locator('.itimer').getByRole('button', { name: 'Stop timer' }).click();
  await expect(card.getByRole('button', { name: /Start timer/ })).toBeVisible();
});

test('kracht: oplopende klok en een afteltimer voor de zijplank', async ({ page }) => {
  await quickSetup(page, '2026-11-23T08:00:00', { clock: 'install' });
  await preferStrengthToday(page);
  await page.clock.pauseAt(new Date('2026-11-23T08:30:00'));
  await page.getByRole('link', { name: /Vandaag/ }).click();
  await page.getByRole('button', { name: /Oké/ }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  // De klok loopt vanaf de start, ook tijdens de opwarming.
  const elapsed = page.locator('.workout-top .elapsed');
  await expect(elapsed).toHaveText('⏱ 0:00');
  await page.clock.runFor(65_300);
  await expect(elapsed).toHaveText('⏱ 1:05');
  await page.getByRole('button', { name: 'Overslaan' }).click();

  // Naar de romp-oefening en (als het moet) wisselen naar de zijplank.
  while (!(await page.locator('.item-name').filter({ hasText: /Pallof|Zijplank|Dead bug/ }).count())) {
    await page.getByRole('button', { name: 'Oefening overslaan' }).click();
  }
  if (!(await page.locator('.item-name').filter({ hasText: 'Zijplank' }).count())) {
    await page.getByRole('button', { name: 'Toestel bezet' }).click();
    await page.getByRole('button', { name: /Zijplank/ }).click();
  }
  await expect(page.locator('.item-name')).toContainText('Zijplank');
  await expect(page.locator('.workout-top .elapsed')).toBeVisible();

  // ▶: 5 s klaarzetten, eerste kant, wisselen, andere kant → set vanzelf afgevinkt, rust start.
  const seconds = Number(await page.locator('.set').first().locator('.step-val').textContent());
  await page.getByRole('button', { name: 'Timer set 1 starten' }).click();
  const hold = page.locator('.hold');
  await expect(hold).toContainText('klaar zetten');
  await expect(hold.locator('.hold-time')).toHaveText('0:05');
  await page.clock.runFor(5_300);
  await expect(hold).toContainText('eerste kant');
  await snap(page, '11-zijplank-timer');
  await page.clock.runFor(seconds * 1000 + 5_000);
  await expect(hold).toContainText('andere kant');
  await page.clock.runFor(seconds * 1000);
  await expect(page.getByRole('button', { name: 'Set 1 ongedaan maken' })).toBeVisible();
  await expect(page.locator('.set').first()).toContainText(`${seconds} s`);
  await expect(page.locator('.restbar')).toBeVisible();
});
