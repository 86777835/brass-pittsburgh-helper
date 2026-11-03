import { DurableObject } from 'cloudflare:workers';
import { initialState, reduce, gameRecord, FIGS } from '../public/logic.js';
import GUIDE from '../tools/讲解稿.md';
import FAQ from '../tools/faq.json';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/api/room' && req.method === 'POST') {
      for (let i = 0; i < 6; i++) {
        const code = newCode();
        const res = await env.ROOM.get(env.ROOM.idFromName(code)).fetch('https://room/init', { method: 'POST', body: code });
        if (res.ok) return Response.json({ code });
      }
      return Response.json({ error: '暂时无法创建房间，请重试' }, { status: 503 });
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') return chat(req, env);
    if (url.pathname === '/api/rooms' && req.method === 'GET') return lobby(env).fetch('https://lobby/list');
    if (url.pathname === '/api/games' && req.method === 'GET') return archive(env).fetch('https://archive/list' + url.search);

    const m = url.pathname.match(/^\/api\/room\/([A-Z0-9]{4})\/ws$/);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('需要 WebSocket 连接', { status: 426 });
      return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
    }

    const media = url.pathname.match(/^\/media\/([\w.-]+)$/);
    if (media && req.method === 'GET') return serveMedia(env, media[1], req);

    return new Response('Not found', { status: 404 });
  }
};

// Files in the R2 bucket (the rules video). Honors Range so phones can seek.
async function serveMedia(env, key, req) {
  const obj = await env.MEDIA.get(key, { range: req.headers, onlyIf: req.headers });
  if (!obj) return new Response('Not found', { status: 404 });
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('accept-ranges', 'bytes');
  if (!('body' in obj)) return new Response(null, { status: 304, headers: h });
  if (!req.headers.has('range') || !obj.range) return new Response(obj.body, { headers: h });
  const r = obj.range;
  const start = r.suffix != null ? obj.size - r.suffix : r.offset ?? 0;
  const len = r.suffix != null ? r.suffix : r.length ?? obj.size - start;
  h.set('content-range', `bytes ${start}-${start + len - 1}/${obj.size}`);
  return new Response(obj.body, { status: 206, headers: h });
}

// Rules assistant: answers from the tutorial script and FAQ (both written from the official rulebook) via DeepSeek.
const CHAT_MODEL = 'deepseek-flash';   // DeepSeek V4.1 Flash
const CHAT_SYSTEM = `你是「匹兹堡规则助手」，帮玩家解答桌游《工业革命：匹兹堡》（Brass: Pittsburgh）的规则问题，也可以解释本网站「匹兹堡开局小助手」怎么用。

回答要求：
- 只依据下面的「讲解稿」和「常见问题」作答，它们整理自官方规则书 v2026.01。资料里没有的内容，直接说资料里没有、建议翻规则书或问桌上的老玩家，不要编造规则。
- 与本游戏无关的问题，礼貌说明你只解答匹兹堡规则。
- 用简体中文，简短直接：先给结论，再补一两句理由或例子。可以用短列表，不要用表格和标题。

本网站怎么用：一桌人进同一个房间，手机实时同步。开局选人数、名字、颜色和角色，可随机排序；每轮输入每人花费，点「结算」后按花钱从少到多排下一轮顺位，同额保持原相对顺序；「计分」页分两个时代填计分条、铁路、产业、发电机、机车；「结算」页显示排名、得分构成和成就，同分先比收入等级再比现金，可以改玩家名、保存结算长图。

# 讲解稿
${GUIDE}

# 常见问题
${FAQ.map(f => `【${f.cat}】问：${f.q}\n答：${f.a}`).join('\n\n')}`;

async function chat(req, env) {
  if (!env.DEEPSEEK_API_KEY) return Response.json({ error: '规则助手还没有配置好，请稍后再试' }, { status: 503 });
  const { success } = await env.CHAT_LIMIT.limit({ key: req.headers.get('cf-connecting-ip') || 'local' });
  if (!success) return Response.json({ error: '问得有点快，请过一分钟再问' }, { status: 429 });
  let msgs;
  try { msgs = (await req.json()).messages; } catch { msgs = null; }
  const valid = Array.isArray(msgs) && msgs.length > 0 && msgs.length <= 20 && msgs.at(-1).role === 'user' && msgs.at(-1).content?.length <= 500
    && msgs.every(m => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string' && m.content.trim() && m.content.length <= 3000);
  if (!valid) return Response.json({ error: '问题格式不对，请刷新页面再试' }, { status: 400 });
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: CHAT_MODEL, stream: true, thinking: { type: 'disabled' }, max_tokens: 900, temperature: 0.3,
      messages: [{ role: 'system', content: CHAT_SYSTEM }, ...msgs.slice(-10).map(m => ({ role: m.role, content: m.content }))]
    })
  });
  if (!r.ok) {
    console.log('deepseek error', r.status, (await r.text()).slice(0, 500));
    return Response.json({ error: `规则助手暂时不可用（${r.status}），请稍后再试` }, { status: 502 });
  }
  return new Response(r.body, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' } });
}

const lobby = env => env.LOBBY.get(env.LOBBY.idFromName('lobby'));
const archive = env => env.ARCHIVE.get(env.ARCHIVE.idFromName('archive'));
const LIST_SETUP_IDLE_MS = 30 * 60 * 1000;        // a room whose game hasn't started stays listed this long after everyone leaves
const LIST_GAME_IDLE_MS = 7 * 24 * 3600 * 1000;   // a started or finished game stays listed this long after its last activity

// Lobby: one Durable Object holding a short summary of every recently active room.
export class Lobby extends DurableObject {
  async fetch(req) {
    const rooms = (await this.ctx.storage.get('rooms')) || {};
    const now = Date.now();
    if (req.method === 'POST') { const r = await req.json(); rooms[r.code] = { ...r, updated: now }; }
    for (const [c, r] of Object.entries(rooms)) {
      if (now - r.updated > LIST_GAME_IDLE_MS || (r.stage === 'setup' && r.online === 0 && now - r.updated > LIST_SETUP_IDLE_MS)) delete rooms[c];
    }
    await this.ctx.storage.put('rooms', rooms);
    if (req.method === 'POST') return new Response('ok');
    return Response.json(Object.values(rooms).sort((a, b) => b.online - a.online || b.updated - a.updated).slice(0, 30));
  }
}

// Archive: one Durable Object holding every finished game, keyed by game id (ids start with the start time, so key order = newest last).
export class Archive extends DurableObject {
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/put') {
      const r = await req.json(), key = 'g:' + r.gid;
      const old = await this.ctx.storage.get(key);
      await this.ctx.storage.put(key, { ...r, ended: old?.ended ?? Date.now() });
      return new Response('ok');
    }
    if (url.pathname === '/del') { await this.ctx.storage.delete('g:' + await req.text()); return new Response('ok'); }
    // list: newest first, optionally filtered by room code, player name or character name; searches the latest 1000 games
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const all = await this.ctx.storage.list({ prefix: 'g:', reverse: true, limit: 1000 });
    const out = [];
    for (const g of all.values()) {
      if (!q || g.code.toLowerCase() === q || g.players.some(p => p.name.toLowerCase().includes(q) || FIGS[p.fig].includes(q))) out.push(g);
      if (out.length >= 50) break;
    }
    return Response.json(out);
  }
}

// One room = one Durable Object holding the shared game state.
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get('s')) ?? null;
      this.code = (await ctx.storage.get('code')) ?? null;
    });
  }

  async fetch(req) {
    if (new URL(req.url).pathname === '/init') {
      if (this.s) return new Response('exists', { status: 409 });
      this.s = initialState();
      this.code = await req.text();
      await this.ctx.storage.put({ s: this.s, code: this.code });
      await this.report();
      return new Response('ok');
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify(this.s ? { type: 'state', state: this.view() } : { type: 'error', error: 'noroom' }));
    if (this.s) await this.report();
    return new Response(null, { status: 101, webSocket: client });
  }

  view() { return { ...this.s, prev: !!this.s.prev }; }

  async webSocketMessage(ws, msg) {
    if (!this.s || typeof msg !== 'string' || msg.length > 8000) return;
    let action; try { ({ action } = JSON.parse(msg)); } catch { return; }
    const next = reduce(this.s, action);
    if (!next) { ws.send(JSON.stringify({ type: 'state', state: this.view() })); return; }  // rejected: resync sender
    const before = this.s;
    this.s = next;
    await this.ctx.storage.put('s', next);
    const out = JSON.stringify({ type: 'state', state: this.view() });
    for (const w of this.ctx.getWebSockets()) { try { w.send(out); } catch {} }
    await this.record(before, action);
    await this.report();
  }

  async webSocketClose(ws, code) {
    try { ws.close(code, 'closed'); } catch {}
    if (this.s) await this.report(ws);
  }

  // Keep the archive in step with a finished game: update it on every change while the game is over,
  // and drop it when the final settle is undone. Games started before game ids existed are not archived.
  async record(before, action) {
    const s = this.s;
    if (s.stage === 'over' && s.gid) {
      const rec = gameRecord(s);
      if (rec) await archive(this.env).fetch('https://archive/put', { method: 'POST', body: JSON.stringify({ ...rec, code: this.code }) });
    } else if (before.stage === 'over' && action.t === 'undo' && before.gid) {
      await archive(this.env).fetch('https://archive/del', { method: 'POST', body: before.gid });
    }
  }

  // Tell the lobby who is here and how far the game is.
  async report(leaving) {
    if (!this.code) return;   // rooms made before the lobby existed
    const s = this.s;
    const online = this.ctx.getWebSockets().filter(w => w !== leaving && w.readyState === WebSocket.OPEN).length;
    const summary = { code: this.code, stage: s.stage, era: s.era, round: s.round, online,
      players: s.players.slice(0, s.n).map(p => ({ id: p.id, fig: p.fig, name: p.name })) };
    try { await lobby(this.env).fetch('https://lobby/update', { method: 'POST', body: JSON.stringify(summary) }); } catch {}
  }
}
