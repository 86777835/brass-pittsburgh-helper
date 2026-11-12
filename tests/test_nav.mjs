// Local only: node tests/test_nav.mjs http://localhost:8891/ /tmp/claude-501/codex_tasks/shots
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const [base = 'http://localhost:8891/', out = '/tmp/claude-501/codex_tasks/shots'] = process.argv.slice(2);
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run only locally');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.route('https://boardgame.leisurecat.cloud/api/reviews**', r => r.fulfill({ json: { ok: true } }));
  const check = async label => {
    await page.locator('.back-nav:not(.rate-nav)').waitFor({ state: 'visible' });
    const issues = await page.locator('.back-nav:not(.rate-nav)').evaluate(nav => {
      const a = nav.getBoundingClientRect(), errors = [];
      if (a.height < 36 || a.left < 0 || a.right > innerWidth || a.top < 0 || a.bottom > innerHeight) errors.push('bounds');
      if (document.documentElement.scrollWidth > innerWidth) errors.push('overflow');
      for (const el of document.querySelectorAll('a,button,input,textarea,summary,video,.ttl,.room,.conn,.hero h1,.hero .en,.ht')) {
        if (el === nav || el.contains(nav)) continue;
        const b = el.getBoundingClientRect();
        if (b.width && b.height && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) errors.push(el.outerHTML.slice(0, 120));
      }
      if (nav.closest('#shot') && !nav.hasAttribute('data-html2canvas-ignore')) errors.push('capture');
      return errors;
    });
    assert.deepEqual(issues, [], label);
    console.log('PASS', label);
  };
  await page.goto(base);
  assert.equal(await page.locator('.back-nav:not(.rate-nav)').textContent(), '‹ 全部游戏');
  assert.equal(await page.locator('.back-nav:not(.rate-nav)').getAttribute('href'), 'https://boardgame.leisurecat.cloud');
  await check('landing navigation / mobile geometry');
  await page.screenshot({ path: `${out}/nav_pgh_landing.png` });
  await page.click('[data-act="create"]');
  await page.waitForSelector('[data-name="0"]');
  const code = new URL(page.url()).searchParams.get('r');
  await page.fill('[data-name="0"]', '返回测试');
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.back-nav:not(.rate-nav)').textContent(), '‹ 首页');
  await check('setup navigation / mobile geometry');
  await page.click('.back-nav:not(.rate-nav)');
  await page.waitForSelector('[data-act="create"]');
  assert.equal(new URL(page.url()).search, '');
  await page.click(`[data-act="rejoin"][data-code="${code}"]`);
  await page.waitForSelector('[data-name="0"]');
  assert.equal(await page.inputValue('[data-name="0"]'), '返回测试');
  console.log('PASS setup survives leave and lobby rejoin');
  await page.click('[data-act="start"]');
  await page.waitForSelector('.status');
  const status = await page.textContent('.status .t');
  for (const tab of ['order', 'score', 'mvp']) {
    await page.click(`[data-tab="${tab}"]`);
    await check(`${tab} navigation / mobile geometry`);
    if (tab === 'order') await page.screenshot({ path: `${out}/nav_pgh_room.png` });
    await page.click('.back-nav:not(.rate-nav)');
    await page.fill('#joinCode', code);
    await page.click('[data-act="join"]');
    await page.waitForSelector('.status');
    assert.equal(await page.textContent('.status .t'), status);
  }
  console.log('PASS game survives leave and room-code rejoin from every tab');
  for (const name of ['guide', 'history']) {
    await page.goto(new URL(`/${name}.html`, base).href);
    assert.equal(await page.locator('.back-nav:not(.rate-nav)').textContent(), '‹ 返回');
    assert.equal(await page.locator('.back-nav:not(.rate-nav)').getAttribute('href'), '/');
    await check(`${name} navigation / mobile geometry`);
    await page.screenshot({ path: `${out}/nav_pgh_${name}.png` });
    await page.click('.back-nav:not(.rate-nav)');
    await page.waitForSelector('[data-act="create"]');
  }
  console.log('ALL PASS');
} finally { await browser.close(); }
