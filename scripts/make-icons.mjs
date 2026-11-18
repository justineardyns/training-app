// Maakt de PNG-iconen uit public/icons/icon.svg met de headless browser van Playwright.
// Gebruik: npm run icons
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const targets = [
  { file: 'public/icons/icon-192.png', size: 192, pad: 0, round: true },
  { file: 'public/icons/icon-512.png', size: 512, pad: 0, round: true },
  // iOS rondt zelf af: volle vierkante achtergrond.
  { file: 'public/icons/apple-touch-icon.png', size: 180, pad: 0, round: false },
  // Maskable: logo binnen de veilige zone (80%).
  { file: 'public/icons/icon-maskable-512.png', size: 512, pad: 0.12, round: false },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const t of targets) {
  const inner = t.round ? svg : svg.replace('rx="112"', 'rx="0"');
  const padPx = Math.round(t.size * t.pad);
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:#0b0d10;${t.round ? 'background:transparent;' : ''}">
       <div style="width:${t.size}px;height:${t.size}px;box-sizing:border-box;padding:${padPx}px;background:${t.round ? 'transparent' : '#0b0d10'}">
         ${inner.replace('<svg ', `<svg width="${t.size - 2 * padPx}" height="${t.size - 2 * padPx}" `)}
       </div></body></html>`,
  );
  const png = await page.screenshot({ omitBackground: t.round, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  writeFileSync(t.file, png);
  console.log('✓', t.file);
}
await browser.close();
