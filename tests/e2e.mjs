// Browser check. Start the site first with `npm start`, then run: npm run e2e [screenshot-folder]
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const URL_BASE = process.env.SITE_URL || 'http://localhost:4188/';
const OUT = process.argv[2] || 'tests/screenshots';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SEAT_LIST = new globalThis.URL('../../quidditch/followers/followers.csv', import.meta.url);
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
const open = async (viewport, query = '') => {
  const p = await browser.newPage(); await p.setViewport(viewport);
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL_BASE + query, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__siteReady === true', { timeout: 90000 }).catch(err => { console.error(errors); throw err; });
  return { p, errors };
};
const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const overlaps = (p, a, b) => p.evaluate((a, b) => {
  const A = document.querySelector(a)?.getBoundingClientRect(), B = document.querySelector(b)?.getBoundingClientRect();
  return !!A && !!B && A.width > 0 && B.width > 0 && !(A.right <= B.left || B.right <= A.left || A.bottom <= B.top || B.bottom <= A.top);
}, a, b);

// Desktop: search, name tag, share link, not found
{
  const { p, errors } = await open({ width: 1440, height: 900 });
  const stats = await p.evaluate(() => window.__site.stats());
  console.log('desktop', stats);
  if (existsSync(SEAT_LIST)) {
    const rows = readFileSync(SEAT_LIST, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map(l => { const c = l.split(','); return [c[2], c.at(-2)]; });
    const wrong = await p.evaluate(rows => rows.filter(([h, label]) => window.__site.seatLabel(window.__site.seatOf(h)) !== label).map(r => r[0]), rows);
    assert.deepEqual(wrong, [], 'seats differ from the quidditch seat list');
    console.log(`seat list matches for ${rows.length} followers`);
  }
  await p.type('#finderInput', '@REESEK');
  await p.waitForSelector('#suggest li');
  assert.equal(await p.$eval('#suggest li', e => e.textContent), '@reesekgoodwin');
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
  await wait(4000);
  assert.equal(await p.$eval('#cardName', e => e.textContent), '@reesekgoodwin');
  assert.equal(await p.$eval('#cardSeat', e => e.textContent), 'VIP Tower 5 · Box 2 · Seat 13');
  assert.match(p.url(), /\?seat=reesekgoodwin$/);
  await p.screenshot({ path: `${OUT}/desktop-reese.png` });
  await p.click('#closeCard');
  assert.equal(await p.$eval('#card', e => e.hidden), true);
  await p.type('#finderInput', 'nobody_here_404'); await p.keyboard.press('Enter');
  assert.match(await p.$eval('#message', e => e.textContent), /Not seated yet: nobody_here_404/);
  await p.screenshot({ path: `${OUT}/desktop-not-found.png` });
  assert.deepEqual(errors, []);
  await p.close();
}

// Phone: deep link, layout, Ko-fi button
{
  const { p, errors } = await open({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, '?seat=reesekgoodwin');
  await wait(4500);
  const stats = await p.evaluate(() => window.__site.stats());
  console.log('phone', stats);
  assert.equal(stats.lite, true);
  assert.equal(await p.$eval('#cardName', e => e.textContent), '@reesekgoodwin');
  assert.ok(await noOverflow(p), 'page overflows sideways');
  assert.equal(await overlaps(p, '#shop', '#card'), false, 'Outfits and ads button covers the seat card');
  assert.equal(await overlaps(p, '#finder', '#card'), false);
  await p.screenshot({ path: `${OUT}/phone-reese.png` });
  await p.click('#shop');
  await p.waitForSelector('#kofiFrame[src*="ko-fi.com/interactivecorps"]');
  await wait(3500);
  assert.equal(await p.$eval('#shopDialog', d => d.open), true);
  assert.equal(await p.$eval('#shopDialog', d => d.scrollWidth <= d.clientWidth), true, 'Ko-fi panel overflows sideways');
  await p.screenshot({ path: `${OUT}/phone-shop.png` });
  await p.click('#shopClose');
  assert.equal(await p.$eval('#shopDialog', d => d.open), false);
  assert.deepEqual(errors, []);
  await p.close();
}
// Phone: first screen
{
  const { p } = await open({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await wait(2500);
  await p.screenshot({ path: `${OUT}/phone-home.png` });
  await p.close();
}
// Terms page
{
  const p = await browser.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const r = await p.goto(URL_BASE + 'terms.html', { waitUntil: 'load' });
  assert.equal(r.status(), 200);
  assert.match(await p.$eval('main', m => m.innerText), /Updates are not instant/);
  assert.ok(await noOverflow(p), 'terms page overflows sideways');
  assert.ok(await p.evaluate(() => { scrollTo(0, 400); return scrollY > 0; }), 'terms page does not scroll');
  await p.type('#cancelName', '@tester'); await p.type('#cancelDetails', 'First 100 board, 2026-11-05');
  await p.click('#cancelForm button');
  await p.waitForSelector('#cancelResult:not([hidden])');
  assert.match(await p.$eval('#cancelText', n => n.textContent), /cancelling my purchase.*@tester.*First 100 board/);
  assert.ok(await noOverflow(p), 'cancel form overflows sideways');
  await p.screenshot({ path: `${OUT}/phone-terms.png` });
  await p.close();
}
await browser.close();
console.log('All browser checks passed.');
