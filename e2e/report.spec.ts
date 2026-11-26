import { expect, test } from '@playwright/test';
import { seedFiles } from './seed.ts';

const shots = process.env.SHOTS_DIR;

test('weekrapport met grafieken, tabellen en het /coach-rapport', async ({ page }) => {
  const today = '2026-11-20'; // vrijdag
  await page.clock.setFixedTime(new Date(`${today}T19:00:00`));
  await page.goto('./');
  const files = seedFiles(today);
  await page.evaluate(async (records) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('coach', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('files', { keyPath: 'path' });
        req.result.createObjectStore('local');
      };
      req.onsuccess = () => {
        const tx = req.result.transaction('files', 'readwrite');
        for (const r of records) tx.objectStore('files').put(r);
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, files);
  await page.goto('./#/rapport');
  await page.reload();

  await expect(page.locator('.tile').first()).toContainText('Sessies');
  await expect(page.locator('.multiples svg.viz')).toHaveCount(4);
  await expect(page.locator('.barrow').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Je coachsessie' })).toBeVisible();
  await expect(page.locator('.md blockquote')).toContainText('Sterke week');
  if (shots) await page.screenshot({ path: `${shots}/10-rapport.png`, fullPage: true });

  // Tik op een punt → tooltip
  const chart = page.locator('.multiples svg.viz').first();
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height / 2);
  await expect(chart.locator('.viz-tip')).toBeVisible();
  if (shots) await chart.screenshot({ path: `${shots}/11-tooltip.png` });

  await page.getByRole('button', { name: 'Toon als tabel' }).click();
  await expect(page.locator('.datatable')).toHaveCount(3);

  // Vorige week bekijken
  await page.getByRole('button', { name: 'Vorige week' }).click();
  await expect(page.getByRole('heading', { name: 'Vorige week' })).toBeVisible();
});

test('doelen: weekdoel met bolletjes op Vandaag, persoonlijk doel met één tik', async ({ page }) => {
  const today = '2026-11-20'; // vrijdag
  await page.clock.setFixedTime(new Date(`${today}T19:00:00`));
  await page.goto('./');
  const files = seedFiles(today);
  await page.evaluate(async (records) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('coach', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('files', { keyPath: 'path' });
        req.result.createObjectStore('local');
      };
      req.onsuccess = () => {
        const tx = req.result.transaction('files', 'readwrite');
        for (const r of records) tx.objectStore('files').put(r);
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, files);
  await page.goto('./#/vandaag');
  await page.reload();

  // Vandaag: je weekdoel als bolletjes (standaard 3× minstens 30 min in Jims).
  const bar = page.locator('.weekgoal');
  await expect(bar).toBeVisible();
  await expect(bar.locator('.wg-dot')).toHaveCount(3);
  if (shots) await page.screenshot({ path: `${shots}/21-weekdoel.png` });
  await bar.click();

  // Rapport: kies een voorgesteld doel met één tik.
  const card = page.locator('.card.goals');
  await expect(card).toContainText('3× per week minstens 30 min in Jims');
  const suggestion = card.locator('.goal-suggest .btn').first();
  const text = (await suggestion.textContent())!.replace('+ ', '').trim();
  await suggestion.click();
  await expect(card.locator('.goal')).toContainText(text);
  await expect(card.locator('.goal-bar')).toBeVisible();
  if (shots) await card.screenshot({ path: `${shots}/22-doelen.png` });

  // Weekdoel aanpassen: twee tikken.
  await card.getByRole('button', { name: 'aanpassen' }).click();
  await page.getByRole('group', { name: 'Keer per week' }).getByRole('button', { name: '4×' }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();
  await expect(card).toContainText('4× per week');
  await page.getByRole('link', { name: /Vandaag/ }).click();
  await expect(page.locator('.weekgoal .wg-dot')).toHaveCount(4);
});
