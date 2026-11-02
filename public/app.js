import { ROUNDS_PER_ERA, SETTLE_COOLDOWN_MS, COLOR_ORDER, COLOR_ZH, FIGS, num, eraParts, results } from './logic.js';

const COLORS = { yellow: 'var(--yellow)', blue: 'var(--blue)', orange: 'var(--orange)', purple: 'var(--purple)' };
const CATS = [
  { k: 'mid', n: '中途', c: 'var(--c-mid)' }, { k: 'rail', n: '铁路', c: 'var(--c-rail)' },
  { k: 'ind', n: '产业', c: 'var(--c-ind)' }, { k: 'jewel', n: '明珠', c: 'var(--c-jewel)' }
];
const FIELD = {
  pre: { n: '计分条', hint: '时代计分前计分条上的分数', neg: true },
  rail: { n: '铁路', hint: '每条火车链接：两端地点的连线点图标数', list: true },
  ind: { n: '产业', hint: '每块已翻面产业板块：左下角分数', list: true },
  alt: { n: '发电机', hint: '多相交流发电机：玩家板空产业格数' },
  loco: { n: '机车', hint: '机车工厂：已建重型火车数（每辆 4 分）' },
  inc: { n: '收入', hint: '收入等级', neg: true },
  cash: { n: '现金', hint: '现金' }
};
const ZH_NUM = ['', '一', '二'];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

let code = cleanCode(new URLSearchParams(location.search).get('r'));
let S = null, noRoom = false, online = false, ws = null, queue = [], retry = 0;
const ui = { tab: store.get('pgh-tab') || 'order', era: null, sheet: null, err: '', busy: false, rooms: null };
// This phone's spend entries for the current round; sent to the room only when settling.
let draft = {}, draftKey = '';
function syncDraft() {
  const key = `${S.stage}:${S.era}:${S.round}:${S.history.length}`;
  if (key !== draftKey) { draftKey = key; draft = { ...S.spent }; }
}

// Lobby list on the start page, refreshed while it is showing.
async function loadRooms() {
  if (code) return;
  try { const r = await fetch('/api/rooms'); if (r.ok) { ui.rooms = await r.json(); render(); } } catch {}
}
setInterval(() => { if (!code && !document.hidden) loadRooms(); }, 8000);
const pending = new Map(); // debounced text inputs: key -> {timer, flush}

function cleanCode(v) { const c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); return c.length === 4 ? c : null; }

/* ---------- connection ---------- */
function connect() {
  if (!code) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room/${code}/ws`);
  ws.onopen = () => { retry = 0; online = true; queue.splice(0).forEach(m => ws.send(m)); render(); };
  ws.onmessage = e => {
    if (e.data === 'pong') return;
    const m = JSON.parse(e.data);
    if (m.type === 'state') {
      // Someone just settled: lock the settle button briefly on every phone (local clock, no skew).
      if (S && m.state.history.length > S.history.length) {
        ui.justSettled = Date.now(); clearTimeout(ui.lockTimer);
        ui.lockTimer = setTimeout(render, SETTLE_COOLDOWN_MS + 50);
      }
      S = m.state; syncDraft(); store.set('pgh-last', code); render();
    }
    else if (m.type === 'error' && m.error === 'noroom') { noRoom = true; ws.close(); render(); }
  };
  ws.onclose = () => {
    online = false; render();
    if (!noRoom && code) setTimeout(connect, Math.min(5000, 400 * 2 ** retry++));
  };
}
setInterval(() => { if (ws && ws.readyState === 1) ws.send('ping'); }, 25000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && code && !noRoom && (!ws || ws.readyState > 1)) { retry = 0; connect(); }
});
function send(action) {
  const m = JSON.stringify({ action });
  if (ws && ws.readyState === 1) ws.send(m); else queue.push(m);
}
function debounced(key, fn, delay = 350) {
  const old = pending.get(key); if (old) clearTimeout(old.timer);
  const entry = { flush() { clearTimeout(entry.timer); pending.delete(key); fn(); } };
  entry.timer = setTimeout(entry.flush, delay);
  pending.set(key, entry);
}
const flushAll = () => [...pending.values()].forEach(p => p.flush());

/* ---------- helpers ---------- */
const P = id => S.players.find(p => p.id === id);
const pname = id => { const p = P(id); return p.name || FIGS[p.fig]; };
const psub = id => { const p = P(id); return p.name ? FIGS[p.fig] : COLOR_ZH[p.id]; };
const por = (id, cls = '') => { const p = P(id); return `<span class="por ${cls}" style="--c:${COLORS[p.id]}"><img src="img/${p.fig}.jpg" alt=""></span>`; };
const eraName = e => `第${ZH_NUM[e]}时代`;
function toast(t) { const el = $('#toast'); el.innerHTML = `<div class="toast">${esc(t)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => el.innerHTML = '', 1800); }

/* ---------- render (DOM morph keeps focus and typed text) ---------- */
function morph(a, b) {
  const ac = [...a.childNodes], bc = [...b.childNodes];
  bc.forEach((y, i) => {
    const x = ac[i];
    if (!x) { a.appendChild(y); return; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName || (x.nodeType === 1 && x.getAttribute('data-k') !== y.getAttribute('data-k'))) { a.replaceChild(y, x); return; }
    if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; return; }
    for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
    for (const at of [...y.attributes]) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    if (x.tagName === 'INPUT') {
      const v = y.getAttribute('value') ?? '';
      if (x !== document.activeElement && !pending.has(x.dataset.pk) && x.value !== v) x.value = v;
      return;
    }
    if ('disabled' in x) x.disabled = y.hasAttribute('disabled');
    morph(x, y);
  });
  while (a.childNodes.length > bc.length) a.removeChild(a.lastChild);
}
function render() {
  const t = document.createElement('div');
  t.innerHTML = view();
  morph($('#app'), t);
  $('#sheet').innerHTML = ui.sheet ? sheetView() : '';
}

function view() {
  if (!code) return landing();
  if (noRoom) return `${hero()}<div class="wrap"><h2 class="h">房间 ${code} 不存在</h2><p class="note">房间码可能输错了，或者房间已失效。</p><button class="btn" data-act="leave">返回首页</button></div>`;
  if (!S) return `${hero()}<div class="wrap"><h2 class="h">正在连接房间 ${code}…</h2></div>`;
  return bar() + `<div class="wrap" data-k="stage-${S.stage === 'setup' ? 'setup' : 'play'}">` + (S.stage === 'setup' ? setupView() : playView()) + footer() + '</div>';
}
const hero = () => `<div class="hero" data-k="hero"><div class="en">工业革命 · 匹兹堡</div><h1>顺位与计分助手</h1><div class="orn"></div></div><div class="band"></div>`;
const bar = () => `<div class="bar" data-k="bar"><span class="ttl">工业革命 · 匹兹堡</span>
  <button class="room" data-act="share"><small>房间</small>${code}<small>邀请</small></button><span class="conn ${online ? 'on' : ''}" title="${online ? '已连接' : '重新连接中'}"></span></div>`;
const footer = () => '';

function landing() {
  const rooms = ui.rooms;
  const stageText = r => r.stage === 'setup' ? '准备中' : r.stage === 'over' ? '已结束' : `${eraName(r.era)} 第 ${r.round} 轮`;
  const roomList = rooms === null ? '<div class="empty">加载中…</div>' : rooms.length ? rooms.map(r => `
      <button class="card lobby" data-act="rejoin" data-code="${r.code}" data-k="lb-${r.code}">
        <span class="lc">${r.code}</span>
        <span class="lp">${r.players.map(p => `<span class="por xs" style="--c:${COLORS[p.id]}"><img src="img/${p.fig}.jpg" alt=""></span>`).join('')}</span>
        <span class="ls"><b>${stageText(r)}</b>${r.online} 人在线</span>
      </button>`).join('') : '<div class="empty">暂无</div>';
  return `${hero()}<div class="wrap" data-k="landing">
    <h2 class="h">正在进行的房间</h2>
    <div class="list">${roomList}</div>
    <button class="btn" data-act="create" ${ui.busy ? 'disabled' : ''}>创建新房间</button>
    <div class="join"><input id="joinCode" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="房间码"><button class="btn navy" data-act="join">加入</button></div>
    <div class="err">${esc(ui.err)}</div>
    <a class="btn ghost" href="guide">新手教程</a>
    <footer>非官方玩家工具</footer></div>`;
}

function setupView() {
  const used = S.players.slice(0, S.n).map(p => p.id);
  return `
    <h2 class="h">玩家人数</h2>
    <div class="chips">${[2, 3, 4].map(k => `<button class="chip${k === S.n ? ' on' : ''}" data-act="n" data-n="${k}">${k} 人</button>`).join('')}</div>
    <h2 class="h">角色与玩家</h2>
    <div class="list">${S.players.slice(0, S.n).map((p, i) => `
      <div class="card row" data-k="seat-${i}">
        <div class="stepn">${i + 1}</div>
        <button class="por" style="--c:${COLORS[p.id]}" data-act="fig" data-i="${i}" aria-label="换角色"><img src="img/${p.fig}.jpg" alt=""></button>
        <div class="who">
          <input class="pn" data-pk="name-${i}" data-name="${i}" value="${esc(p.name)}" placeholder="玩家名" maxlength="12" enterkeyhint="done">
          <div class="dots"><span class="fg" style="margin-right:4px;align-self:center">${FIGS[p.fig]}</span>${COLOR_ORDER.map(c => `<button class="dot${c === p.id ? ' on' : ''}" style="--c:${COLORS[c]}" data-act="color" data-i="${i}" data-c="${c}" ${c !== p.id && used.includes(c) ? 'disabled' : ''} aria-label="${COLOR_ZH[c]}"></button>`).join('')}</div>
        </div>
        <button class="ib" data-act="move" data-i="${i}" data-j="${i - 1}" ${i === 0 ? 'disabled' : ''} aria-label="上移">↑</button>
        <button class="ib" data-act="move" data-i="${i}" data-j="${i + 1}" ${i === S.n - 1 ? 'disabled' : ''} aria-label="下移">↓</button>
      </div>`).join('')}</div>
    <button class="btn ghost" data-act="shuffle">随机排序</button>
    <button class="btn" data-act="start">开始游戏</button>`;
}

function playView() {
  const tabs = [['order', '顺位'], ['score', '计分'], ['mvp', '结算']];
  if (!tabs.some(t => t[0] === ui.tab)) ui.tab = 'order';
  return `<div class="tabs">${tabs.map(([k, n]) => `<button class="tab${ui.tab === k ? ' on' : ''}" data-act="tab" data-tab="${k}">${n}</button>`).join('')}</div>
    ${status()}${banner()}
    <div data-k="tab-${ui.tab}">${ui.tab === 'order' ? orderTab() : ui.tab === 'score' ? scoreTab() : mvpTab()}</div>`;
}

function status() {
  if (S.stage === 'over') return `<div class="status"><span class="medal">终</span><div><div class="t">游戏结束</div></div></div>`;
  const hint = S.era === 1 && S.round === 1 ? '本轮每人只执行 <b>1</b> 个行动'
    : S.era === 2 && S.round === ROUNDS_PER_ERA ? '全局最后一轮：本轮结束<b>不结算收入</b>'
    : S.round === ROUNDS_PER_ERA ? '本时代最后一轮，结束后进行时代计分'
    : '每人执行 2 个行动';
  const pips = Array.from({ length: ROUNDS_PER_ERA }, (_, i) => `<i class="${i + 1 < S.round ? 'done' : i + 1 === S.round ? 'cur' : ''}"></i>`).join('');
  return `<div class="status"><span class="medal" style="font-size:21px">${ZH_NUM[S.era]}</span>
    <div><div class="t">${eraName(S.era)} · 第<b>${S.round}</b>/ ${ROUNDS_PER_ERA} 轮</div><div class="s">${hint}</div></div>
    <div class="pips">${pips}</div></div>`;
}

function banner() {
  if (S.stage === 'over' && ui.tab !== 'mvp')
    return `<div class="banner"><div style="flex:1"><b>游戏结束</b>，请完成第二时代计分</div><button data-act="goto" data-tab="${ui.tab === 'score' ? 'mvp' : 'score'}" data-era="2">${ui.tab === 'score' ? '看结算' : '去计分'}</button></div>`;
  if (S.stage === 'play' && S.era === 2 && S.round === 1 && S.last && S.last.era === 1 && ui.tab === 'order')
    return `<div class="banner"><div style="flex:1"><b>第一时代已结束</b>，先做时代维护和计分</div><button data-act="goto" data-tab="score" data-era="1">去计分</button></div>`;
  return '';
}

function orderTab() {
  const L = S.last;
  const lastOf = id => L && L.rows.find(r => r.id === id);
  const title = S.stage === 'over' ? '最后一轮花费' : L ? '本轮顺位 · 上轮花费' : '本轮顺位';
  const track = `<div class="track"><div class="t">${title}</div><div class="slots">${(S.stage === 'over' ? L.rows.map(r => r.id) : S.order).map((id, i) => {
    const r = lastOf(id);
    return `<div class="slot" data-k="slot-${id}"><div class="o">${i + 1}</div>${por(id)}<div class="n">${esc(pname(id))}</div>${r ? `<span class="m">$${r.spent}</span>${r.tie ? '<span class="tie">同额</span>' : ''}` : ''}</div>`;
  }).join('')}</div></div>`;
  if (S.stage === 'over') return track + `<div class="btns"><button class="btn ghost" data-act="undo" ${S.prev ? '' : 'disabled'}>撤销最后一次结算</button><button class="btn ghost" data-act="reset">重新开局</button></div>`;
  const rows = S.order.map((id, i) => `
    <div class="card row" data-k="sp-${id}">
      <div class="stepn">${i + 1}</div>${por(id, 'sm')}
      <div class="who"><div class="nm">${esc(pname(id))}</div><div class="fg">${esc(psub(id))}</div></div>
      <button class="ib" data-act="minus" data-id="${id}" aria-label="减一">−</button>
      <label class="field"><i>$</i><input type="text" inputmode="numeric" pattern="[0-9]*" data-pk="sp-${id}" data-spent="${id}" value="${esc(draft[id] ?? '')}" placeholder="0" class="${num(draft[id]) === null ? 'bad' : ''}"></label>
      <button class="ib" data-act="plus" data-id="${id}" aria-label="加一">+</button>
    </div>`).join('');
  return `${track}
    <div class="list" style="margin-top:8px">${rows}</div>
    <div class="err">${esc(ui.err)}</div>
    ${Date.now() - (ui.justSettled || 0) < SETTLE_COOLDOWN_MS
      ? `<button class="btn" disabled>刚刚已结算 ${eraName(L.era)}第 ${L.round} 轮</button>`
      : `<button class="btn" data-act="settle">结算${eraName(S.era)}第 ${S.round} 轮</button>`}
    <div class="btns"><button class="btn ghost" data-act="undo" ${S.prev ? '' : 'disabled'}>撤销上次结算</button><button class="btn ghost" data-act="reset">重新开局</button></div>`;
}

function scoreTab() {
  const era = ui.era || (S.era === 2 || S.stage === 'over' ? 2 : 1);
  const keys = era === 1 ? ['pre', 'rail', 'ind', 'alt'] : ['pre', 'rail', 'ind', 'alt', 'loco'];
  const cell = (id, key) => {
    const d = (S.score[era][id] || {})[key];
    if (FIELD[key].list) { const t = (d || []).reduce((a, b) => a + b, 0); return `<button class="cell ${d && d.length ? '' : 'empty'}" data-act="cell" data-era="${era}" data-id="${id}" data-key="${key}">${d && d.length ? t : '加'}</button>`; }
    const filled = d !== undefined && d !== '';
    const bad = filled && num(d, FIELD[key].neg ? -999 : 0) === null;
    return `<button class="cell ${filled ? '' : 'empty'} ${bad ? 'bad' : ''}" data-act="cell" data-era="${era}" data-id="${id}" data-key="${key}">${filled ? esc(d) : key === 'pre' ? '填' : '0'}</button>`;
  };
  const rows = S.order.map(id => {
    const t = eraParts(S, era, id);
    return `<tr data-k="sr-${id}"><td><div class="pc">${por(id, 'xs')}<span>${esc(pname(id))}</span></div></td>${keys.map(k => `<td>${cell(id, k)}</td>`).join('')}<td class="tt">${t ? t.total : '—'}</td></tr>`;
  }).join('');
  return `<div class="seg">${[1, 2].map(e => `<button class="${e === era ? 'on' : ''}" data-act="era" data-era="${e}">${eraName(e)}计分</button>`).join('')}</div>
    <table class="sc"><thead><tr><th>玩家</th>${keys.map(k => `<th>${FIELD[k].n}${k === 'loco' ? '<br>×4' : ''}</th>`).join('')}<th class="tot">合计</th></tr></thead><tbody>${rows}</tbody></table>
    `;
}

function mvpTab() {
  const R = results(S);
  if (R.error) return `<p class="note">计分里有无效数字，请先到「计分」修正。</p>`;
  const top = R.rows.filter(r => r.place === 1);
  const champ = top[0];
  const maxSum = Math.max(1, ...R.rows.map(r => CATS.reduce((a, c) => a + Math.max(0, r[c.k]), 0)));
  const warn = [];
  if (R.rows.some(r => r.pre2Missing)) warn.push('还有玩家没填第二时代计分条分数');
  const tied = R.rows.filter(r => r.tiedPts);
  return `${warn.map(w => `<p class="note">${w}</p>`).join('')}
    <div class="mvp" style="margin-top:8px">
      <div class="crown">${top.length > 1 ? '并 列 第 一' : 'M V P · 工 业 大 亨'}</div>
      ${por(champ.id)}
      <div class="nm">${top.map(r => esc(pname(r.id))).join(' · ')}</div>
      <div class="fg">${top.map(r => esc(FIGS[P(r.id).fig])).join(' · ')}</div>
      <div class="pts">${champ.total}<small>分</small></div>
    </div>
    ${tied.length ? `<div class="card" style="margin-top:8px;padding:8px 10px"><div class="fg" style="font-size:12px;color:var(--ink2)">同分：先比收入等级，再比现金</div>
      ${tied.map(r => `<div class="tb" data-k="tb-${r.id}">${por(r.id, 'xs')}<span style="flex:1">${esc(pname(r.id))}</span>收入<label class="field"><input type="text" inputmode="numeric" data-pk="sc-2-${r.id}-inc" data-sc="2:${r.id}:inc" value="${esc((S.score[2][r.id] || {}).inc ?? '')}" placeholder="0"></label>现金<label class="field"><i>$</i><input type="text" inputmode="numeric" data-pk="sc-2-${r.id}-cash" data-sc="2:${r.id}:cash" value="${esc((S.score[2][r.id] || {}).cash ?? '')}" placeholder="0"></label></div>`).join('')}</div>` : ''}
    <h2 class="h">排名与得分构成</h2>
    <div class="list rk">${R.rows.map(r => `
      <div class="card row" data-k="rk-${r.id}"><div class="stepn">${r.place}</div>${por(r.id, 'sm')}
        <div class="who"><div class="nm">${esc(pname(r.id))} <span class="fg" style="display:inline">${esc(FIGS[P(r.id).fig])}</span></div>
          <div class="stack">${CATS.map(c => `<i style="width:${Math.max(0, r[c.k]) / maxSum * 100}%;background:${c.c}"></i>`).join('')}</div>
          <div class="parts">${CATS.map(c => `<em style="background:${c.c}"></em>${c.n} ${r[c.k]}`).join(' ')}</div></div>
        <div class="tot">${r.total}</div></div>`).join('')}</div>
    <h2 class="h">成就</h2>
    <div class="achs">${R.ach.map(a => `
      <div class="card ach" data-k="ach-${a.k}"><span class="medal">${a.ch}</span><div style="min-width:0"><div class="an">${a.name}</div><div class="ad">${a.desc}</div>
        <div class="aw">${a.who.map(id => por(id, 'xs')).join('')}${a.who.length === 1 ? `<span class="fg" style="align-self:center;margin-left:3px">${esc(pname(a.who[0]))}</span>` : ''}</div></div></div>`).join('')}</div>`;
}

/* ---------- sheets ---------- */
function sheetView() {
  const s = ui.sheet;
  if (s.kind === 'fig') {
    const me = S.players[s.i];
    const taken = S.players.slice(0, S.n).filter(p => p !== me).map(p => p.fig);
    return `<div class="mask" data-act="close"></div><div class="sheet"><h3>选择角色</h3>
      <div class="figs">${Object.entries(FIGS).map(([k, n]) => `<button data-act="pick" data-fig="${k}" class="${k === me.fig ? 'on' : ''}" ${taken.includes(k) ? 'disabled' : ''}><span class="por" style="--c:${COLORS[me.id]}"><img src="img/${k}.jpg" alt=""></span>${n}</button>`).join('')}</div>
      <button class="btn ghost" data-act="close">关闭</button></div>`;
  }
  const f = FIELD[s.key];
  return `<div class="mask" data-act="close"></div><div class="sheet">
    <h3>${esc(pname(s.id))} · ${f.n}（${eraName(s.era)}）</h3><div class="hint">${f.hint}</div>
    <div class="disp"><div class="ex">${esc(exprText(s)) || '&nbsp;'}</div><div class="cur">= ${exprTotal(s)}</div></div>
    <div class="keys">
      <button data-act="k" data-k="7">7</button><button data-act="k" data-k="8">8</button><button data-act="k" data-k="9">9</button><button class="op" data-act="k" data-k="+">+</button>
      <button data-act="k" data-k="4">4</button><button data-act="k" data-k="5">5</button><button data-act="k" data-k="6">6</button><button class="op" data-act="k" data-k="-">−</button>
      <button data-act="k" data-k="1">1</button><button data-act="k" data-k="2">2</button><button data-act="k" data-k="3">3</button>
      <button class="ok" data-act="k" data-k="ok">完成</button>
      <button class="fn" data-act="k" data-k="clr">清空</button><button data-act="k" data-k="0">0</button><button class="fn" data-act="k" data-k="bs">⌫</button>
    </div></div>`;
}

// Calculator: committed signed terms, then the operator being typed (op) and its digits (cur).
const exprTotal = s => s.terms.reduce((a, b) => a + b, 0) + (s.cur ? (s.op === '-' ? -1 : 1) * Number(s.cur) : 0);
function exprText(s) {
  let out = s.terms.map((t, i) => (i === 0 ? (t < 0 ? '−' : '') : t < 0 ? ' − ' : ' + ') + Math.abs(t)).join('');
  if (s.cur || s.opShown) out += (s.terms.length ? (s.op === '-' ? ' − ' : ' + ') : s.op === '-' ? '−' : '') + s.cur;
  return out;
}

function keypad(k) {
  const s = ui.sheet, f = FIELD[s.key];
  const commit = () => { if (s.cur !== '') { s.terms.push((s.op === '-' ? -1 : 1) * Number(s.cur)); s.cur = ''; } };
  if (/^\d$/.test(k)) { if (s.cur.length < 3) s.cur = (s.cur === '0' ? '' : s.cur) + k; }
  else if (k === '+' || k === '-') { commit(); s.op = k; s.opShown = true; }
  else if (k === 'bs') {
    if (s.cur) s.cur = s.cur.slice(0, -1);
    else if (s.opShown) s.opShown = false;
    else if (s.terms.length) { const t = s.terms.pop(); s.cur = String(Math.abs(t)); s.op = t < 0 ? '-' : '+'; s.opShown = t < 0 || s.terms.length > 0; }
  }
  else if (k === 'clr') { s.terms = []; s.cur = ''; s.op = '+'; s.opShown = false; }
  else if (k === 'ok') {
    const empty = !s.terms.length && s.cur === '';
    commit();
    const value = f.list ? s.terms : empty ? '' : String(s.terms.reduce((a, b) => a + b, 0));
    send({ t: 'score', era: s.era, id: s.id, key: s.key, value });
    ui.sheet = null;
  }
  render();
}

/* ---------- events ---------- */
async function createRoom() {
  ui.busy = true; ui.err = ''; render();
  try {
    const r = await fetch('/api/room', { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '创建失败');
    enterRoom(j.code);
  } catch (e) { ui.err = '创建房间失败：' + e.message; }
  ui.busy = false; render();
}
function enterRoom(c) {
  code = c; noRoom = false; S = null; ui.err = '';
  history.replaceState(null, '', '/?r=' + c);
  connect(); render();
}
function leave() {
  code = null; S = null; noRoom = false; if (ws) { ws.onclose = null; ws.close(); }
  history.replaceState(null, '', '/'); ui.rooms = null; render(); loadRooms();
}
async function share() {
  const url = `${location.origin}/?r=${code}`;
  if (navigator.share) { try { await navigator.share({ title: '工业革命：匹兹堡 · 房间 ' + code, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('房间链接已复制'); } catch { toast('房间码 ' + code); }
}
function settle() {
  for (const id of S.order) {
    if (num(draft[id]) === null) { ui.err = `${pname(id)} 的花费不是有效金额（需为 0 或正整数）`; render(); return; }
  }
  ui.err = '';
  send({ t: 'settle', era: S.era, round: S.round, spent: Object.fromEntries(S.order.map(id => [id, draft[id] ?? ''])) });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const d = t.dataset;
  switch (d.act) {
    case 'create': createRoom(); break;
    case 'join': { const c = cleanCode($('#joinCode').value); if (c) enterRoom(c); else { ui.err = '请输入 4 位房间码'; render(); } break; }
    case 'rejoin': enterRoom(d.code); break;
    case 'leave': leave(); break;
    case 'share': share(); break;
    case 'n': send({ t: 'setN', n: +d.n }); break;
    case 'fig': ui.sheet = { kind: 'fig', i: +d.i }; render(); break;
    case 'pick': send({ t: 'player', i: ui.sheet.i, fig: d.fig }); ui.sheet = null; render(); break;
    case 'color': send({ t: 'player', i: +d.i, color: d.c }); break;
    case 'move': flushAll(); send({ t: 'move', i: +d.i, j: +d.j }); break;
    case 'shuffle': flushAll(); send({ t: 'shuffle' }); break;
    case 'start': flushAll(); send({ t: 'start' }); break;
    case 'tab': ui.tab = d.tab; store.set('pgh-tab', d.tab); render(); window.scrollTo(0, 0); break;
    case 'goto': ui.tab = d.tab; if (d.era) ui.era = +d.era; render(); window.scrollTo(0, 0); break;
    case 'era': ui.era = +d.era; render(); break;
    case 'plus': case 'minus': {
      draft[d.id] = String(Math.max(0, (num(draft[d.id]) ?? 0) + (d.act === 'plus' ? 1 : -1)));
      const input = document.querySelector(`[data-spent="${d.id}"]`);
      input.value = draft[d.id]; input.classList.remove('bad'); ui.err = ''; break;
    }
    case 'settle': settle(); break;
    case 'undo': send({ t: 'undo' }); break;
    case 'reset': if (confirm('重新开局？本房间的顺位和计分都会清空，所有人同步。')) send({ t: 'reset' }); break;
    case 'cell': {
      const era = +d.era, f = FIELD[d.key], v = (S.score[era][d.id] || {})[d.key];
      const n0 = f.list ? null : num(v, -999);
      ui.sheet = f.list
        ? { kind: 'key', era, id: d.id, key: d.key, terms: [...(v || [])], cur: '', op: '+', opShown: (v || []).length > 0 }
        : { kind: 'key', era, id: d.id, key: d.key, terms: [], cur: n0 ? String(Math.abs(n0)) : '', op: n0 < 0 ? '-' : '+', opShown: n0 < 0 };
      render(); break;
    }
    case 'k': keypad(d.k); break;
    case 'close': ui.sheet = null; render(); break;
  }
});

document.addEventListener('input', e => {
  const el = e.target, d = el.dataset;
  if (d.name !== undefined) debounced(d.pk, () => send({ t: 'player', i: +d.name, name: el.value }));
  else if (d.spent) { draft[d.spent] = el.value; el.classList.toggle('bad', num(el.value) === null); ui.err = ''; } else if (d.sc) {
    const [era, id, key] = d.sc.split(':');
    debounced(d.pk, () => send({ t: 'score', era: +era, id, key, value: el.value }), 400);
  }
});
document.addEventListener('focusout', e => { const k = e.target.dataset?.pk; if (k) pending.get(k)?.flush(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'joinCode') document.querySelector('[data-act="join"]').click();
  if (e.key === 'Enter' && e.target.dataset?.pk) e.target.blur();
});

render();
connect();
loadRooms();
