// Reads text copied from Instagram's follower list, or a plain list with one handle per line.
const VALID = /^[A-Za-z0-9._]{1,30}$/;
const ACTION = new Set(['Follow', 'Following', 'Requested', 'Sledovat', 'Sleduji', 'Sledujete']);
const REMOVE = new Set(['Remove', 'Odebrat']);
const PICTURE = /^(Profilový obrázek |.+'s profile picture$)/;

const clean = line => line.trim().replace(/^\[([^\]]+)\]\(.*\)$/, '$1').replace(/^@/, '');

// Returns handles in the order they appear, plus lines that could not be read as handles.
export function parseFollowers(text) {
  let lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const header = lines.findIndex((l, i) => l === 'Followers' && lines[i + 1] === 'Search');
  if (header >= 0) lines = lines.slice(header + 2);

  const handles = [], skipped = [];
  const add = h => { if (VALID.test(h)) handles.push(h); else skipped.push(h); };

  // Logged-in lists end every row with a Remove button, which also marks where a row stops.
  if (lines.some(l => REMOVE.has(l))) {
    let row = [];
    const flush = () => { if (row.length) add(row[0]); row = []; };
    for (const line of lines) {
      if (REMOVE.has(line)) flush();
      else if (line !== '·' && !ACTION.has(line) && !PICTURE.test(line)) row.push(line);
    }
    flush();
    return { handles, skipped };
  }

  if (!lines.includes('·')) {
    lines.forEach(add);
    return { handles, skipped };
  }
  for (let i = 0; i < lines.length;) {
    add(lines[i]);
    if (lines[i + 1] !== '·') { i += 2; continue; } // handle and name with no dot between them
    let next = i + 2;
    if (ACTION.has(lines[next])) next++;
    // If the following line starts a new row, this person has no display name.
    i = lines[next + 1] === '·' ? next : next + 1;
  }
  return { handles, skipped };
}

// Reads followers_1.json from Instagram's data export. Returns handles with the earliest follower first.
export function parseExport(entries) {
  return entries.flatMap(e => e.string_list_data ?? []).filter(s => VALID.test(s.value ?? '')).sort((a, b) => a.timestamp - b.timestamp).map(s => s.value);
}

// Reads followers_1.html from Instagram's HTML data export, which lists the newest follower first.
export function parseExportHtml(html) {
  return [...html.matchAll(/href="https:\/\/www\.instagram\.com\/(?:_u\/)?([A-Za-z0-9._]{1,30})\/?">/g)].map(m => m[1]);
}

// Adds new handles after the existing ones. Instagram lists newest first, so a pasted list is
// reversed to keep the earliest follower first unless oldestFirst is set.
export function mergeFollowers(existing, pasted, { oldestFirst = false } = {}) {
  const known = new Set(existing.map(h => h.toLowerCase()));
  const overlap = pasted.filter(h => known.has(h.toLowerCase())).length;
  // Keep each person's first appearance before reversing, so a repeated row can't change the order.
  const fresh = [];
  for (const h of pasted) {
    const key = h.toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    fresh.push(h);
  }
  const added = oldestFirst ? fresh : fresh.reverse();
  return { followers: [...existing, ...added], added, overlap };
}
