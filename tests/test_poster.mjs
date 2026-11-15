// Print poster: a finished 2-player and 4-player game each make a 1200×1800 photo from the 「打印海报」 button.
// Saves the posters as <out>/poster_2p.jpg and poster_4p.jpg to look at; the button sits under the long-image buttons.
// Usage: node tests/test_poster.mjs <baseUrl> <outDir>   (local wrangler dev only: it plays whole games)
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const [,, BASE, OUT] = process.argv;
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const NAMES = ['小明', '阿花', 'Alexander', '老王'];

async function game(n) {
  const p = await (await b.newContext({ viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route('https://boardgame.leisurecat.cloud/api/reviews**', r => r.fulfill({ json: { ok: true } }));
  await p.goto(BASE); await p.click('[data-act="create"]'); await p.waitForURL(/\?r=[A-Z0-9]{4}/);
  await p.click(`[data-act="n"][data-n="${n}"]`); await wait(300);
  for (let i = 0; i < n; i++) await p.fill(`[data-name="${i}"]`, NAMES[i]);
  await wait(700); await p.click('[data-act="start"]'); await p.waitForSelector('.status');
  for (let r = 1; r <= 16; r++) {
    const els = await p.$$('[data-spent]');
    for (const [i, el] of els.entries()) await el.fill(String((r * (i + 3)) % 9));
    await p.click('[data-act="settle"]'); await wait(2700);
  }
  await p.click('[data-act="tab"][data-tab="score"]'); await p.click('[data-act="era"][data-era="2"]');
  const ids = await p.$$eval('[data-act="cell"][data-era="2"][data-key="pre"]', l => l.map(x => x.dataset.id));
  const keyIn = async (id, key, seq) => {
    await p.click(`[data-act="cell"][data-era="2"][data-id="${id}"][data-key="${key}"]`);
    for (const k of seq) await p.click(`[data-act="k"][data-k="${k}"]`);
    await wait(250);
  };
  for (const [i, id] of ids.entries()) {
    await keyIn(id, 'pre', String(60 + i * 17).split('').concat('ok'));
    await keyIn(id, 'rail', [String(4 + i), '+', String(9 - i), 'ok']);
    await keyIn(id, 'ind', [String(8 - i), '+', '6', 'ok']);
  }
  await p.click('[data-act="tab"][data-tab="mvp"]'); await p.waitForSelector('[data-act="poster"]');
  eq(`${n}p: print button`, (await p.textContent('[data-act="poster"]')).trim(), '打印海报（3 寸相纸）');
  await p.screenshot({ path: `${OUT}/poster_btn_${n}p.png` });
  await p.click('[data-act="poster"]'); await p.waitForSelector('.shotv img', { timeout: 15000 });
  const img = await p.$eval('.shotv img', i => i.decode().then(() => ({ w: i.naturalWidth, h: i.naturalHeight, src: i.src })));
  eq(`${n}p: poster is 1200×1800`, [img.w, img.h], [1200, 1800]);
  eq(`${n}p: tells how to print`, (await p.textContent('.sv-top span')).includes('3 寸相纸'), true);
  eq(`${n}p: download name`, await p.getAttribute('.sv-top a', 'download'), `匹兹堡海报-${new URL(p.url()).searchParams.get('r')}.jpg`);
  writeFileSync(`${OUT}/poster_${n}p.jpg`, Buffer.from(img.src.split(',')[1], 'base64'));
  eq(`${n}p: no page errors`, errs, []);
}
await Promise.all([game(2), game(4)]);
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
