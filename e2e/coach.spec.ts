import { expect, test, type Page } from '@playwright/test';

const shots = process.env.SHOTS_DIR;
const snap = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

/** Nagebootst Open-Meteo (geen echt netwerk): droog, 11°. */
async function mockWeather(page: Page, urls: string[]) {
  await page.route('https://api.open-meteo.com/**', async (route) => {
    urls.push(route.request().url());
    const days = Array.from({ length: 8 }, (_, i) => new Date(Date.UTC(2026, 10, 23 + i)).toISOString().slice(0, 10));
    const hourly = { time: [] as string[], temperature_2m: [] as number[], precipitation_probability: [] as number[], precipitation: [] as number[], weather_code: [] as number[], wind_speed_10m: [] as number[] };
    for (const d of days)
      for (let h = 0; h < 24; h++) {
        hourly.time.push(`${d}T${String(h).padStart(2, '0')}:00`);
        hourly.temperature_2m.push(h >= 11 && h <= 14 ? 11 : 6);
        hourly.precipitation_probability.push(h === 12 ? 0 : 20);
        hourly.precipitation.push(0);
        hourly.weather_code.push(2);
        hourly.wind_speed_10m.push(9);
      }
    const daily = {
      time: days, weather_code: days.map(() => 2), temperature_2m_max: days.map(() => 11), temperature_2m_min: days.map(() => 4),
      precipitation_probability_max: days.map(() => 20), precipitation_sum: days.map(() => 0), wind_speed_10m_max: days.map(() => 12),
      sunrise: days.map((d) => `${d}T08:10`), sunset: days.map((d) => `${d}T16:50`),
    };
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ daily, hourly }) });
  });
}

test('de coach kiest de mix, wisselt spieren af, laat je kiezen en kijkt naar het weer', async ({ page }) => {
  const urls: string[] = [];
  await mockWeather(page, urls);
  await page.clock.setFixedTime(new Date('2026-11-23T08:00:00'));
  await page.goto('./');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Later koppelen' }).click();
  await page.getByRole('button', { name: 'Verder' }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();

  // Agenda: donderdag tennis 1u, de rest klopt.
  await page.getByRole('gridcell', { name: /^donderdag 26 november/ }).click();
  await page.getByRole('group', { name: 'Tennis op do 26/11' }).getByRole('button', { name: /1u/ }).click();
  await page.getByRole('button', { name: /De komende 14 dagen kloppen/ }).click();
  await page.getByRole('link', { name: /Week/ }).click();

  // Beginner: 4 trainingen (opbouw): ma full body A, wo full body B, do tennis, zo indoor cycling om 10u.
  await expect(page.getByRole('heading', { name: 'Komende 7 dagen' })).toBeVisible();
  // Week toont enkel 7 dagen; de week erna staat (voorlopig) in de Agenda.
  await expect(page.locator('.plan')).toHaveCount(1);
  await expect(page.locator('.plan-day')).toHaveCount(7);
  await expect(page.getByText(/4\/4 trainingen: 2× kracht \+ 2× conditie/)).toBeVisible();
  const row = (i: number) => page.locator('.plan').first().locator('.plan-day').nth(i);
  await expect(row(0)).toContainText('Full body A');
  await expect(row(0).locator('.hair')).toHaveCount(0);
  await expect(row(2)).toContainText('Full body B');
  await expect(row(3)).toContainText('Tennis');
  await expect(row(3).locator('.hair')).toBeVisible();
  await expect(row(6)).toContainText('Indoor cycling (groepsles) · Jims · 10u');
  await expect(row(6)).toContainText('Lesmoment indoor cycling om 10u');
  await expect(row(6).locator('.hair')).toBeVisible();
  // Rustdag met droog weer: wandelen.
  await expect(row(1)).toContainText('Wandeling');
  await expect(row(1).locator('.wx')).toContainText('11°');
  await snap(page, '10-week-waarom');

  // Jij kiest: woensdag liever indoor cycling → kan niet (donderdag tennis: nooit 2 haarwasdagen na elkaar), de coach zegt het.
  await row(2).getByRole('button').first().click();
  await snap(page, '11-wissel');
  await page.getByRole('button', { name: /Liever indoor cycling/ }).click();
  await expect(page.getByText(/Je koos conditie op woensdag, maar dat past daar niet/)).toBeVisible();
  await expect(row(2)).toContainText('keuze past niet');
  await row(2).getByRole('button').first().click();
  await page.getByRole('button', { name: /Terug naar het voorstel/ }).click();
  await expect(row(2)).not.toContainText('keuze past niet');

  // Agenda: dag 8–14 als voorbeschouwing (ma 30/11 bovenlichaam, de dag na cycling: voorlopig) en lessen reserveren.
  await page.getByRole('link', { name: /Agenda/ }).click();
  const mon30 = page.getByRole('gridcell', { name: /^maandag 30 november/ });
  await expect(mon30).toHaveClass(/provisional/);
  await expect(mon30).toContainText('🏋️');
  // Eén tik = rood (en het plan schuift mee), het detail eronder zet het met één tik terug op groen.
  await mon30.click();
  await expect(mon30).toHaveClass(/cannot/);
  await expect(mon30).not.toContainText('🏋️');
  await page.locator('.agenda-detail').getByRole('button', { name: /Kan 's avonds/ }).click();
  await expect(mon30).toHaveClass(/can/);
  await expect(page.locator('.agenda-detail')).toContainText(/Gepland: .*\(voorlopig\)|Rustdag in het plan/);
  const booking = page.locator('.card.booking');
  await expect(booking).toContainText('Reserveer je indoor cycling');
  await expect(booking.getByRole('button')).toHaveCount(3);
  await booking.getByRole('button', { name: /zo 29\/11 · 10u/ }).click();
  await expect(booking.getByRole('button', { name: /✓ zo 29\/11/ })).toBeVisible();
  await expect(page.getByRole('gridcell', { name: /^zondag 29 november/ })).toContainText('🎟️');
  await snap(page, '14-reserveren');
  // Gelinkt: in Week staat zondag nu als gereserveerd.
  await page.getByRole('link', { name: /Week/ }).click();
  await expect(row(6)).toContainText('gereserveerd');
  await expect(row(6)).toContainText('Gereserveerd: indoor cycling om 10u');

  // Vandaag (full body): dagvorm + spierpijn in de benen → benen lichter, bovenlichaam eerst.
  await page.getByRole('link', { name: /Vandaag/ }).click();
  await expect(page.locator('.eyebrow .wx')).toContainText('11°');
  await page.getByRole('button', { name: /Oké/ }).click();
  await page.getByRole('group', { name: 'Spierpijn' }).getByRole('button', { name: 'Benen' }).click();
  await expect(page.locator('.today-card')).toContainText('Benen nog moe (spierpijn)');
  await expect(page.locator('.rec.red')).toContainText('Benen');
  await expect(page.getByRole('heading', { name: 'Sterk en werkpunten' })).toBeVisible();
  await snap(page, '12-vandaag-herstel');

  // Weer: plaats kiezen zonder typen.
  await page.getByRole('link', { name: /Meer/ }).click();
  await page.getByRole('button', { name: 'Weer voor je wandeldagen' }).click();
  await page.getByRole('button', { name: 'Gent', exact: true }).click();
  await expect(page.getByText(/Nu: Gent/)).toBeVisible();
  await expect.poll(() => urls.at(-1) ?? '').toContain('latitude=51.1&longitude=3.7');
  await snap(page, '13-weer');
});
