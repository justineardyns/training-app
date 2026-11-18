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

  // Lesmomenten zichtbaar bij het aanvinken (ook donderdagavond); tennis op donderdag.
  await expect(page.getByRole('group', { name: 'Momenten op za 28/11' }).getByRole('button', { name: /Overdag · 🚴/ })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Momenten op do 26/11' }).getByRole('button', { name: /Avond · 🚴/ })).toBeVisible();
  await page.getByRole('group', { name: 'Tennis op do 26/11' }).getByRole('button', { name: /1u/ }).click();
  await page.getByRole('button', { name: 'Bewaar en plan' }).click();

  // 6 trainingen, 1 rustdag: ma cycling, di bovenlichaam (benen rusten), wo benen, do tennis, vr rust, za cycling 10u, zo bovenlichaam.
  await expect(page.getByRole('heading', { name: 'Komende 7 dagen' })).toBeVisible();
  await expect(page.getByText(/6\/6 trainingen: 3× kracht \+ 3× conditie/)).toBeVisible();
  const row = (i: number) => page.locator('.plan-day').nth(i);
  await expect(row(0)).toContainText('Indoor cycling (groepsles)');
  await expect(row(0).locator('.hair')).toBeVisible();
  await expect(row(1)).toContainText('Bovenlichaam');
  await expect(row(1)).toContainText('gisteren indoor cycling, je benen krijgen een rustdag');
  await expect(row(1).locator('.hair')).toHaveCount(0);
  await expect(row(2)).toContainText('Benen & romp');
  await expect(row(3)).toContainText('Tennis');
  await expect(row(3).locator('.hair')).toBeVisible();
  await expect(row(5)).toContainText('Indoor cycling (groepsles) · Jims · 10u');
  await expect(row(5)).toContainText('Lesmoment indoor cycling om 10u');
  await expect(row(6)).toContainText('Bovenlichaam');
  // De rustdag met droog weer: wandelen.
  await expect(row(4)).toContainText('Wandeling');
  await expect(row(4).locator('.wx')).toContainText('11°');
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
  // De weekendles liever kracht: kan wel, en terug.
  const weekendClass = page.locator('.plan-day', { hasText: 'Jims · 10u' });
  const day = (await weekendClass.locator('.plan-date').textContent())!;
  const sameDay = page.locator('.plan-day', { hasText: day });
  await weekendClass.getByRole('button').first().click();
  await page.getByRole('button', { name: /Liever kracht/ }).click();
  await expect(sameDay).toContainText(/Full body|Bovenlichaam|Benen & romp/);
  await expect(sameDay).toContainText('jouw keuze');
  await sameDay.getByRole('button').first().click();
  await page.getByRole('button', { name: /Terug naar het voorstel/ }).click();
  await expect(sameDay).toContainText('Indoor cycling');

  // Vandaag (indoor cycling): dagvorm + spierpijn in de benen → rustig meedraaien.
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
