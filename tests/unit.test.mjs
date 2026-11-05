import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFollowers, parseExport, parseExportHtml, mergeFollowers } from '../scripts/parse-followers.mjs';
import { normalize, findHandle, suggest, shareUrl } from '../src/search.js';
import { seatForOrder, buildFillOrder, labelFor, STAND_SEATS, VIP_SEATS } from '../src/seats.js';

const data = JSON.parse(readFileSync(new URL('../data/followers.json', import.meta.url), 'utf8'));

test('reads Instagram rows, including no-name, no-dot and logged-in Follow rows', () => {
  const text = `quidditchtournaments\nJunk\nFollowers\nSearch\nalpha_1\n·\nFollow\nAlpha One\nbeta.2\n·\ngamma\n·\n🧛🏾\nreesekgoodwin\nReese Goodwin\nmdp062\n·\nMdp06\nlast_one\n·`;
  assert.deepEqual(parseFollowers(text).handles, ['alpha_1', 'beta.2', 'gamma', 'reesekgoodwin', 'mdp062', 'last_one']);
});

test('reads logged-in rows with buttons, pictures, missing names and missing dots', () => {
  const text = `Profilový obrázek one_1\none_1\n·\n\nSledovat\nOne Person\nOdebrat\nProfilový obrázek two.2\ntwo.2\n·\n\nSledovat\nOdebrat\nthree_3\n·\n\nSledovat\n🕊\nOdebrat\nProfilový obrázek four4\nfour4\nName Four\nOdebrat\nlast_one\nRemove`;
  assert.deepEqual(parseFollowers(text), { handles: ['one_1', 'two.2', 'three_3', 'four4', 'last_one'], skipped: [] });
});

test('reads Instagram exports, earliest follower first', () => {
  assert.deepEqual(parseExport([{ string_list_data: [{ value: 'new_one', timestamp: 9 }] }, { string_list_data: [{ value: 'old_one', timestamp: 2 }] }]), ['old_one', 'new_one']);
});

test('reads Instagram HTML exports', () => {
  assert.deepEqual(parseExportHtml('<a target="_blank" href="https://www.instagram.com/new_one">new_one</a><a href="https://www.instagram.com/old.one">old.one</a>'), ['new_one', 'old.one']);
});

test('reads a plain list and pasted markdown links', () => {
  const { handles, skipped } = parseFollowers('@one\n[two_2](https://www.instagram.com/two_2/)\nnot a handle\n');
  assert.deepEqual(handles, ['one', 'two_2']);
  assert.deepEqual(skipped, ['not a handle']);
});

test('merge keeps existing seats, skips duplicates and adds oldest new follower first', () => {
  const r = mergeFollowers(['a', 'b'], ['newest', 'older', 'B', 'a', 'newest']);
  assert.deepEqual(r.followers, ['a', 'b', 'older', 'newest']);
  assert.equal(r.overlap, 2);
  assert.deepEqual(mergeFollowers(['a'], ['x', 'y'], { oldestFirst: true }).followers, ['a', 'x', 'y']);
});

test('search ignores case, @ and profile URLs', () => {
  assert.equal(normalize(' @Reese_K '), 'reese_k');
  assert.equal(normalize('https://www.instagram.com/Reese.K/?hl=en'), 'reese.k');
  assert.equal(findHandle(['Reese.K'], '@reese.k'), 'Reese.K');
  assert.equal(findHandle(['a'], 'missing'), null);
  assert.deepEqual(suggest(['xab', 'abc', 'ab'], 'ab'), ['ab', 'abc', 'xab']);
});

test('share links contain only the seat', () => {
  assert.equal(shareUrl('https://x.test/map/?seat=old&lite#z', 'bob'), 'https://x.test/map/?seat=bob');
});

test('stands fill one section at a time, front row first, skipping the reserved seat', () => {
  const sec = [1, 19, 19, 20, 18, 19], row = [0, 1, 0, 0, 0, 0], num = [1, 1, 2, 1, 1, 1];
  const fill = buildFillOrder(sec, row, num, 6, 5);
  assert.deepEqual(fill.map(i => sec[i]), [19, 19, 18, 20, 1]);
  assert.deepEqual(fill.slice(0, 2), [2, 1]);
  assert.equal(seatForOrder(237, fill), STAND_SEATS + 237);
  assert.equal(seatForOrder(VIP_SEATS, fill), 2);
  assert.equal(new Set(data.followers.map((_, i) => seatForOrder(i, Array.from({ length: STAND_SEATS }, (_, n) => n)))).size, data.followers.length);
  assert.equal(labelFor({ vip: true, tower: 5, box: 2, seat: 13 }), 'VIP Tower 5 · Box 2 · Seat 13');
});

test('follower data is valid', () => {
  assert.equal(new Set(data.followers.map(h => h.toLowerCase())).size, data.followers.length);
  data.followers.forEach(h => assert.match(h, /^[A-Za-z0-9._]{1,30}$/));
  assert.equal(data.followers[237], 'reesekgoodwin');
  assert.ok(data.followers.length >= VIP_SEATS);
});
