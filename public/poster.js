// Print poster: the final standings as a 3-inch photo (2×3 in, 1200×1800 px), drawn on a canvas over an
// original engraved background (img/poster-bg.jpg). It prints at palm size, so no text is under 40 px except
// the footer, and names and scores stay 60 px or more from the edges, which a borderless print trims.
const W = 1200, H = 1800;
const SERIF = '"Noto Serif SC","Songti SC","STSong",serif', NUM = '"Oswald","DIN Alternate",sans-serif', SANS = '-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
const INK = '#2d241b', INK2 = '#5a4a38', RED = '#7a2416', BRASS = '#9a7430';

const loadImg = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('图片加载失败：' + src)); i.src = src; });

// p: { title, sub, crown, footer, rows: [{ place, name, sub, color, img, total, parts: [[label, value]], medals: [char] }] }
export async function drawPoster(p) {
  const imgs = await Promise.all(['img/poster-bg.jpg', ...p.rows.map(r => r.img)].map(loadImg));
  await document.fonts.ready;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.drawImage(imgs[0], 0, 0, W, H);
  const text = (s, tx, ty, font, color, align = 'center', ls = 0) => {
    x.font = font; x.fillStyle = color; x.textAlign = align; x.textBaseline = 'alphabetic';
    if ('letterSpacing' in x) x.letterSpacing = ls + 'px';
    x.fillText(s, tx, ty);
    if ('letterSpacing' in x) x.letterSpacing = '0px';
  };
  const width = (s, font, ls = 0) => { x.font = font; if ('letterSpacing' in x) x.letterSpacing = ls + 'px'; const w = x.measureText(s).width; if ('letterSpacing' in x) x.letterSpacing = '0px'; return w; };
  const portrait = (img, cx, cy, d, color) => {
    x.save(); x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = d * .08; x.shadowOffsetY = d * .03;
    x.beginPath(); x.arc(cx, cy, d / 2, 0, Math.PI * 2); x.fillStyle = BRASS; x.fill(); x.restore();
    x.beginPath(); x.arc(cx, cy, d / 2 - d * .035, 0, Math.PI * 2); x.fillStyle = color; x.fill();
    x.save(); x.beginPath(); x.arc(cx, cy, d / 2 - d * .09, 0, Math.PI * 2); x.clip();
    const s = Math.max(d / img.width, d / img.height); x.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s);
    x.restore();
  };
  const rule = y => {   // thin double line with a diamond in the middle
    x.strokeStyle = BRASS; x.lineWidth = 3;
    for (const [a, b] of [[170, 560], [640, 1030]]) { x.beginPath(); x.moveTo(a, y); x.lineTo(b, y); x.stroke(); }
    x.save(); x.translate(600, y); x.rotate(Math.PI / 4); x.fillStyle = RED; x.fillRect(-11, -11, 22, 22); x.restore();
  };

  // heading
  text(p.title, 600, 470, `900 80px ${SERIF}`, RED, 'center', 10);
  text(p.sub, 600, 532, `600 40px ${SERIF}`, INK2, 'center', 2);
  rule(572);

  // champion: portrait beside name and score
  const champ = p.rows[0], top = p.rows.filter(r => r.place === 1);
  text(p.crown, 600, 648, `900 42px ${SERIF}`, BRASS, 'center', 8);
  const cnf = `900 64px ${SERIF}`, csf = `600 124px ${NUM}`, d = 200;
  let cname = top.map(r => r.name).join(' · ');
  while (width(cname, cnf, 4) > 560 && cname.length > 1) cname = cname.slice(0, -2) + '…';
  const sw = width(String(champ.total), csf), gw = d + 44 + Math.max(width(cname, cnf, 4), sw + 56), gx = 600 - gw / 2;
  portrait(imgs[1], gx + d / 2, 790, d, champ.color);
  text(cname, gx + d + 44, 768, cnf, INK, 'left', 4);
  text(String(champ.total), gx + d + 44, 890, csf, RED, 'left');
  text('分', gx + d + 44 + sw + 8, 890, `900 48px ${SERIF}`, RED, 'left');
  rule(940);

  // every player, by place; every row shows the same score parts, as many as fit the narrowest row
  const y0 = 960, y1 = 1496, rh = Math.min(150, (y1 - y0) / p.rows.length), L = 90, R = 1110, tx = L + 196;
  const nf = `900 54px ${SERIF}`, pf = `500 40px ${SANS}`, tf = `600 92px ${NUM}`;
  const room = Math.min(...p.rows.map(r => R - width(String(r.total), tf) - 50 - 24 - tx));
  let np = p.rows[0].parts.length;
  while (np > 1 && p.rows.some(r => width(r.parts.slice(0, np).map(([n, v]) => `${n} ${v}`).join('  '), pf) > room)) np--;
  p.rows.forEach((r, i) => {
    const y = y0 + (y1 - y0 - rh * p.rows.length) / 2 + i * rh, mid = y + rh / 2;
    if (i) { x.strokeStyle = 'rgba(154,116,48,.45)'; x.lineWidth = 2; x.beginPath(); x.moveTo(L + 20, y); x.lineTo(R - 20, y); x.stroke(); }
    text(String(r.place), L + 26, mid + 24, `600 68px ${NUM}`, r.place === 1 ? RED : INK2, 'center');
    portrait(imgs[i + 1], L + 124, mid, 104, r.color);
    text(String(r.total), R - 46, mid + 32, tf, INK, 'right');
    text('分', R, mid + 32, `900 40px ${SERIF}`, INK2, 'right');
    // name, then achievement medals while they fit
    let name = r.name; while (width(name, nf) > room && name.length > 1) name = name.slice(0, -1);
    if (name !== r.name) name = name.slice(0, -1) + '…';
    text(name, tx, mid - 8, nf, INK, 'left');
    let mx = tx + width(name, nf) + 16;
    for (const m of r.medals) {
      if (mx + 56 > tx + room) break;
      x.beginPath(); x.arc(mx + 28, mid - 27, 28, 0, Math.PI * 2); x.fillStyle = RED; x.fill();
      x.lineWidth = 3; x.strokeStyle = '#e0c27a'; x.stroke();
      text(m, mx + 28, mid - 13, `900 40px ${SERIF}`, '#f6ecd4', 'center');
      mx += 64;
    }
    text(r.parts.slice(0, np).map(([n, v]) => `${n} ${v}`).join('  '), tx, mid + 44, pf, INK2, 'left');
  });

  text(p.footer, 600, 1532, `500 30px ${SANS}`, INK2, 'center', 1);
  return c.toDataURL('image/jpeg', 0.92);
}
