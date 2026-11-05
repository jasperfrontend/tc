// Renders a link-preview image per session: og/session.html -> public/og/s/<id>-<hash>.jpg
// The hash covers title, room, time and speakers, so a changed session gets a new
// file (and URL, so Discord fetches it again). Unchanged sessions are skipped and
// images of sessions that no longer exist are removed.
// Usage: npm run og:sessions [-- <sessions API url>]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import '../public/model.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '..', 'public');
const outDir = path.join(pub, 'og', 's');
const api = process.argv[2] || 'https://tc.jasper.stream/api/sessions';
const CONCURRENCY = 3;

const data = await (await fetch(api)).json();
if (!Array.isArray(data.sessions) || !data.sessions.length) throw new Error('No sessions from ' + api);
const previews = data.sessions.map((s) => globalThis.TCModel.preview(s));

fs.mkdirSync(outDir, { recursive: true });
const wanted = new Set(previews.map((p) => path.basename(p.image)));
let removed = 0;
for (const f of fs.readdirSync(outDir)) {
  if (!wanted.has(f)) { fs.unlinkSync(path.join(outDir, f)); removed++; }
}
const todo = previews.filter((p) => !fs.existsSync(path.join(pub, p.image)));
console.log(`${previews.length} sessions: ${todo.length} to render, ${previews.length - todo.length} up to date, ${removed} stale removed`);

if (todo.length) {
  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: process.env.FIREFOX_PATH || 'C:/Program Files/Mozilla Firefox/firefox.exe',
    headless: true,
  });
  try {
    let done = 0;
    const queue = todo.slice();
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(path.join(here, 'session.html')).href, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      for (let p; (p = queue.shift());) {
        await page.evaluate((x) => window.fill(x), p);
        await page.evaluate(() => document.fonts.ready); // titles with accents etc. may pull in more font subsets
        await page.screenshot({ path: path.join(pub, p.image), type: 'jpeg', quality: 86, clip: { x: 0, y: 0, width: 1200, height: 630 } });
        if (++done % 50 === 0) console.log(`  ${done}/${todo.length}`);
      }
      await page.close();
    }));
  } finally {
    await browser.close();
  }
}
const bytes = fs.readdirSync(outDir).reduce((n, f) => n + fs.statSync(path.join(outDir, f)).size, 0);
console.log(`done: ${wanted.size} images, ${(bytes / 1048576).toFixed(1)} MB`);
