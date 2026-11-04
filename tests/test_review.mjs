// Rating card on the results tab. Plays a quick game on local `wrangler dev`, then rates it (hub endpoint mocked).
import { chromium } from 'playwright-core';
const [base] = process.argv.slice(2);
const api = p => new URL(p, base).href;
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); };

const { code } = await (await fetch(api('/api/room'), { method: 'POST' })).json();
const ws = new WebSocket(api(`/api/room/${code}/ws`).replace(/^http/, 'ws'));
let S = null; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') S = m.state; };
await new Promise(r => ws.onopen = r);
const send = async action => { const v = S?.v ?? -1; ws.send(JSON.stringify({ action })); for (let i = 0; i < 100 && !(S && S.v > v); i++) await wait(30); };
await wait(300);
await send({ t: 'setN', n: 2 });
await send({ t: 'player', i: 0, name: '老张' }); await send({ t: 'player', i: 1, name: '小李' });
await send({ t: 'start' });
while (S.stage !== 'over') await send({ t: 'settle', era: S.era, round: S.round, spent: Object.fromEntries(S.order.map((id, i) => [id, i])) });
for (const [k, id] of S.order.entries()) { await send({ t: 'score', era: 1, id, key: 'pre', value: String(10 + k) }); await send({ t: 'score', era: 2, id, key: 'pre', value: String(40 + k) }); }

const b = await chromium.launch({ channel: 'chrome' });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
const posted = [];
await page.route('https://boardgame.leisurecat.cloud/api/reviews', async r => {
  posted.push(JSON.parse(r.request().postData()));
  await r.fulfill({ json: { ok: true, avg: 4, count: 1 }, headers: { 'access-control-allow-origin': '*' } });
});
await page.goto(api(`/?r=${code}`)); await page.waitForSelector('[data-act="tab"][data-tab="mvp"]');
await page.click('[data-act="tab"][data-tab="mvp"]'); await page.waitForSelector('.rv');
eq('send disabled until who + stars', await page.isDisabled('[data-act="rv-send"]'), true);
await page.click('[data-act="rv-who"] >> nth=1');
await page.click('[data-act="rv-star"][data-n="4"]');
eq('4 stars lit', await page.$$eval('.rv-st button.on', l => l.length), 4);
eq('star label', await page.textContent('.rv-st span'), '好玩');
await page.fill('[data-rv]', '顺位自动排，省心');
await page.click('[data-act="rv-star"][data-n="5"]');   // a re-render must keep the typed text
eq('text kept across re-render', await page.inputValue('[data-rv]'), '顺位自动排，省心');
await page.screenshot({ path: './shots/review_form.png', fullPage: false });
await page.click('[data-act="rv-send"]'); await page.waitForSelector('.rv-done');
const who = posted[0]?.name;
eq('posted to the hub', [posted.length, posted[0].game, posted[0].stars, posted[0].text, posted[0].room], [1, 'pgh', 5, '顺位自动排，省心', code]);
eq('posted a player name of this room', ['老张', '小李'].includes(who), true);
eq('thanks shown', (await page.textContent('.rv p')).includes(who), true);
await page.reload(); await page.waitForSelector('[data-act="tab"]');
await page.click('[data-act="tab"][data-tab="mvp"]'); await page.waitForSelector('.rv');
eq('sent state remembered after reload', !!(await page.$('.rv-done')), true);
await page.click('[data-act="rv-edit"]');
eq('edit restores the form with the stars', await page.$$eval('.rv-st button.on', l => l.length), 5);
await page.screenshot({ path: './shots/review_edit.png' });
eq('no page errors', errs, []);
ws.close(); await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
