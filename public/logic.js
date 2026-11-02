// Game rules shared by the room server (Durable Object) and the page.
// Rulebook v2026.01: 2 eras × 8 rounds; least spent goes first, ties keep relative order.

export const ROUNDS_PER_ERA = 8;
export const SETTLE_COOLDOWN_MS = 2500;
export const COLOR_ORDER = ['yellow', 'blue', 'orange', 'purple'];
export const COLOR_ZH = { yellow: '黄色', blue: '蓝色', orange: '橙色', purple: '紫色' };
export const FIGS = {
  bly: '内莉·布莱', carnegie: '安德鲁·卡内基', frick: '亨利·克莱·弗里克', morgan: 'J.P. 摩根',
  rockefeller: '约翰·D·洛克菲勒', bissell: '安娜·萨瑟兰·比塞尔', tesla: '尼古拉·特斯拉', walker: '玛吉·莉娜·沃克'
};
// Faces shown on the character tiles in the rulebook's setup pictures.
export const DEFAULT_FIG = { yellow: 'bly', blue: 'tesla', orange: 'carnegie', purple: 'rockefeller' };
// Characters each color's tile can show (a tile is double-sided). The rulebook shows yellow Bly, orange Carnegie,
// purple Rockefeller and both blue sides (Tesla, Walker), but not which of Frick, Morgan and Bissell is on the back
// of yellow, orange and purple, so those three are allowed on any of those colors until confirmed.
const UNCONFIRMED_BACKS = ['frick', 'morgan', 'bissell'];
export const COLOR_FIGS = {
  yellow: ['bly', ...UNCONFIRMED_BACKS], blue: ['tesla', 'walker'],
  orange: ['carnegie', ...UNCONFIRMED_BACKS], purple: ['rockefeller', ...UNCONFIRMED_BACKS]
};
// Score fields per era. rail/ind are lists of per-link / per-tile values; the rest are single numbers.
export const LIST_KEYS = ['rail', 'ind'];
export const ERA_KEYS = { 1: ['pre', 'rail', 'ind', 'alt'], 2: ['pre', 'rail', 'ind', 'alt', 'loco', 'inc', 'cash'] };

export function initialState() {
  return {
    v: 0, stage: 'setup', n: 4,
    players: COLOR_ORDER.map(c => ({ id: c, fig: DEFAULT_FIG[c], name: '' })),
    era: 1, round: 1, order: [], spent: {}, history: [], last: null, prev: null,
    score: { 1: {}, 2: {} }
  };
}

// Whole number ≥ min (≤ 9999); empty counts as 0; anything else is null.
export function num(v, min = 0) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= 9999 ? n : null;
}

const clone = o => JSON.parse(JSON.stringify(o));
const seated = S => S.players.slice(0, S.n);
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, max);

// Applies one action. Returns the new state, or null when the action is invalid or stale.
export function reduce(s, a) {
  if (!a || typeof a !== 'object') return null;
  const S = clone(s);
  const snapshot = () => { const p = clone(s); p.prev = null; return p; };
  const done = () => { S.v = s.v + 1; return S; };

  switch (a.t) {
    case 'setN':
      if (S.stage !== 'setup' || ![2, 3, 4].includes(a.n)) return null;
      S.n = a.n; return done();

    case 'player': {
      if (S.stage !== 'setup') return null;
      const p = S.players[a.i]; if (!p || a.i >= S.n) return null;
      if (a.name !== undefined) p.name = cleanText(a.name, 12).trim();
      if (a.fig !== undefined) {
        if (!COLOR_FIGS[p.id].includes(a.fig) || seated(S).some(o => o !== p && o.fig === a.fig)) return null;
        p.fig = a.fig;
      }
      if (a.color !== undefined) {
        const other = S.players.find(o => o.id === a.color);
        if (!other || (other !== p && S.players.indexOf(other) < S.n)) return null;
        other.id = p.id; p.id = a.color;
        [other.fig, p.fig] = [p.fig, other.fig];   // the character tile goes with its color
      }
      return done();
    }

    case 'move': {
      const { i, j } = a;
      if (S.stage !== 'setup' || ![i, j].every(k => Number.isInteger(k) && k >= 0 && k < S.n)) return null;
      [S.players[i], S.players[j]] = [S.players[j], S.players[i]];
      return done();
    }

    case 'shuffle': {
      if (S.stage !== 'setup') return null;
      const a2 = S.players;
      for (let i = S.n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; }
      S.draw = (s.draw || 0) + 1;   // tells every phone to play the blind-bag draw
      return done();
    }

    case 'start':
      if (S.stage !== 'setup') return null;
      Object.assign(S, { stage: 'play', gid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),   // names this game in the archive
        order: seated(S).map(p => p.id), era: 1, round: 1, spent: {}, history: [], last: null, prev: null, score: { 1: {}, 2: {} } });
      return done();

    case 'settle': {
      // era/round guard stops a stale phone from settling the same round twice; the time guard stops a
      // second tap that arrives just after the update from settling the next (empty) round.
      if (S.stage !== 'play' || a.era !== S.era || a.round !== S.round || !a.spent || typeof a.spent !== 'object') return null;
      if (s.settledAt && Date.now() - s.settledAt < SETTLE_COOLDOWN_MS) return null;
      S.settledAt = Date.now();
      const amt = {};
      for (const id of S.order) { const v = num(a.spent[id]); if (v === null) return null; amt[id] = v; }
      const prevIndex = Object.fromEntries(S.order.map((id, i) => [id, i]));
      const next = S.order.slice().sort((x, y) => amt[x] - amt[y] || prevIndex[x] - prevIndex[y]);
      const count = {}; for (const id of next) count[amt[id]] = (count[amt[id]] || 0) + 1;
      S.prev = snapshot(); S.prev.spent = Object.fromEntries(S.order.map(id => [id, String(amt[id])]));  // undo brings the amounts back
      S.history.push({ era: S.era, round: S.round, order: S.order, spent: amt });
      S.last = { era: S.era, round: S.round, rows: next.map(id => ({ id, spent: amt[id], tie: count[amt[id]] > 1 })) };
      S.spent = {};
      if (S.era === 2 && S.round === ROUNDS_PER_ERA) { S.stage = 'over'; return done(); }
      S.order = next;
      if (S.round === ROUNDS_PER_ERA) { S.era = 2; S.round = 1; } else S.round += 1;
      return done();
    }

    case 'undo':
      if (!s.prev) return null;
      { const p = clone(s.prev); p.score = S.score; p.v = s.v + 1; return p; }   // undo order only, keep scores

    case 'score': {
      const era = a.era === 1 || a.era === 2 ? a.era : null;
      if (S.stage === 'setup' || !era || !S.order.includes(a.id) || !ERA_KEYS[era].includes(a.key)) return null;
      let v = a.value;
      if (LIST_KEYS.includes(a.key)) {
        if (!Array.isArray(v) || v.length > 60 || !v.every(x => Number.isInteger(x) && x >= -99 && x <= 99)) return null;
      } else v = cleanText(v, 6);
      (S.score[era][a.id] ||= {})[a.key] = v;
      return done();
    }

    case 'reset':
      Object.assign(S, { stage: 'setup', order: [], spent: {}, history: [], last: null, prev: null, era: 1, round: 1, score: { 1: {}, 2: {} } });
      return done();
  }
  return null;
}

// What the archive keeps for a finished game: standings and score breakdown. Null while a score field is invalid.
export function gameRecord(S) {
  const R = results(S);
  if (R.error) return null;
  return {
    gid: S.gid, rounds: S.history.length,
    players: R.rows.map(r => {
      const p = S.players.find(x => x.id === r.id);
      return { id: r.id, fig: p.fig, name: p.name, place: r.place, total: r.total, inc: r.inc, cash: r.cash, mid: r.mid, rail: r.rail, ind: r.ind, jewel: r.jewel };
    })
  };
}

/* ---------- scoring ---------- */
const sum = a => (a || []).reduce((x, y) => x + y, 0);

// One era's numbers for one player, or null if a field holds an invalid number.
export function eraParts(S, era, id) {
  const d = (S.score[era] || {})[id] || {};
  const pre = num(d.pre, -999), alt = num(d.alt), loco = era === 2 ? num(d.loco) : 0;
  if (pre === null || alt === null || loco === null) return null;
  const rail = sum(d.rail), ind = sum(d.ind);
  return { pre, rail, ind, alt, loco: loco * 4, total: pre + rail + ind + alt + loco * 4, preFilled: d.pre !== undefined && d.pre !== '' };
}

// Final standings with tie-breaks (income level, then cash) plus per-category totals and achievements.
export function results(S) {
  const rows = [];
  for (const id of S.order) {
    const e1 = eraParts(S, 1, id), e2 = eraParts(S, 2, id);
    const d2 = S.score[2][id] || {};
    const inc = num(d2.inc, -10), cash = num(d2.cash);
    if (!e1 || !e2 || inc === null || cash === null) return { error: true };
    const spentAll = S.history.reduce((x, h) => x + (h.spent[id] || 0), 0);
    const firsts = S.history.filter(h => h.order[0] === id).length;
    rows.push({
      id, total: e2.total, inc, cash, e1: e1.total,
      mid: e1.pre + (e2.pre - e1.total),           // points scored during play (track moves outside era-end scoring)
      rail: e1.rail + e2.rail, ind: e1.ind + e2.ind, jewel: e1.alt + e2.alt + e2.loco,
      spent: spentAll, firsts, pre2Missing: !e2.preFilled
    });
  }
  const sorted = rows.slice().sort((a, b) => b.total - a.total || b.inc - a.inc || b.cash - a.cash);
  sorted.forEach((r, i) => {
    const p = sorted[i - 1];
    r.place = p && p.total === r.total && p.inc === r.inc && p.cash === r.cash ? p.place : i + 1;
    r.tiedPts = sorted.some(o => o !== r && o.total === r.total);
  });
  const e1sorted = rows.slice().sort((a, b) => b.e1 - a.e1);
  rows.forEach(r => { r.e1place = e1sorted.findIndex(o => o.e1 === r.e1) + 1; r.rise = r.e1place - r.place; });

  const best = (val, opts = {}) => {
    const vs = rows.map(val);
    const max = Math.max(...vs);
    if (!(max > (opts.min ?? 0)) || (rows.length > 1 && vs.every(v => v === max))) return [];
    return rows.filter((r, i) => vs[i] === max).map(r => r.id);
  };
  const played = S.history.length > 0;
  const ach = [
    { k: 'mvp', ch: '冠', name: '工业大亨', desc: '最终排名第一', who: sorted.filter(r => r.place === 1).map(r => r.id) },
    { k: 'rail', ch: '路', name: '铁路之王', desc: '火车链接得分最高', who: best(r => r.rail) },
    { k: 'ind', ch: '业', name: '实业巨擘', desc: '产业板块得分最高', who: best(r => r.ind) },
    { k: 'mid', ch: '抢', name: '中途抢分', desc: '游戏过程中得分最高', who: best(r => r.mid) },
    { k: 'jewel', ch: '珠', name: '明珠在握', desc: '皇冠明珠额外得分最高', who: best(r => r.jewel) },
    { k: 'thrift', ch: '俭', name: '精打细算', desc: '全局花钱最少', who: played ? best(r => -r.spent, { min: -Infinity }) : [] },
    { k: 'big', ch: '豪', name: '挥金如土', desc: '全局花钱最多', who: played ? best(r => r.spent) : [] },
    { k: 'first', ch: '先', name: '先手专业户', desc: '先手次数最多', who: played ? best(r => r.firsts) : [] },
    { k: 'rise', ch: '升', name: '后来居上', desc: '名次比第一时代结束时提升最多', who: best(r => r.rise) }
  ].filter(a => a.who.length);
  return { rows: sorted, ach };
}
