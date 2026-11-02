// Extra checks: 4 players, small screens, join by code, bad room, invalid input, undo, offline, tie-break, reset.
// Usage: node test_room2.mjs <baseUrl> <outDir>
import { chromium } from 'playwright-core';
const [,, BASE, OUT] = process.argv;
const b = await chromium.launch({ channel: 'chrome' });
const mk = async (w, h) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); p.ctx = ctx; p.errs = []; p.h = h;
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => m.type() === 'error' && p.errs.push(m.text()));
  p.on('dialog', d => d.accept());
  return p;
};
const A = await mk(375, 667), B = await mk(390, 760), C = await mk(360, 740);   // iPhone SE, iPhone, Android
let fails = 0; const issues = [];
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; issues.push(name); } console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
const status = p => p.textContent('.status .t');
const fitsScreen = async (p, sel) => { const bx = await p.locator(sel).first().boundingBox(); return bx ? Math.round(bx.y + bx.height) : -1; };
const settleBy = async p => { await p.click('[data-act="settle"]'); await wait(2800); };

// bad room code
await A.goto(BASE); await A.fill('#joinCode', 'zzzz'); await A.click('[data-act="join"]'); await wait(1500);
eq('unknown room message', (await A.textContent('h2.h')).includes('不存在'), true);
await shot(A, '00_badroom');
await A.click('[data-act="leave"]'); await wait(300);
eq('back to landing', await A.isVisible('[data-act="create"]'), true);

// create + join by code + join by link
await A.click('[data-act="create"]'); await A.waitForURL(/\?r=/);
const code = new URL(A.url()).searchParams.get('r'); console.log('room', code);
await C.goto(BASE); await C.fill('#joinCode', code.toLowerCase()); await C.press('#joinCode', 'Enter'); await C.waitForSelector('.chip');
await B.goto(A.url()); await B.waitForSelector('.chip');
const D = await mk(390, 760); await D.goto(BASE); await D.waitForSelector(`[data-code="${code}"]`, { timeout: 15000 });
eq('lobby lists the room with players online', (await D.textContent(`[data-code="${code}"]`)).includes('在线'), true);
await shot(D, '00b_lobby');
await D.click(`[data-code="${code}"]`); await D.waitForSelector('.chip');
eq('D joined from list', new URL(D.url()).searchParams.get('r'), code);
await D.ctx.close();
eq('C joined by typed code', new URL(C.url()).searchParams.get('r'), code);

// 3 players: colour swap to an unused colour, then back to 4
await A.click('[data-act="n"][data-n="3"]'); await wait(400);
await C.click('[data-act="color"][data-i="0"][data-c="purple"]'); await wait(500);
eq('seat 1 is purple on A', await A.getAttribute('[data-act="fig"][data-i="0"]', 'style'), '--c:var(--purple)');
eq('character tile moves with its color', await A.getAttribute('[data-act="fig"][data-i="0"] img', 'src'), 'img/rockefeller.jpg');
await A.click('[data-act="n"][data-n="4"]'); await wait(400);
eq('4 seats on C', await C.$$eval('[data-k^="seat-"]', r => r.length), 4);
const names = ['老张', '小李', '阿美', '大刘'];
for (let i = 0; i < 4; i++) await [A, B, C, A][i].fill(`[data-name="${i}"]`, names[i]);
await A.press('[data-name="3"]', 'Enter'); await wait(900);
eq('names synced to B', await Promise.all([0, 1, 2, 3].map(i => B.inputValue(`[data-name="${i}"]`))), names);
await B.click('[data-act="fig"][data-i="1"]'); await wait(200);
eq('blue picker offers only its two sides', await B.$$eval('[data-act="pick"]', b => b.map(x => x.dataset.fig)), ['tesla', 'walker']);
await B.click('.sheet [data-act="close"]');
await C.click('[data-act="fig"][data-i="0"]');
eq('purple picker offers only its two sides', await C.$$eval('[data-act="pick"]', b => b.map(x => x.dataset.fig)), ['rockefeller', 'morgan']);
await C.click('[data-act="pick"][data-fig="morgan"]'); await wait(400);
eq('flipped tile synced to A', await A.getAttribute('[data-act="fig"][data-i="0"] img', 'src'), 'img/morgan.jpg');
await shot(A, '01_setup4_se');
await C.click('[data-act="start"]'); await A.waitForSelector('.status'); await wait(400);
const seatIds = (await A.$$eval('.slot', s => s.map(x => x.dataset.k.slice(5))));
console.log('order', seatIds.join(','));

// one-screen checks
const bottomA = await fitsScreen(A, '[data-act="settle"]');
console.log('SE 375x667: settle button bottom at', bottomA, '(screen 667)');
eq('SE: settle button visible without scrolling', bottomA <= 667, true);
eq('Android 360x740: settle visible', (await fitsScreen(C, '[data-act="settle"]')) <= 740, true);
await shot(A, '02_round1_se'); await shot(C, '02_round1_android');

// invalid spend blocks settle
await A.fill(`[data-spent="${seatIds[0]}"]`, '-3'); await wait(400);
await A.click('[data-act="settle"]'); await wait(800);
eq('negative spend error shown', (await A.textContent('.err')).includes('不是有效金额'), true);
eq('round not advanced', await status(B), '第一时代 · 第1/ 8 轮');
// rapid taps on + are all counted locally
for (let i = 0; i < 15; i++) await C.click(`[data-act="plus"][data-id="${seatIds[2]}"]`);
eq('15 quick taps = 15', await C.inputValue(`[data-spent="${seatIds[2]}"]`), '15');
await C.fill(`[data-spent="${seatIds[2]}"]`, '');
eq('spend not pushed to other phones before settling', await B.inputValue(`[data-spent="${seatIds[0]}"]`), '');
await C.fill(`[data-spent="${seatIds[0]}"]`, '5');
await C.fill(`[data-spent="${seatIds[1]}"]`, '12'); await wait(300);
await settleBy(C);
eq('B sees settled amounts on the track', await B.$$eval('.slot .m', m => m.map(x => x.textContent).sort()), ['$0', '$0', '$12', '$5']);
eq('round 2 after settle', await status(A), '第一时代 · 第2/ 8 轮');
await A.click('[data-act="undo"]'); await wait(800);
eq('undo back to round 1', await status(C), '第一时代 · 第1/ 8 轮');
eq('undo restores typed spend', await C.inputValue(`[data-spent="${seatIds[1]}"]`), '12');
await settleBy(B);

// offline phone catches up after reconnecting
await C.ctx.setOffline(true); await wait(500);
await settleBy(A);
await C.ctx.setOffline(false);
let caught = false;
for (let i = 0; i < 20 && !caught; i++) { await wait(500); caught = (await status(C)) === '第一时代 · 第3/ 8 轮'; }
eq('offline phone caught up after reconnect', caught, true);

// play to the end with zero spends
for (let r = 3; r <= 16; r++) {
  await settleBy([A, B, C][r % 3]);
  if (r === 8) { const bt = await fitsScreen(A, '[data-act="settle"]'); console.log('SE era-change screen: settle bottom', bt); eq('SE: settle visible with era banner', bt <= 667, true); await shot(A, '03_era2_se'); }
}
eq('game over', await status(C), '游戏结束');

// scores: make two players tie at the top, then break with income
const fillCell = async (p, era, id, key, digits) => {
  await p.click(`[data-act="cell"][data-era="${era}"][data-id="${id}"][data-key="${key}"]`);
  for (const k of [...digits, 'ok']) await p.click(`[data-act="k"][data-k="${k}"]`);
  await wait(250);
};
await B.click('[data-act="tab"][data-tab="score"]'); await B.click('[data-act="era"][data-era="1"]');
await B.click(`[data-act="cell"][data-era="1"][data-id="${seatIds[0]}"][data-key="rail"]`);
await B.click('[data-act="k"][data-k="3"]'); await B.click('[data-act="k"][data-k="+"]');
eq('plus shows right away', (await B.textContent('.disp .ex')).trim(), '3 +');
for (const k of ['4', '-', '2']) await B.click(`[data-act="k"][data-k="${k}"]`);
eq('expression with minus', (await B.textContent('.disp .ex')).trim(), '3 + 4 − 2');
eq('expression total', (await B.textContent('.disp .cur')).trim(), '= 5');
await shot(B, '03b_keypad');
await B.click('[data-act="k"][data-k="clr"]'); await B.click('[data-act="k"][data-k="ok"]'); await wait(300);
const [p1, p2, p3, p4] = seatIds;
await fillCell(B, 1, p1, 'pre', ['1', '0']); await fillCell(B, 1, p2, 'pre', ['5', '0', '-', '2', '0']);
eq('pre via 50 − 20 = 30', (await B.textContent(`[data-act="cell"][data-era="1"][data-id="${p2}"][data-key="pre"]`)).trim(), '30');
await fillCell(B, 1, p3, 'pre', ['2', '0']); await fillCell(B, 1, p4, 'pre', ['5']);
await B.click('[data-act="era"][data-era="2"]');
await fillCell(B, 2, p1, 'pre', ['8', '0']); await fillCell(B, 2, p2, 'pre', ['8', '0']);
await fillCell(B, 2, p3, 'pre', ['6', '0']); await fillCell(B, 2, p4, 'pre', ['2', '0']);
await shot(B, '04_score_era2');
await A.click('[data-act="tab"][data-tab="mvp"]'); await wait(600);
eq('tie shows joint first', (await A.textContent('.mvp .crown')).replace(/\s/g, ''), '并列第一');
eq('tie-break inputs for both', await A.$$eval('[data-k^="tb-"]', r => r.length), 2);
await shot(A, '05_mvp_tie_se');
await A.fill(`[data-sc="2:${p2}:inc"]`, '7'); await A.fill(`[data-sc="2:${p1}:inc"]`, '3'); await A.press(`[data-sc="2:${p1}:inc"]`, 'Enter'); await wait(1200);
const nameOf = id => names[seatIds.indexOf(id)];
eq('income breaks tie on C', (await (async () => { await C.click('[data-act="tab"][data-tab="mvp"]'); await wait(400); return (await C.textContent('.mvp .nm')).trim(); })()), nameOf(p2));
const achs = await C.$$eval('.ach', a => a.map(x => x.querySelector('.an').textContent));
console.log('achievements', achs.join(' / '));
eq('rise achievement for p1 (3rd -> 2nd)', achs.includes('后来居上'), true);
await shot(C, '06_mvp_android');

// reset returns everyone to setup with names kept
await B.click('[data-act="tab"][data-tab="order"]'); await B.click('[data-act="reset"]'); await wait(900);
eq('reset: A back to setup', await A.isVisible('[data-act="start"]'), true);
eq('reset keeps names', await C.inputValue('[data-name="0"]'), names[0]);

const errs = [A, B, C].flatMap(p => p.errs).filter(e => !/ERR_INTERNET_DISCONNECTED|WebSocket/.test(e));
console.log(fails ? `${fails} FAILED: ${issues.join('; ')}` : 'ALL PASS', errs.length ? '\nERRORS:\n' + errs.join('\n') : '');
await b.close();
