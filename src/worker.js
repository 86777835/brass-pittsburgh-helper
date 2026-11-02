import { DurableObject } from 'cloudflare:workers';
import { initialState, reduce } from '../public/logic.js';

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

    if (url.pathname === '/api/rooms' && req.method === 'GET') return lobby(env).fetch('https://lobby/list');

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

const lobby = env => env.LOBBY.get(env.LOBBY.idFromName('lobby'));
const LIST_AFTER_IDLE_MS = 30 * 60 * 1000;   // an empty room stays listed this long after its last activity
const LIST_MAX_MS = 12 * 3600 * 1000;

// Lobby: one Durable Object holding a short summary of every recently active room.
export class Lobby extends DurableObject {
  async fetch(req) {
    const rooms = (await this.ctx.storage.get('rooms')) || {};
    const now = Date.now();
    if (req.method === 'POST') { const r = await req.json(); rooms[r.code] = { ...r, updated: now }; }
    for (const [c, r] of Object.entries(rooms)) {
      if (now - r.updated > LIST_MAX_MS || (r.online === 0 && now - r.updated > LIST_AFTER_IDLE_MS)) delete rooms[c];
    }
    await this.ctx.storage.put('rooms', rooms);
    if (req.method === 'POST') return new Response('ok');
    return Response.json(Object.values(rooms).sort((a, b) => b.online - a.online || b.updated - a.updated).slice(0, 30));
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
    this.s = next;
    await this.ctx.storage.put('s', next);
    const out = JSON.stringify({ type: 'state', state: this.view() });
    for (const w of this.ctx.getWebSockets()) { try { w.send(out); } catch {} }
    await this.report();
  }

  async webSocketClose(ws, code) {
    try { ws.close(code, 'closed'); } catch {}
    if (this.s) await this.report(ws);
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
