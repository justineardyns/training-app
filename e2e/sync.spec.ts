import { expect, test, type Page } from '@playwright/test';
import { FakeGitHub } from '../src/data/fakeGithub.ts';

/** Stuurt alle GitHub API-verkeer naar de nagebootste GitHub (geen echt netwerk). */
async function mockGitHub(page: Page, gh: FakeGitHub) {
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type, accept, x-github-api-version',
      'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const res = await gh.fetch(req.url(), {
      method: req.method(),
      headers: { Authorization: req.headers()['authorization'] ?? '' },
      body: req.postData() ?? undefined,
    });
    await route.fulfill({ status: res.status, headers: { ...cors, 'content-type': 'application/json' }, body: await res.text() });
  });
}

test('koppelen, training bewaren en naar de privé-repo pushen; herstellen op een nieuw toestel', async ({ page, browser }) => {
  const gh = new FakeGitHub();
  await mockGitHub(page, gh);
  await page.clock.setFixedTime(new Date('2026-11-23T08:00:00'));
  await page.goto('./');
  await page.getByRole('button', { name: 'Start' }).click();

  // Koppelen met token (enkel plakken; gebruiker en repo staan ingevuld)
  await page.getByPlaceholder('github_pat_…').fill('good');
  await page.getByLabel('Gebruiker').fill('jij');
  await page.getByRole('button', { name: 'Koppel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Je materiaal thuis' })).toBeVisible();
  await page.getByRole('button', { name: 'Verder' }).click();
  await page.getByRole('button', { name: 'Verder' }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();
  await page.getByRole('button', { name: /Beschikbaarheid ingeven/ }).click();
  await page.getByRole('button', { name: 'Bewaar en plan' }).click();

  // Snelle groepsles loggen → wordt gesynct
  await page.getByRole('link', { name: /Vandaag/ }).click();
  await page.getByRole('button', { name: /Groepsles of cardio gedaan/ }).click();
  await page.getByRole('button', { name: 'Bewaar' }).click();

  await expect.poll(() => Object.keys(gh.files()).sort(), { timeout: 10_000 }).toEqual(
    expect.arrayContaining(['data/profile.json', 'data/availability/2026-W48.json', 'data/log/2026-W48.json']),
  );
  await expect.poll(() => JSON.parse(gh.files()['data/log/2026-W48.json'] ?? '{"sessions":[]}').sessions.length, { timeout: 10_000 }).toBe(1);

  // Syncstatus in Meer
  await page.getByRole('link', { name: /Meer/ }).click();
  await expect(page.getByText(/Gekoppeld met/)).toBeVisible();
  await expect(page.getByText(/alles gesynct/)).toBeVisible();

  // Nieuw toestel: alles komt terug, setup wordt overgeslagen
  const ctx2 = await browser.newContext({ baseURL: 'http://localhost:4173/training-app/' });
  const p2 = await ctx2.newPage();
  await mockGitHub(p2, gh);
  await p2.clock.setFixedTime(new Date('2026-11-23T09:00:00'));
  await p2.goto('./');
  await p2.getByRole('button', { name: 'Start' }).click();
  await p2.getByPlaceholder('github_pat_…').fill('good');
  await p2.getByLabel('Gebruiker').fill('jij');
  await p2.getByRole('button', { name: 'Koppel', exact: true }).click();
  await expect(p2.getByRole('heading', { name: 'Vandaag' })).toBeVisible();
  await p2.getByRole('link', { name: /Week/ }).click();
  await expect(p2.locator('.plan-day.done')).toHaveCount(1);
  await ctx2.close();
});
