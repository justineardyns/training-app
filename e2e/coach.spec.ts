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

test('de coach legt uit, laat je wisselen, kijkt naar je spieren en het weer', async ({ page }) => {
  const urls: string[] = [];
  await mockWeather(page, urls);
  await page.clock.setFixedTime(new Date('2026-11-23T08:00:00'));
  await page.goto('./');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Later koppelen' }).click();
  await page.getByRole('button', { name: 'Verder' }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();

  // Lesmomenten zijn zichtbaar bij het aanvinken; tennis op donderdag.
  await expect(page.getByRole('group', { name: 'Momenten op za 28/11' }).getByRole('button', { name: /Overdag · 🚴/ })).toBeVisible();
  await page.getByRole('group', { name: 'Tennis op do 26/11' }).getByRole('button', { name: /1u/ }).click();
  await page.getByRole('button', { name: 'Bewaar en plan' }).click();

  // Tennis is al je conditie: kracht gaat voor, en de coach zegt waarom er geen cycling staat.
  await expect(page.getByRole('heading', { name: 'Komende 7 dagen' })).toBeVisible();
  await expect(page.getByText(/Indoor cycling staat er deze 7 dagen niet in/)).toBeVisible();
  // ma kracht · do tennis · zo kracht (3 dagen na tennis: meer herstel dan zaterdag)
  const sun = page.locator('.plan-day').nth(6);
  await expect(sun).toContainText('Full body');
  await expect(sun).toContainText('Kracht gaat voor');
  // Weer per dag en wandelen op een droge rustdag.
  await expect(page.locator('.plan-day').nth(1)).toContainText('Wandeling');
  await expect(page.locator('.plan-day').nth(1).locator('.wx')).toContainText('11°');
  await snap(page, '10-week-waarom');

  // Jij kiest: zondag liever indoor cycling.
  await sun.getByRole('button').first().click();
  await snap(page, '11-wissel');
  await page.getByRole('button', { name: /Liever indoor cycling/ }).click();
  await expect(page.locator('.plan-day').nth(6)).toContainText('Indoor cycling (groepsles)');
  await expect(page.locator('.plan-day').nth(6)).toContainText('jouw keuze');
  await expect(page.getByText(/1× kracht in plaats van 2×/)).toBeVisible();

  // Vandaag: dagvorm + spierpijn → de training past zich aan je herstel aan.
  await page.getByRole('link', { name: /Vandaag/ }).click();
  await expect(page.locator('.eyebrow .wx')).toContainText('11°');
  await page.getByRole('button', { name: /Oké/ }).click();
  await page.getByRole('group', { name: 'Spierpijn' }).getByRole('button', { name: 'Benen' }).click();
  await expect(page.locator('.today-card')).toContainText('Benen nog moe (spierpijn)');
  await expect(page.locator('.rec.red')).toContainText('Benen');
  await expect(page.getByRole('heading', { name: 'Sterk en werkpunten' })).toBeVisible();
  // Bovenlichaam eerst.
  await expect(page.locator('.preview-name').first()).not.toContainText('Leg press');
  await snap(page, '12-vandaag-herstel');

  // Weer: plaats kiezen zonder typen.
  await page.getByRole('link', { name: /Meer/ }).click();
  await page.getByRole('button', { name: 'Weer voor je wandeldagen' }).click();
  await page.getByRole('button', { name: 'Gent', exact: true }).click();
  await expect(page.getByText(/Nu: Gent/)).toBeVisible();
  await expect.poll(() => urls.at(-1) ?? '').toContain('latitude=51.1&longitude=3.7');
  await snap(page, '13-weer');
});
