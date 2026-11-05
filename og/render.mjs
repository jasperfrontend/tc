// Renders og/og.html to public/og.png (1200x630) with headless Firefox.
// Usage: npm run og
import puppeteer from 'puppeteer-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = pathToFileURL(path.join(here, 'og.html')).href;
const out = path.join(here, '..', 'public', 'og.png');

const browser = await puppeteer.launch({
  browser: 'firefox',
  executablePath: process.env.FIREFOX_PATH || 'C:/Program Files/Mozilla Firefox/firefox.exe',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.goto(src, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(() =>
    [['800', 'Bricolage Grotesque'], ['700', 'Barlow Semi Condensed']].filter(([w, f]) => !document.fonts.check(`${w} 20px "${f}"`, 'Ab')).map(([, f]) => f));
  if (missing.length) throw new Error('Fonts not loaded: ' + missing.join(', '));
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log('wrote', out);
} finally {
  await browser.close();
}
