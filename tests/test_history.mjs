// Past-games archive + landing layout. Plays a 2-player game over the room WebSocket, then checks
// /api/games and history page, undo/redo/reset behavior, and that create/join stay on screen with many rooms.
// Usage: node tests/test_history.mjs <base-url> <shots-dir> [--many-rooms | --live]
// The full run leaves an archived game behind, so run it against a local `wrangler dev`.
// --live stops after the undo check, so the test game's record is removed again (safe on the live site).
import { chromium } from 'playwright-core';
import { FIGS } from '../public/logic.js';
const [base, out, flag] = process.argv.slice(2);
const many = flag === '--many-rooms', live = flag === '--live';
const api = p => new URL(p, base).href;
let fails = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const games = async q => (await fetch(api('/api/games' + (q ? '?q=' + encodeURIComponent(q) : '')))).json();

const { code } = await (await fetch(api('/api/room'), { method: 'POST' })).json();
const ws = new WebSocket(api(`/api/room/${code}/ws`).replace(/^http/, 'ws'));
let S = null; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') S = m.state; };
await new Promise(r => ws.onopen = r);
const send = async (action, until = () => true) => { const v = S?.v ?? -1; ws.send(JSON.stringify({ action })); for (let i = 0; i < 100 && !(S && S.v > v && until()); i++) await wait(30); };
await wait(300);
const name = '测试' + code;
await send({ t: 'setN', n: 2 });
await send({ t: 'player', i: 0, name });
await send({ t: 'player', i: 1, name: '对手' });
await send({ t: 'start' });
eq('game id set at start', typeof S.gid, 'string');
for (let k = 0; k < 16; k++) {
  const [a, b] = S.order;
  await send({ t: 'settle', era: S.era, round: S.round, spent: { [a]: 5, [b]: 3 } });
  if (k < 15) await wait(2600);   // server settle cooldown
}
eq('game over', S.stage, 'over');
const [p1, p2] = S.players.slice(0, 2).map(p => p.id);
await send({ t: 'score', era: 1, id: p1, key: 'pre', value: '40' });
await send({ t: 'score', era: 2, id: p1, key: 'pre', value: '90' });
await send({ t: 'score', era: 2, id: p1, key: 'rail', value: [3, 4] });
await send({ t: 'score', era: 2, id: p2, key: 'pre', value: '70' });
await wait(400);
let g = (await games(code))[0];
eq('archived by room code', g?.code, code);
eq('winner first', [g?.players[0].name, g?.players[0].total, g?.players[0].place], [name, 97, 1]);
eq('runner-up', [g?.players[1].name, g?.players[1].total], ['对手', 70]);
eq('search by player name', (await games(name)).some(x => x.gid === g.gid), true);
eq('search by character name', (await games(FIGS[S.players[1].fig])).some(x => x.gid === g.gid), true);
eq('search miss', (await games('不存在的玩家xyz')).length, 0);

const b = await chromium.launch({ channel: 'chrome' });
const page = await (await b.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(base); await page.click('a[href="history"]'); await page.waitForSelector('.game');
await page.fill('#q', name); await page.click('#search button'); await wait(600);
eq('history page search shows 1 game', await page.$$eval('.game', x => x.length), 1);
eq('summary winner score', await page.textContent('.game .gp .win em'), '97');
await page.screenshot({ path: out + '/h_list.png' });
await page.click('.game summary'); await wait(200);
eq('details rows', await page.$$eval('.game .gd .row', x => x.length), 2);
await page.screenshot({ path: out + '/h_open.png' });

await send({ t: 'undo' }); await wait(400);
eq('undo final settle removes record', (await games(code)).length, 0);
if (live) { await wait(2600); await send({ t: 'reset' }); ws.close();   // back to setup so the room leaves the public list
  await b.close(); eq('no page errors', errs, []); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0); }
await wait(2600);
await send({ t: 'settle', era: S.era, round: S.round, spent: { [S.order[0]]: 1, [S.order[1]]: 2 } }); await wait(400);
eq('settling again restores record', (await games(code)).length, 1);
await send({ t: 'reset' }); await wait(400);
eq('reset keeps record', (await games(code)).length, 1);
ws.close();

if (many) {
  for (let i = 0; i < 12; i++) { const r = await (await fetch(api('/api/room'), { method: 'POST' })).json(); const w = new WebSocket(api(`/api/room/${r.code}/ws`).replace(/^http/, 'ws')); await new Promise(res => w.onopen = res); }
  await wait(500);
}
await page.goto(base); await page.waitForSelector('.lobby'); await wait(300);
const box = async sel => (await page.$(sel)).boundingBox();
const bottom = Math.max(...await Promise.all(['[data-act="create"]', '[data-act="join"]', 'a[href="history"]'].map(async s => { const r = await box(s); return r.y + r.height; })));
eq('create/join/history on first screen', bottom <= 667, true);
console.log('rooms listed:', await page.$$eval('.lobby', x => x.length), 'lowest button bottom:', Math.round(bottom));
await page.screenshot({ path: out + '/h_landing.png' });
eq('no page errors', errs, []);
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
