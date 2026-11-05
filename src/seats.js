// Seat numbering. A follower's position in data/followers.json sets their seat for good,
// so this order must not change once the site is live.
export const STAND_SEATS = 29000;
export const VIP_SEATS = 1000;

// Stands fill one section at a time, front row first, starting from a middle section and working outward.
export function buildFillOrder(sec, row, num, total, reserved, sections = 24, first = 19) {
  const rank = s => { const after = (s - first + sections) % sections, before = (first - s + sections) % sections; return after <= before ? after * 2 : before * 2 - 1; };
  const ids = []; for (let i = 0; i < total; i++) if (i !== reserved) ids.push(i);
  return ids.sort((a, b) => rank(sec[a]) - rank(sec[b]) || row[a] - row[b] || num[a] - num[b]);
}

export function seatForOrder(order, fillOrder) {
  return order < VIP_SEATS ? STAND_SEATS + order : fillOrder[(order - VIP_SEATS) % fillOrder.length];
}

export function labelFor(s) {
  return s.vip
    ? `VIP Tower ${s.tower} · Box ${s.box} · Seat ${s.seat}`
    : `Section ${s.section} · Row ${s.row} · Seat ${s.seat}`;
}
