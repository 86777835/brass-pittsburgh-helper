// Score tab era: in era 2 the score tab opens on era 1 while era 1 is empty, and it stays on era 1 after a
// score is entered there, on this phone or another one (it used to jump to era 2 after the first number).
// Leaving the tab and coming back opens on era 2 once era 1 has scores.
// Usage: node tests/test_score_era.mjs <baseUrl>   (local wrangler dev only: it plays a whole era)
import { chromium } from 'playwright-core';
const [,, BASE] = process.argv;
const b = await chromium.launch({ channel: 'chrome' });
const mk = async () => {
  const p = await (await b.newContext({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true })).newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(String(e)));
  return p;
};
const A = await mk(), B = await mk();
let fails = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const era = p => p.getAttribute('.seg button.on', 'data-era');

await A.goto(BASE); await A.click('[data-act="create"]'); await A.waitForURL(/\?r=[A-Z0-9]{4}/);
await B.goto(A.url()); await B.waitForSelector('.chip');
await A.click('[data-act="n"][data-n="4"]'); await wait(300);
await A.click('[data-act="start"]'); await A.waitForSelector('.status');
for (let r = 1; r <= 8; r++) {   // 4 players: 8 rounds per era on both sites
  for (const el of await A.$$('[data-spent]')) await el.fill('0');
  await A.click('[data-act="settle"]'); await wait(2700);
}
eq('era 2 has started', /^(第一时代|运河时代) /.test(await A.textContent('.status .t')), false);

await A.click('[data-act="tab"][data-tab="score"]'); await B.click('[data-act="tab"][data-tab="score"]'); await wait(300);
eq('era 1 empty: both phones open the score tab on era 1', [await era(A), await era(B)], ['1', '1']);
await A.click('[data-act="cell"][data-era="1"]'); await A.click('[data-act="k"][data-k="5"]'); await A.click('[data-act="k"][data-k="ok"]'); await wait(600);
eq('after entering an era 1 score, both phones stay on era 1', [await era(A), await era(B)], ['1', '1']);
eq('the score is there', await A.textContent('[data-act="cell"][data-era="1"]'), '5');
await B.locator('[data-act="cell"][data-era="1"]').nth(1).click(); await B.click('[data-act="k"][data-k="7"]'); await B.click('[data-act="k"][data-k="ok"]'); await wait(600);
eq('a second score keeps both on era 1', [await era(A), await era(B)], ['1', '1']);
await A.click('[data-act="tab"][data-tab="order"]'); await A.click('[data-act="tab"][data-tab="score"]'); await wait(300);
eq('back to the score tab: opens on era 2 now that era 1 has scores', await era(A), '2');
await A.click('[data-act="era"][data-era="1"]'); await wait(200);
eq('the era switch still works', await era(A), '1');
eq('no page errors', [...A.errs, ...B.errs], []);
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
