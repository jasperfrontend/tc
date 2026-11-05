// Builds the favicons: white "TC" in Bricolage Grotesque ExtraBold on #fa1ed2.
// The letters are converted to SVG paths (favicons can't load web fonts), then
// rasterised with resvg (https://github.com/linebender/resvg, must be on PATH).
// Usage: npm run favicon
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '..', 'public');
const BG = '#fa1ed2';
const FG = '#ffffff';
const TEXT = 'TC';
const TRACKING = -0.02; // em; pulls the T and C a little closer

// 1. a static ExtraBold instance of Bricolage Grotesque, subset to "TC", as TTF
const css = await (await fetch(
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@96,800&text=' + TEXT,
  { headers: { 'User-Agent': 'Wget/1.21' } }, // old UA => Google serves TTF, which opentype.js reads
)).text();
const ttfUrl = css.match(/url\((https:[^)]+)\)\s*format\('truetype'\)/)?.[1];
if (!ttfUrl) throw new Error('No TTF in Google Fonts response');
const font = opentype.parse((await (await fetch(ttfUrl)).arrayBuffer()));

// 2. lay out the glyphs with kerning + tracking at 1000 units
function textPath(size) {
  const glyphs = font.stringToGlyphs(TEXT);
  const scale = size / font.unitsPerEm;
  const p = new opentype.Path();
  let x = 0;
  glyphs.forEach((g, i) => {
    p.extend(g.getPath(x, 0, size));
    x += g.advanceWidth * scale + TRACKING * size;
    if (glyphs[i + 1]) x += font.getKerningValue(g, glyphs[i + 1]) * scale;
  });
  return p;
}
const base = textPath(1000);
const bb = base.getBoundingBox();

// 3. an SVG with the letters fitted and centred on their ink box
function svg({ canvas = 512, radius = 112, fill = 0.74 }) {
  const w = bb.x2 - bb.x1, h = bb.y2 - bb.y1;
  const s = (canvas * fill) / w;
  const tx = (canvas - w * s) / 2 - bb.x1 * s;
  const ty = (canvas - h * s) / 2 - bb.y1 * s;
  const d = textPath(1000 * s).toPathData(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}">` +
    `<rect width="${canvas}" height="${canvas}" rx="${radius}" fill="${BG}"/>` +
    `<path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)})" fill="${FG}" d="${d}"/></svg>\n`;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-favicon-'));
function png(svgText, size, out) {
  const src = path.join(tmp, `${size}.svg`);
  fs.writeFileSync(src, svgText);
  execFileSync('resvg', ['-w', String(size), '-h', String(size), src, out]);
  return fs.readFileSync(out);
}

// favicon.svg: modern browsers
const icon = svg({});
fs.writeFileSync(path.join(pub, 'favicon.svg'), icon);

// favicon.ico: 16/32/48 PNG entries, for /favicon.ico requests and older clients
const sizes = [16, 32, 48];
const pngs = sizes.map((n) => png(icon, n, path.join(tmp, `${n}.png`)));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((n, i) => {
  const e = 6 + i * 16;
  head.writeUInt8(n, e); head.writeUInt8(n, e + 1);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
fs.writeFileSync(path.join(pub, 'favicon.ico'), Buffer.concat([head, ...pngs]));

// apple-touch-icon.png: full-bleed square, iOS rounds the corners itself
png(svg({ radius: 0, fill: 0.62 }), 180, path.join(pub, 'apple-touch-icon.png'));

fs.rmSync(tmp, { recursive: true, force: true });
console.log('wrote favicon.svg, favicon.ico, apple-touch-icon.png');
