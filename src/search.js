// Handle search, with no page or 3D dependencies.
export function normalize(query) {
  let q = String(query ?? '').trim();
  const url = q.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (url) q = url[1];
  return q.replace(/^@+/, '').toLowerCase();
}

export function findHandle(handles, query) {
  const q = normalize(query);
  return q ? handles.find(h => h.toLowerCase() === q) ?? null : null;
}

// Exact match first, then handles starting with the text, then handles containing it.
export function suggest(handles, query, limit = 8) {
  const q = normalize(query);
  if (!q) return [];
  const exact = [], starts = [], contains = [];
  for (const h of handles) {
    const l = h.toLowerCase();
    if (l === q) exact.push(h);
    else if (l.startsWith(q)) starts.push(h);
    else if (l.includes(q)) contains.push(h);
  }
  return [...exact, ...starts, ...contains].slice(0, limit);
}

export function shareUrl(href, handle) {
  const u = new URL(href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('seat', handle);
  return u.toString();
}
