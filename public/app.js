import { ROUNDS_PER_ERA, SETTLE_COOLDOWN_MS, COLOR_ORDER, COLOR_ZH, COLOR_FIGS, FIGS, num, eraParts, results } from './logic.js';

const COLORS = { yellow: 'var(--yellow)', blue: 'var(--blue)', orange: 'var(--orange)', purple: 'var(--purple)' };
const CATS = [
  { k: 'mid', n: '行动分', c: 'var(--c-mid)' }, { k: 'rail', n: '铁路', c: 'var(--c-rail)' },
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
const ui = { tab: store.get('pgh-tab') || 'order', era: null, sheet: null, err: '', busy: false, rooms: null, tb: false, rn: false, saving: false, rv: null };   // tb: tie-break inputs shown; rn: rename inputs shown on the results tab; rv: rating form (reviewCard)
// This phone's spend entries for the current round; sent to the room only when settling.
let draft = {}, draftKey = '';
function syncDraft() {
  const key = `${S.stage}:${S.era}:${S.round}:${S.history.length}`;
  if (key !== draftKey) { draftKey = key; draft = { ...S.spent }; }
}

// Rooms this phone has been in, newest first. Kept on the phone so they don't depend on the public list.
function mine() {
  try { const v = JSON.parse(store.get('pgh-mine')); if (Array.isArray(v)) return v; } catch {}
  const last = store.get('pgh-last');   // older versions only remembered the last room
  return last ? [last] : [];
}
const remember = c => store.set('pgh-mine', JSON.stringify([c, ...mine().filter(x => x !== c)].slice(0, 8)));
const forget = c => store.set('pgh-mine', JSON.stringify(mine().filter(x => x !== c)));
function ago(t) {
  const m = Math.floor((Date.now() - t) / 60000);
  return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.floor(m / 60)} 小时前` : `${Math.floor(m / 1440)} 天前`;
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
      S = m.state; syncDraft(); remember(code); render();
    }
    else if (m.type === 'error' && m.error === 'noroom') { noRoom = true; forget(code); ws.close(); render(); }
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
const homeNav = () => `<button class="back-nav" data-act="leave" data-html2canvas-ignore>‹ 首页</button>`;
const hero = () => `<div class="hero nav-hero" data-k="hero">${homeNav()}<div class="en">工业革命 · 匹兹堡</div><h1>匹兹堡开局小助手</h1><div class="orn"></div></div><div class="band"></div>`;
const bar = () => `<div class="bar" data-k="bar">${homeNav()}<span class="ttl">工业革命 · 匹兹堡</span>
  <button class="room" data-act="share"><small>房间</small>${code}<small>邀请</small></button><span class="conn ${online ? 'on' : ''}" title="${online ? '已连接' : '重新连接中'}"></span></div>`;
const footer = () => '';

function landing() {
  const rooms = ui.rooms;
  const stageText = r => r.stage === 'setup' ? '准备中' : r.stage === 'over' ? '已结束' : `${eraName(r.era)} 第 ${r.round} 轮`;
  const my = mine();
  const tag = c => my.includes(c) ? '<em>我的</em>' : '';
  // my rooms first (stable sort keeps the server's order otherwise), then my rooms the public list no longer shows
  const listed = rooms && rooms.slice().sort((a, b) => my.includes(b.code) - my.includes(a.code));
  const unlisted = rooms ? my.filter(c => !rooms.some(r => r.code === c)) : [];
  const roomList = rooms === null ? '<div class="empty">加载中…</div>' : listed.length + unlisted.length ? listed.map(r => `
      <button class="card lobby" data-act="rejoin" data-code="${r.code}" data-k="lb-${r.code}">
        <span class="lc">${r.code}${tag(r.code)}</span>
        <span class="lp">${r.players.map(p => `<span class="por xs" style="--c:${COLORS[p.id]}"><img src="img/${p.fig}.jpg" alt=""></span>`).join('')}</span>
        <span class="ls"><b class="st st-${r.stage}">${stageText(r)}</b><small>${r.online ? `<i class="od on"></i>${r.online} 人在线` : ago(r.updated)}</small></span>
      </button>`).join('') + unlisted.map(c => `
      <button class="card lobby" data-act="rejoin" data-code="${c}" data-k="lb-${c}">
        <span class="lc">${c}${tag(c)}</span><span class="lp"></span><span class="ls"><small>点击进入</small></span>
      </button>`).join('') : '<div class="empty">暂无进行中的房间</div>';
  return `<div class="hero-art" data-k="hero"><a class="back-nav" href="https://boardgame.leisurecat.cloud" data-html2canvas-ignore>‹ 全部游戏</a><a class="back-nav rate-nav" href="https://boardgame.leisurecat.cloud/?rate=pgh&back=${encodeURIComponent(location.href)}" data-html2canvas-ignore>★ 写评价</a><img src="img/hero.jpg" alt=""><div class="ht">
      <div class="wm">BRASS</div><div class="hr"></div><div class="hz">匹兹堡开局小助手</div><div class="hs">快速开局 · 计分不烧心</div></div></div>
    <div class="wrap" data-k="landing">
    <div class="card start">
      <button class="btn" data-act="create" ${ui.busy ? 'disabled' : ''}>创建新房间</button>
      <div class="or">或输入房间码加入</div>
      <div class="join"><input id="joinCode" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="房间码"><button class="btn navy" data-act="join">加入</button></div>
      ${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ''}
    </div>
    <a class="card teachgo" href="teach"><span class="tg-i">讲</span><span><b>第一次玩？3 分钟讲规则</b>照着念就能开局，不懂的词点一下</span><i>›</i></a>
    <div class="tiles">
      <a class="card tile" href="guide"><span class="ti play"><img src="img/rules-poster.jpg" alt=""></span><span><b>新手教程</b>视频 + 图文</span></a>
      <a class="card tile" href="history"><span class="ti rec">录</span><span><b>往期对局</b>战绩查询</span></a>
    </div>
    <h2 class="h">房间<small>${rooms && rooms.length ? `${rooms.length} 个` : ''}</small></h2>
    <div class="list">${roomList}</div>
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
    <button class="btn ghost" data-act="order">手指轮盘 / 抽签定顺位 ›</button>
    <p class="note">定好后回到这里，用 ↑↓ 把顺位排好。</p>
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
    return `<div class="banner"><div style="flex:1"><b>游戏结束</b>，请完成${era1Filled() ? '第二时代' : '两个时代的'}计分</div><button data-act="goto" data-tab="${ui.tab === 'score' ? 'mvp' : 'score'}" data-era="${era1Filled() ? 2 : 1}">${ui.tab === 'score' ? '看结算' : '去计分'}</button></div>`;
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

// The score tab opens on era 1 until any of its scores are filled in (many tables score both eras at the end).
const era1Filled = () => Object.values(S.score[1] || {}).some(d => Object.values(d || {}).some(v => Array.isArray(v) ? v.length : v !== undefined && v !== ''));

function scoreTab() {
  const era = ui.era ||= era1Filled() && (S.era === 2 || S.stage === 'over') ? 2 : 1;   // picked once per visit, so entering a score doesn't switch era
  const keys = era === 1 ? ['pre', 'rail', 'ind', 'alt'] : ['pre', 'rail', 'ind', 'alt', 'loco'];
  const cell = (id, key) => {
    const d = (S.score[era][id] || {})[key];
    if (FIELD[key].list) { const t = (d || []).reduce((a, b) => a + b, 0); return `<button class="cell ${d && d.length ? '' : 'empty'}" data-act="cell" data-era="${era}" data-id="${id}" data-key="${key}">${d && d.length ? t : '加'}</button>`; }
    const filled = d !== undefined && d !== '';
    const bad = filled && num(d, FIELD[key].neg ? -999 : 0) === null;
    return `<button class="cell ${filled ? '' : 'empty'} ${bad ? 'bad' : ''}" data-act="cell" data-era="${era}" data-id="${id}" data-key="${key}">${filled ? esc(d) : key === 'pre' ? '填' : '0'}</button>`;
  };
  // one column per player, one row per score field
  const tots = S.order.map(id => eraParts(S, era, id));
  return `<div class="seg">${[1, 2].map(e => `<button class="${e === era ? 'on' : ''}" data-act="era" data-era="${e}">${eraName(e)}计分</button>`).join('')}</div>
    <table class="sc"><thead><tr><th></th>${S.order.map(id => `<th><div class="pv">${por(id, 'xs')}<span>${esc(pname(id))}</span></div></th>`).join('')}</tr></thead>
    <tbody>${keys.map(k => `<tr data-k="sr-${k}"><th>${FIELD[k].n}${k === 'loco' ? '<small>×4</small>' : ''}</th>${S.order.map(id => `<td>${cell(id, k)}</td>`).join('')}</tr>`).join('')}
    <tr data-k="sr-total"><th>合计</th>${S.order.map((id, i) => `<td class="tt" data-tt="${id}">${tots[i] ? tots[i].total : '—'}</td>`).join('')}</tr></tbody></table>
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
  return `<div id="shot">${warn.map(w => `<p class="note" data-html2canvas-ignore>${w}</p>`).join('')}
    <div class="mvp" style="margin-top:8px">
      <div class="crown">${top.length > 1 ? '并 列 第 一' : 'M V P · 工 业 大 亨'}</div>
      ${por(champ.id)}
      <div class="nm">${top.map(r => esc(pname(r.id))).join(' · ')}</div>
      <div class="fg">${top.map(r => esc(FIGS[P(r.id).fig])).join(' · ')}</div>
      <div class="pts">${champ.total}<small>分</small></div>
    </div>
    <div class="btns sv" data-html2canvas-ignore><button class="btn ghost" data-act="rn">${ui.rn ? '收起改名' : '修改玩家名'}</button><button class="btn navy" data-act="save" ${ui.saving ? 'disabled' : ''}>${ui.saving ? '正在生成…' : '保存结算长图'}</button></div>
    ${ui.rn ? `<div class="card" data-k="rn" data-html2canvas-ignore style="margin-top:8px;padding:2px 10px 8px">${S.order.map(id => { const i = S.players.findIndex(p => p.id === id); return `<div class="tb">${por(id, 'xs')}<input class="pn" data-pk="name-${i}" data-name="${i}" value="${esc(P(id).name)}" placeholder="玩家名" maxlength="12" enterkeyhint="done"></div>`; }).join('')}</div>` : ''}
    ${tied.length ? `<div class="card" data-html2canvas-ignore style="margin-top:8px;padding:8px 10px"><button class="tbh" data-act="tb">同分：先比收入等级，再比现金<span>${ui.tb ? '收起' : '填写'}</span></button>
      ${!ui.tb ? '' : tied.map(r => `<div class="tb" data-k="tb-${r.id}">${por(r.id, 'xs')}<span style="flex:1">${esc(pname(r.id))}</span>收入<label class="field"><input type="text" inputmode="numeric" data-pk="sc-2-${r.id}-inc" data-sc="2:${r.id}:inc" value="${esc((S.score[2][r.id] || {}).inc ?? '')}" placeholder="0"></label>现金<label class="field"><i>$</i><input type="text" inputmode="numeric" data-pk="sc-2-${r.id}-cash" data-sc="2:${r.id}:cash" value="${esc((S.score[2][r.id] || {}).cash ?? '')}" placeholder="0"></label></div>`).join('')}</div>` : ''}
    <h2 class="h">排名与得分构成</h2>
    <div class="list rk">${R.rows.map(r => `
      <div class="card row" data-k="rk-${r.id}"><div class="stepn">${r.place}</div>${por(r.id, 'sm')}
        <div class="who"><div class="nm">${esc(pname(r.id))} <span class="fg" style="display:inline">${esc(FIGS[P(r.id).fig])}</span></div>
          <div class="stack">${CATS.map(c => `<i style="width:${Math.max(0, r[c.k]) / maxSum * 100}%;background:${c.c}"></i>`).join('')}</div>
          <div class="parts">${CATS.map(c => `<em style="background:${c.c}"></em>${c.n} ${r[c.k]}`).join(' ')}</div></div>
        <div class="tot">${r.total}</div></div>`).join('')}</div>
    <h2 class="h">成就<small data-html2canvas-ignore>点开看数值</small></h2>
    <div class="achs">${R.ach.map(a => `
      <div class="card ach" data-k="ach-${a.k}" data-act="ach" data-a="${a.k}" role="button"><span class="medal">${a.ch}</span><div style="min-width:0"><div class="an">${a.name}</div><div class="ad">${a.desc}</div>
        <div class="aw">${a.who.map(id => por(id, 'xs')).join('')}${a.who.length === 1 ? `<span class="fg" style="align-self:center;margin-left:3px">${esc(pname(a.who[0]))}</span>` : ''}</div></div></div>`).join('')}</div></div>
    ${reviewCard()}`;
}

/* ---------- rating this game (stars + comment), shown on the hub boardgame.leisurecat.cloud ---------- */
const REVIEW_API = 'https://boardgame.leisurecat.cloud/api/reviews';
const STAR_TXT = ['点星星打分', '不推荐', '一般', '还行', '好玩', '超好玩'];
const savedReview = () => { try { return JSON.parse(store.get('pgh-rv-' + code)) || {}; } catch { return {}; } };
function reviewCard() {
  if (ui.rv?.room !== code) ui.rv = { who: null, stars: 0, text: '', state: '', err: '', ...savedReview(), room: code };
  const rv = ui.rv;
  if (rv.state === 'sent') return `<div class="card rv" data-k="rv"><div class="rv-done">${'★'.repeat(rv.stars)}${'☆'.repeat(5 - rv.stars)}</div>
    <p>谢谢 ${esc(pname(rv.who) || '')} 的评价！</p><div class="btns"><button class="btn ghost" data-act="rv-edit">修改评价</button><a class="btn navy" href="https://boardgame.leisurecat.cloud">看大家的评价</a></div></div>`;
  return `<h2 class="h">给这款游戏打个分</h2><div class="card rv" data-k="rv">
    <div class="rv-l">我是</div><div class="rv-who">${S.order.map(id => `<button class="${rv.who === id ? 'on' : ''}" data-act="rv-who" data-id="${id}">${por(id, 'xs')}<span>${esc(pname(id))}</span></button>`).join('')}</div>
    <div class="rv-st">${[1, 2, 3, 4, 5].map(n => `<button class="${n <= rv.stars ? 'on' : ''}" data-act="rv-star" data-n="${n}" aria-label="${n} 星">★</button>`).join('')}<span>${STAR_TXT[rv.stars]}</span></div>
    <textarea data-rv placeholder="说说这局的感受（可不填）" maxlength="300">${esc(rv.text)}</textarea>
    <button class="btn" data-act="rv-send" ${!rv.who || !rv.stars || rv.state === 'sending' ? 'disabled' : ''}>${rv.state === 'sending' ? '提交中…' : '提交评价'}</button>
    ${rv.err ? `<p class="err">${esc(rv.err)}</p>` : ''}
    <p class="note">评价和玩家名会显示在「桌游小助手」首页，并计入这款游戏的整体评分。同一局再次提交会覆盖之前的评价。</p></div>`;
}
async function sendReview() {
  const rv = ui.rv;
  rv.state = 'sending'; rv.err = ''; render();
  try {
    const r = await fetch(REVIEW_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game: 'pgh', stars: rv.stars, name: pname(rv.who), text: rv.text, room: code }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `提交失败（${r.status}）`);
    rv.state = 'sent';
    store.set('pgh-rv-' + code, JSON.stringify({ who: rv.who, stars: rv.stars, text: rv.text, state: 'sent' }));
  } catch (e) {
    rv.state = ''; rv.err = e.message === 'Failed to fetch' ? '网络连接失败，请稍后再试' : e.message;
  }
  render();
}

/* ---------- results as one long image ---------- */
const loadScript = src => new Promise((ok, fail) => {
  if (window.html2canvas) return ok();
  const el = document.createElement('script');
  el.src = src; el.onload = ok; el.onerror = () => fail(new Error('截图组件加载失败'));
  document.head.appendChild(el);
});
// Renders the results tab (without buttons, inputs and notes) under a header naming the room and date.
async function saveImage() {
  ui.saving = true; render();
  try {
    await loadScript('vendor/html2canvas.min.js');
    const canvas = await window.html2canvas($('#shot'), {
      scale: Math.max(2, window.devicePixelRatio || 1), backgroundColor: '#efe4cb',
      onclone: doc => {
        const c = doc.getElementById('shot');
        c.style.cssText = 'margin:0 -14px;padding:18px 14px 14px';   // grow outward so the content keeps its on-screen width
        c.insertAdjacentHTML('afterbegin', `<div style="text-align:center;padding-bottom:6px"><div style="font:900 22px var(--serif);color:var(--red);letter-spacing:4px">工业革命 · 匹兹堡</div>
          <div style="font:500 12px var(--sans);color:var(--ink2);margin-top:4px">终局结算 · 房间 ${code} · ${new Date().toLocaleDateString('zh-CN')}</div></div>`);
        c.insertAdjacentHTML('beforeend', '<div style="text-align:center;font:500 11px var(--sans);color:var(--ink2);margin-top:16px">匹兹堡开局小助手 · pgh.leisurecat.cloud</div>');
      }
    });
    showImage(canvas.toDataURL('image/jpeg', 0.92));
  } catch (e) { toast('生成长图失败：' + e.message); }
  ui.saving = false; render();
}
function showImage(url) {
  const el = document.createElement('div');
  el.className = 'shotv';
  el.innerHTML = `<div class="sv-top"><span>长按图片保存到相册</span><a href="${url}" download="匹兹堡结算-${code}.jpg">下载</a><button type="button">关闭</button></div><img src="${url}" alt="结算长图">`;
  el.querySelector('button').onclick = () => el.remove();
  document.body.appendChild(el);
}

/* ---------- start order: the hub's finger chooser / bag draw, then 「返回」 comes back here ---------- */
const orderUrl = n => `https://boardgame.leisurecat.cloud/?order=${n}&back=${encodeURIComponent(location.href)}`;

/* ---------- achievement details: every player's numbers behind one achievement ---------- */
const eraSpent = (r, e) => r.d.rounds.filter(h => h.era === e).reduce((a, h) => a + h.spent, 0);
const ACH_COLS = {
  mvp: [['总分', r => r.total], ['收入', r => r.inc], ['现金', r => r.cash]],
  rail: [['第一时代', r => r.d.e1.rail], ['第二时代', r => r.d.e2.rail], ['合计', r => r.rail]],
  ind: [['第一时代', r => r.d.e1.ind], ['第二时代', r => r.d.e2.ind], ['合计', r => r.ind]],
  mid: [['第一时代', r => r.d.e1.pre], ['第二时代', r => r.d.e2.pre - r.d.e1.total], ['合计', r => r.mid]],
  jewel: [['发电机', r => r.d.e1.alt + r.d.e2.alt], ['机车', r => r.d.e2.loco], ['合计', r => r.jewel]],
  thrift: [['第一时代', r => eraSpent(r, 1)], ['第二时代', r => eraSpent(r, 2)], ['合计', r => r.spent]],
  first: [['先手次数', r => r.firsts]],
  rise: [['第一时代后', r => `第 ${r.e1place} 名`], ['最终', r => `第 ${r.place} 名`], ['提升', r => r.rise]]
};
ACH_COLS.big = ACH_COLS.thrift;
const ACH_SORT = { mvp: r => -r.place, thrift: r => -r.spent, rise: r => r.rise };   // others: by the last column
function achSheet(k) {
  const R = results(S), a = !R.error && R.ach.find(x => x.k === k), cols = ACH_COLS[k];
  if (!a || !cols) return '';
  const by = ACH_SORT[k] || cols.at(-1)[1];
  const rows = R.rows.slice().sort((x, y) => by(y) - by(x));
  const perEra = (r, f) => [1, 2].map(e => { const t = f(r.d.rounds.filter(h => h.era === e)); return t ? `${eraName(e)}：${t}` : ''; }).filter(Boolean).join('<br>');
  const extra = r => k === 'thrift' || k === 'big' ? perEra(r, hs => hs.map(h => h.spent).join(' · '))
    : k === 'first' ? perEra(r, hs => { const f = hs.filter(h => h.first).map(h => h.round); return f.length ? `第 ${f.join('、')} 轮` : ''; }) : '';
  return `<div class="mask" data-act="close"></div><div class="sheet"><h3>${a.name}</h3><div class="hint">${a.desc}${k === 'thrift' || k === 'big' ? '，下面列出每轮花了多少' : k === 'first' ? '，下面列出哪几轮先手' : ''}</div>
    <div class="atw"><table class="at"><thead><tr><th></th>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r => `<tr class="${a.who.includes(r.id) ? 'win' : ''}${extra(r) ? ' has-sub' : ''}"><th>${por(r.id, 'xs')}<span>${esc(pname(r.id))}</span></th>${cols.map(c => `<td>${c[1](r)}</td>`).join('')}</tr>
      ${extra(r) ? `<tr class="sub"><td colspan="${cols.length + 1}">${extra(r)}</td></tr>` : ''}`).join('')}</tbody></table></div>
    <button class="btn ghost" data-act="close">关闭</button></div>`;
}

/* ---------- sheets ---------- */
function sheetView() {
  const s = ui.sheet;
  if (s.kind === 'ach') return achSheet(s.k);
  if (s.kind === 'fig') {
    const me = S.players[s.i];
    const taken = S.players.slice(0, S.n).filter(p => p !== me).map(p => p.fig);
    return `<div class="mask" data-act="close"></div><div class="sheet"><h3>选择角色</h3>
      <div class="figs">${COLOR_FIGS[me.id].map(k => [k, FIGS[k]]).map(([k, n]) => `<button data-act="pick" data-fig="${k}" class="${k === me.fig ? 'on' : ''}" ${taken.includes(k) ? 'disabled' : ''}><span class="por" style="--c:${COLORS[me.id]}"><img src="img/${k}.jpg" alt=""></span>${n}</button>`).join('')}</div>
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
  const text = `匹兹堡开局小助手｜快速开局，计分不烧心\n邀请你加入《工业革命：匹兹堡》房间 ${code}，点开链接就能和大家同步顺位与计分（无需下载）：`;
  if (navigator.share) { try { await navigator.share({ title: '工业革命：匹兹堡 · 房间 ' + code, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('邀请已复制，发给朋友即可'); } catch { toast('房间码 ' + code); }
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
    case 'order': flushAll(); setTimeout(() => { location.href = orderUrl(S.n); }, 150); break;   // let the name edits reach the room first
    case 'start': flushAll(); send({ t: 'start' }); break;
    case 'tab': if (ui.tab !== d.tab) ui.era = null; ui.tab = d.tab; store.set('pgh-tab', d.tab); render(); window.scrollTo(0, 0); break;
    case 'goto': ui.tab = d.tab; if (d.era) ui.era = +d.era; render(); window.scrollTo(0, 0); break;
    case 'era': ui.era = +d.era; render(); break;
    case 'tb': ui.tb = !ui.tb; render(); break;
    case 'rn': ui.rn = !ui.rn; render(); break;
    case 'save': if (!ui.saving) saveImage(); break;
    case 'rv-who': ui.rv.who = d.id; render(); break;
    case 'rv-star': ui.rv.stars = +d.n; render(); break;
    case 'rv-send': sendReview(); break;
    case 'rv-edit': ui.rv.state = ''; render(); break;
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
    case 'ach': ui.sheet = { kind: 'ach', k: d.a }; render(); break;
  }
});

document.addEventListener('input', e => {
  const el = e.target, d = el.dataset;
  if (d.rv !== undefined) ui.rv.text = el.value;
  else if (d.name !== undefined) debounced(d.pk, () => send({ t: 'player', i: +d.name, name: el.value }));
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
