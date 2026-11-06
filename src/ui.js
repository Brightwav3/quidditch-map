import { site } from './stadium.js';
import { findHandle, suggest, shareUrl } from './search.js';

const INSTAGRAM = 'https://www.instagram.com/quidditchtournaments/';
const $ = id => document.getElementById(id);
const form = $('finderForm'), input = $('finderInput'), list = $('suggest'), message = $('message');
const card = $('card'), cardName = $('cardName'), cardSeat = $('cardSeat'), copyBtn = $('copyLink');
let active = -1, current = null;

const count = site.handles.length;
$('tally').textContent = `${count.toLocaleString('en-US')} seated · ${(site.totalSeats - count).toLocaleString('en-US')} seats free`;

function closeList() {
  list.hidden = true; list.replaceChildren(); active = -1;
  input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
}
function renderList() {
  const items = suggest(site.handles, input.value);
  list.replaceChildren(...items.map((h, i) => {
    const li = document.createElement('li');
    li.id = `s${i}`; li.role = 'option'; li.textContent = '@' + h; li.dataset.handle = h;
    li.setAttribute('aria-selected', 'false');
    li.addEventListener('pointerdown', e => { e.preventDefault(); choose(h); });
    return li;
  }));
  active = -1; list.hidden = !items.length;
  input.setAttribute('aria-expanded', String(!!items.length)); input.removeAttribute('aria-activedescendant');
}
function moveActive(step) {
  const n = list.children.length; if (!n) return;
  active = (active + step + n) % n;
  [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
  input.setAttribute('aria-activedescendant', `s${active}`);
}
function setUrl(handle) {
  const u = new URL(location.href);
  if (handle) u.searchParams.set('seat', handle); else u.searchParams.delete('seat');
  history.replaceState(null, '', u);
}
function notFound(q) {
  message.hidden = false;
  message.replaceChildren(`Not seated yet: ${q}. New followers are added in batches. `);
  const a = document.createElement('a'); a.href = INSTAGRAM; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Follow on Instagram';
  message.append(a);
}
function choose(handle) {
  closeList(); message.hidden = true; input.value = '@' + handle; site.focusHandle(handle); input.blur();
}

input.addEventListener('input', () => { message.hidden = true; renderList(); });
input.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
  else if (e.key === 'Escape') closeList();
});
input.addEventListener('blur', () => setTimeout(closeList, 120));
form.addEventListener('submit', e => {
  e.preventDefault();
  if (active >= 0) { choose(list.children[active].dataset.handle); return; }
  const q = input.value.trim(); if (!q) return;
  const match = findHandle(site.handles, q);
  if (match) choose(match); else { closeList(); notFound(q); }
});

site.onSelect(sel => {
  current = sel?.handle ?? null;
  card.hidden = !sel;
  if (!sel) { setUrl(null); return; }
  cardName.textContent = sel.title; cardSeat.textContent = sel.label;
  copyBtn.hidden = !current; copyBtn.textContent = 'Copy link';
  setUrl(current);
});
$('closeCard').addEventListener('click', () => { site.clear(); input.value = ''; });
copyBtn.addEventListener('click', async () => {
  const url = shareUrl(location.href, current);
  try { await navigator.clipboard.writeText(url); copyBtn.textContent = 'Copied'; }
  catch { prompt('Copy your seat link', url); }
});

const wanted = new URLSearchParams(location.search).get('seat');
if (wanted) {
  const match = findHandle(site.handles, wanted);
  if (match) choose(match); else { input.value = wanted; notFound(wanted); }
}
$('loader').hidden = true;
input.disabled = false;
window.__siteReady = true;
window.__site = site;
