// README screenshots: plays one 4-player game on a fresh local `wrangler dev` and captures each screen.
// Usage: node tools/screenshots.mjs http://localhost:8799/ docs/screenshots
// Run it against an empty local state only: the game it plays is archived.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const api = p => new URL(p, base).href;
const wait = ms => new Promise(r => setTimeout(r, ms));

const { code } = await (await fetch(api('/api/room'), { method: 'POST' })).json();
const ws = new WebSocket(api(`/api/room/${code}/ws`).replace(/^http/, 'ws'));
let S = null; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') S = m.state; };
await new Promise(r => ws.onopen = r);
const send = async action => { const v = S?.v ?? -1; ws.send(JSON.stringify({ action })); for (let i = 0; i < 100 && !(S && S.v > v); i++) await wait(30); };
await wait(300);

const b = await chromium.launch({ channel: 'chrome' });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const shot = n => page.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 82 });

// setup
await send({ t: 'setN', n: 4 });
const names = ['老张', '小李', '阿美', '大刘'];
for (let i = 0; i < 4; i++) await send({ t: 'player', i, name: names[i] });
await send({ t: 'player', i: 1, fig: 'walker' });
await page.goto(api(`/?r=${code}`)); await page.waitForSelector('[data-act="start"]'); await wait(800);
await shot('setup');
await page.click('[data-act="shuffle"]'); await wait(4000);   // all four drawn
await shot('draw');
await wait(2500);
await send({ t: 'start' });

// first three rounds, then the order tab
const spends = [[4, 9, 0, 6], [12, 3, 8, 8], [5, 15, 2, 10]];
for (const sp of spends) {
  await send({ t: 'settle', era: S.era, round: S.round, spent: Object.fromEntries(S.order.map((id, i) => [id, sp[i]])) });
  await wait(2600);
}
await page.click('[data-act="tab"][data-tab="order"]'); await wait(600);
await shot('order');

// rest of the game
while (S.stage !== 'over') {
  await send({ t: 'settle', era: S.era, round: S.round, spent: Object.fromEntries(S.order.map((id, i) => [id, (S.round * 3 + i * 5) % 17])) });
  if (S.stage !== 'over') await wait(2600);
}

// scores: per player era 1 / era 2 (pre = track before era scoring)
const sc = {
  yellow: { 1: { mid: 6, rail: [3, 4, 2], ind: [5, 8], alt: 0 }, 2: { mid: 14, rail: [4, 5, 3, 6], ind: [10, 8, 12], alt: 0, loco: 2, inc: 18, cash: 7 } },
  blue: { 1: { mid: 9, rail: [5, 3, 4, 2], ind: [6, 4], alt: 3 }, 2: { mid: 11, rail: [6, 5, 4], ind: [15, 9], alt: 4, loco: 0, inc: 15, cash: 22 } },
  orange: { 1: { mid: 4, rail: [2, 3], ind: [8, 8, 5], alt: 0 }, 2: { mid: 18, rail: [3, 4, 5, 3, 2], ind: [12, 10], alt: 0, loco: 3, inc: 21, cash: 3 } },
  purple: { 1: { mid: 7, rail: [4, 4], ind: [6, 5], alt: 2 }, 2: { mid: 9, rail: [5, 3], ind: [20, 11, 7], alt: 0, loco: 1, inc: 12, cash: 14 } }
};
for (const id of S.order) {
  const e1 = sc[id][1], e2 = sc[id][2], sum = a => a.reduce((x, y) => x + y, 0);
  const t1 = e1.mid + sum(e1.rail) + sum(e1.ind) + e1.alt;
  await send({ t: 'score', era: 1, id, key: 'pre', value: String(e1.mid) });
  for (const k of ['rail', 'ind']) await send({ t: 'score', era: 1, id, key: k, value: e1[k] });
  await send({ t: 'score', era: 1, id, key: 'alt', value: String(e1.alt) });
  await send({ t: 'score', era: 2, id, key: 'pre', value: String(t1 + e2.mid) });
  for (const k of ['rail', 'ind']) await send({ t: 'score', era: 2, id, key: k, value: e2[k] });
  for (const k of ['alt', 'loco', 'inc', 'cash']) await send({ t: 'score', era: 2, id, key: k, value: String(e2[k]) });
}
await wait(600);

await page.click('[data-act="tab"][data-tab="score"]'); await page.click('[data-act="era"][data-era="2"]'); await wait(600);
await shot('score');
await page.click('[data-act="tab"][data-tab="mvp"]'); await wait(800);
await shot('results');
await page.click('[data-act="save"]'); await page.waitForSelector('.shotv img', { timeout: 20000 });
writeFileSync(`${out}/long.jpg`, Buffer.from((await page.$eval('.shotv img', i => i.src)).split(',')[1], 'base64'));
await page.click('.shotv button');

await page.goto(api('/history')); await page.waitForSelector('.game'); await page.click('.game summary'); await wait(500);
await shot('history');
await page.goto(api('/guide')); await wait(1500);
await shot('guide');
await page.goto(api('/guide#faq')); await wait(1000);
await shot('faq');
await page.goto(api('/')); await page.waitForSelector('.lobby'); await wait(1000);
await shot('landing');

ws.close(); await b.close();
console.log('room', code, 'done');
