import { expect, test } from '@playwright/test';
import { preferCardioToday, preferStrengthToday, quickSetup } from './helpers.ts';

const shots = process.env.SHOTS_DIR;
const snap = async (page: import('@playwright/test').Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test('indoor cycling: geen timer (1 uur); liever buiten lopen met een stopwatch', async ({ page }) => {
  await quickSetup(page, '2026-11-23T08:00:00', { clock: 'install' });
  await preferCardioToday(page);
  await page.clock.pauseAt(new Date('2026-11-23T08:30:00'));
  await page.getByRole('link', { name: /Training/ }).click();
  await expect(page.getByRole('heading', { name: /Indoor cycling.*1 uur/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Start timer/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '✓ Gedaan' })).toBeVisible();

  // Mooi weer: buiten lopen. Stopwatch start, pauzeert en overleeft herladen.
  await page.getByRole('button', { name: /Lopen/ }).click();
  await page.getByRole('button', { name: '▶ Start lopen' }).click();
  const watch = page.locator('.itimer');
  await expect(watch.locator('.itimer-time')).toHaveText('0:00');
  await expect(page.getByRole('link', { name: 'Training: bezig' })).toBeVisible();
  await page.clock.runFor(65_300);
  await expect(watch.locator('.itimer-time')).toHaveText('1:05');
  await snap(page, '10-lopen');
  await watch.getByRole('button', { name: /Pauze/ }).click();
  await page.clock.runFor(60_000);
  await page.reload();
  await page.clock.resume(); // de app laden met een lopende klok
  await expect(page.locator('.itimer .itimer-time')).toHaveText('1:05');
  await page.clock.pauseAt(new Date('2026-11-23T09:00:00'));
  await page.locator('.itimer').getByRole('button', { name: /Verder/ }).click();
  await page.clock.runFor(20 * 60_000 + 300);
  await expect(page.locator('.itimer .itimer-time')).toHaveText('21:05');

  // Stop en bewaar: telt als conditie, de dag is gedaan.
  await page.getByRole('button', { name: '■ Stop en bewaar' }).click();
  await expect(page.locator('.card.done')).toBeVisible();
  await expect(page.locator('.itimer')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Training: bezig' })).toHaveCount(0);
  await page.getByRole('link', { name: /Agenda/ }).click();
  await expect(page.getByText(/Deze maand: 1 training/)).toBeVisible();
});

test('kracht: oplopende klok, afteltimer voor de zijplank en intervaltimer voor de afsluiter', async ({ page }) => {
  await quickSetup(page, '2026-11-23T08:00:00', { clock: 'install' });
  await preferStrengthToday(page);
  await page.clock.pauseAt(new Date('2026-11-23T08:30:00'));
  await page.getByRole('link', { name: /Vandaag/ }).click();
  await page.getByRole('button', { name: /Oké/ }).click();
  await page.getByRole('group', { name: 'Tijd' }).getByRole('button', { name: '60 min' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  // De klok loopt vanaf de start, ook tijdens de opwarming.
  const elapsed = page.locator('.workout-head .elapsed');
  await expect(elapsed).toHaveText('⏱ 0:00');
  await page.clock.runFor(65_300);
  await expect(elapsed).toHaveText('⏱ 1:05');
  await page.getByRole('button', { name: 'Overslaan' }).click();

  // Romp-oefening openen en (als het moet) wisselen naar de zijplank.
  const core = page.locator('.wgroup').filter({ hasText: /Pallof|Zijplank|Dead bug/ });
  await core.getByRole('button', { name: /starten$/ }).click();
  if (!(await page.locator('.item-name').filter({ hasText: 'Zijplank' }).count())) {
    await page.getByRole('button', { name: 'Toestel bezet' }).click();
    await page.getByRole('button', { name: /Zijplank/ }).click();
  }
  await expect(page.locator('.item-name')).toContainText('Zijplank');

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
  await page.getByRole('button', { name: '■ Stop' }).click();
  await page.getByRole('button', { name: /Gelukt/ }).click();

  // Afsluiter (60 min): 6× 20 s stevig / 40 s rustig, loopt zelf door.
  const card = page.locator('.card').filter({ hasText: 'Afsluiter' });
  await card.getByRole('button', { name: /Start timer · 6 min/ }).click();
  const timer = card.locator('.itimer');
  await expect(timer.locator('.itimer-label')).toHaveText('Stevig (1/6)');
  await expect(timer.locator('.itimer-time')).toHaveText('0:20');
  await expect(timer).toHaveClass(/hard/);
  await page.clock.runFor(20_300);
  await expect(timer.locator('.itimer-label')).toHaveText('Rustig');
  await expect(timer).toHaveClass(/easy/);
  await page.clock.runFor(10_000);
  await expect(timer.locator('.itimer-time')).toHaveText('0:30');
  await snap(page, '12-afsluiter');
  await timer.getByRole('button', { name: /Pauze/ }).click();
  await page.clock.runFor(60_000);
  await expect(timer.locator('.itimer-time')).toHaveText('0:30');
  await timer.getByRole('button', { name: /Verder/ }).click();
  await timer.getByRole('button', { name: /Volgende/ }).click();
  await expect(timer.locator('.itimer-label')).toHaveText('Stevig (2/6)');
  await timer.getByRole('button', { name: 'Stop timer' }).click();
  await expect(card.getByRole('button', { name: /Start timer/ })).toBeVisible();
});

test('lesdag: gedaan of niet gedaan, of met één tik liever kracht (en terug)', async ({ page }) => {
  await quickSetup(page);
  await preferCardioToday(page);
  await page.getByRole('link', { name: /Vandaag/ }).click();
  const card = page.locator('.today-card');
  await expect(card).toContainText('Indoor cycling');
  await expect(card.getByRole('button', { name: '✓ Gedaan' })).toBeVisible();
  await expect(card.getByRole('button', { name: '✕ Niet gedaan' })).toBeVisible();
  await expect(card.getByRole('group', { name: 'Tijd' })).toHaveCount(0);
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/13-lesdag.png`, fullPage: true });

  // Les vol of liever kracht: één tik, vandaag wordt kracht (bovenlichaam of full body).
  await card.getByRole('button', { name: /Liever kracht/ }).click();
  await expect(page.locator('.today-card h2')).toContainText(/Full body|Bovenlichaam|Benen & romp/);
  await expect(page.locator('.today-card').getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  // Toch de les.
  await page.locator('.today-card').getByRole('button', { name: /Toch de les/ }).click();
  await expect(page.locator('.today-card')).toContainText('Indoor cycling');

  // Niet gedaan: vandaag herstel, en met één tik toch trainen.
  await page.locator('.today-card').getByRole('button', { name: '✕ Niet gedaan' }).click();
  await expect(page.locator('.light-card')).toBeVisible();
  await page.getByRole('button', { name: 'Toch trainen' }).click();
  await expect(page.locator('.today-card')).toContainText('Indoor cycling');

  // Gedaan: telt als les van 1 uur.
  await page.locator('.today-card').getByRole('button', { name: '✓ Gedaan' }).click();
  await expect(page.locator('.card.done')).toContainText('Indoor cycling');
});

test('rustdag maar je voelt je goed: toch krachttraining (Week en Vandaag)', async ({ page }) => {
  await quickSetup(page);
  // Week: tik op een rustdag → toch kracht.
  const row = (i: number) => page.locator('.plan').first().locator('.plan-day').nth(i);
  const rest = page.locator('.plan').first().locator('.plan-day.light').filter({ hasNotText: 'Klusjes' }).first();
  const date = (await rest.locator('.plan-date').textContent())!.trim();
  await rest.getByRole('button').first().click();
  await page.getByRole('button', { name: '💪 Toch krachttraining' }).click();
  const same = page.locator('.plan').first().locator('.plan-day').filter({ hasText: date });
  await expect(same).toContainText(/Full body|Bovenlichaam|Benen & romp/);
  await expect(same).toContainText('jouw keuze');
  // Terug naar het voorstel.
  await same.getByRole('button').first().click();
  await page.getByRole('button', { name: /Terug naar het voorstel/ }).click();
  await expect(page.locator('.plan').first().locator('.plan-day').filter({ hasText: date })).not.toContainText('jouw keuze');
  await expect(row(0)).toBeVisible();
});
