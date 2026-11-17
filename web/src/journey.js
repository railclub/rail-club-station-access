// Journey Partner for any train, in the browser.
//
// 1. The timetable comes from the files scraper/rail_data.py publishes under data/rail/ (open
//    data, every station the train passes, with times).
// 2. The line is drawn station to station through all of them.
// 3. The journey-sights Edge Function asks OpenStreetMap what lies along that line.
// 4. Here each sight gets its distance along the line, its side (left or right, facing the way
//    the train goes) and the time the train passes it, worked out between the stations around it.
// The maths mirrors scraper/journey_geo.py, where the tests live.

const R = 6_371_000;
const rad = Math.PI / 180;
export const distance = (a, b) => {
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const xy = (p, o) => [(p.lon - o.lon) * rad * R * Math.cos(o.lat * rad), (p.lat - o.lat) * rad * R];

export const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min) % 60).padStart(2, "0")}`;
export const dayOf = (min) => Math.floor(min / 1440) + 1;

const cache = new Map();
const get = (path) => {
  if (!cache.has(path)) cache.set(path, fetch(`data/rail/${path}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));
  return cache.get(path);
};
export const loadIndex = () => get("index.json");
export const loadStations = () => get("stations.json");
export const loadTimetable = (number) => get(`t/${number.slice(0, 2)}.json`).then((t) => t[number] ?? null);

/** The stations where the train stops (not the ones it runs through), for the From/To lists. */
export const halts = (rows) => rows.filter((r, i) => i === 0 || i === rows.length - 1 || r[1] !== r[2]);

/** The journey from `from` to `to` as a path: [{code, name, lat, lon, m, arr, dep, halt}].
 * Stations without coordinates are left off the path but their times still count. */
export function journey(rows, stations, from, to) {
  const i = rows.findIndex((r) => r[0] === from);
  const j = rows.findIndex((r, n) => n > i && r[0] === to);
  if (i < 0 || j < 0) return null;
  const path = [];
  rows.slice(i, j + 1).forEach(([code, arr, dep], n, all) => {
    const [name, lat, lon] = stations[code] ?? [code, null, null];
    const halt = n === 0 || n === all.length - 1 || arr !== dep;
    if (lat === null || lon === null) return;
    const m = path.length ? path.at(-1).m + distance(path.at(-1), { lat, lon }) : 0;
    path.push({ code, name, lat, lon, m, arr: n === 0 ? dep : arr ?? dep, dep: n === all.length - 1 ? arr : dep ?? arr, halt });
  });
  return path.length >= 2 ? path : null;
}

/** Where a point is relative to the line: {m: metres along it, off: metres from it, side}. */
export function locate(path, p) {
  let best = { off: Infinity, m: 0, side: "left" };
  const o = path[0];
  const P = xy(p, o);
  for (let k = 0; k < path.length - 1; k++) {
    const a = xy(path[k], o), b = xy(path[k + 1], o);
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    if (!len2) continue;
    const t = Math.max(0, Math.min(1, ((P[0] - a[0]) * dx + (P[1] - a[1]) * dy) / len2));
    const off = Math.hypot(P[0] - (a[0] + t * dx), P[1] - (a[1] + t * dy));
    if (off < best.off) {
      const cross = dx * (P[1] - a[1]) - dy * (P[0] - a[0]); // > 0: turning left from the direction of travel
      best = { off, m: path[k].m + t * (path[k + 1].m - path[k].m), side: cross > 0 ? "left" : "right" };
    }
  }
  return best;
}

/** When the train passes a point `m` metres along: {at, prev, after} (clock minutes, the last
 * stop before it, minutes since leaving that stop). Steady speed between neighbouring stations. */
export function passing(path, m) {
  for (let k = 0; k < path.length - 1; k++) {
    const a = path[k], b = path[k + 1];
    if (m >= a.m && m <= b.m) {
      const at = a.dep + (b.arr - a.dep) * ((m - a.m) / ((b.m - a.m) || 1));
      const prev = path.slice(0, k + 1).findLast((s) => s.halt);
      return { at, prev, after: at - prev.dep };
    }
  }
  return null;
}

/** Rough light in India over the year (sunrise about 05:00–07:10, sunset 17:00–19:20). */
export function light(min) {
  const t = ((min % 1440) + 1440) % 1440;
  if (t >= 435 && t <= 1035) return "day";
  if (t < 300 || t > 1170) return "dark";
  return "twilight";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function inSeason(season, month = new Date().getMonth()) {
  const m = season.match(/^([A-Z][a-z]{2})\s*[–-]\s*([A-Z][a-z]{2})$/);
  if (!m) return true;
  const a = MONTHS.indexOf(m[1]), b = MONTHS.indexOf(m[2]);
  return a <= b ? month >= a && month <= b : month >= a || month <= b;
}

const NOTE = {
  waterfall: "Falls on the hillside, at their best in the monsoon.",
  fort: "A hill fort or old fortification near the line.",
  peak: "A named summit you can pick out from the window.",
  cave: "Rock-cut caves or an old site in the hills.",
  dam: "A dam and its reservoir close to the line.",
  lake: "A lake or reservoir close to the line.",
  river: "The train crosses this river.",
  tunnel: "The line goes through the hill here.",
  viewpoint: "A known viewpoint near the line.",
  temple: "A well-known temple near the line.",
  landmark: "A local landmark near the line.",
};
// How far from the line each kind is still worth a look (metres).
const REACH = { waterfall: 2500, fort: 4000, peak: 5000, cave: 2000, dam: 2000, lake: 1500, viewpoint: 1000, temple: 800, landmark: 800, river: 50, tunnel: 800 };

/** Sights from the server, placed on the journey. Tunnels close together become one entry;
 * the best-scored sights are kept when there are too many. `curated` replaces the wording of
 * sights that someone has written up by hand (matched by OpenStreetMap or Wikidata id). */
export function placeSights(path, sights, curated = [], month = new Date().getMonth(), max = 60) {
  const byId = new Map(curated.flatMap((c) => [c.osm, c.wikidata].filter(Boolean).map((id) => [id, c])));
  const placed = [];
  for (const s of sights) {
    const where = locate(path, s);
    if (where.off > (REACH[s.kind] ?? 1000) || where.m <= 0 || where.m >= path.at(-1).m) continue;
    const c = byId.get(s.id) ?? (s.wikidata && byId.get(s.wikidata));
    const linear = s.kind === "river" || s.kind === "tunnel";
    placed.push({
      ...s, m: where.m, off: where.off,
      side: linear || where.off < 40 ? "both" : where.side,
      title: c?.title ?? s.name,
      note: c?.note ?? (s.desc ? s.desc[0].toUpperCase() + s.desc.slice(1) + "." : NOTE[s.kind] ?? ""),
      season: c?.season ?? (s.kind === "waterfall" ? "Jun–Sep" : "all year"),
      curated: !!c,
    });
  }
  placed.sort((a, b) => a.m - b.m);

  // Tunnels within 2 km of each other: one entry, "6 tunnels, 2.4 km in all".
  const merged = [];
  for (const s of placed) {
    const last = merged.at(-1);
    if (s.kind === "tunnel" && last?.kind === "tunnel" && s.m - last.end < 2000) {
      last.count += 1;
      last.length_m += s.length_m ?? 0;
      last.end = s.m;
      continue;
    }
    merged.push(s.kind === "tunnel" ? { ...s, count: 1, end: s.m, length_m: s.length_m ?? 0, title: s.name || "Tunnel" } : s);
  }
  for (const t of merged) {
    if (t.kind === "tunnel") {
      if (t.count > 1) t.title = `${t.count} tunnels`;
      t.note = t.count > 1 ? `About ${(t.length_m / 1000).toFixed(1)} km of tunnels close together.` : `About ${Math.round(t.length_m / 10) * 10} m long.`;
      t.score = t.count > 2 || t.length_m >= 1000 ? 4 : t.score;
    }
  }

  // Keep it readable on a long journey: everything strong, then the rest by score.
  const keep = new Set(merged.filter((s) => s.score >= 4 || s.curated));
  for (const s of [...merged].sort((a, b) => b.score - a.score)) if (keep.size < max) keep.add(s);
  return merged.filter((s) => keep.has(s)).map((s) => {
    const p = passing(path, s.m);
    return { ...s, ...p, light: light(p.at), season_now: inSeason(s.season, month) };
  });
}

/** Which side to sit: counts what can be seen today (in season, not in the dark). */
export function bestSide(sights) {
  const visible = sights.filter((s) => s.side !== "both" && s.season_now && s.light !== "dark");
  const left = visible.filter((s) => s.side === "left").length, right = visible.length - left;
  return { left, right, best: left === right ? null : left > right ? "left" : "right" };
}

/** Ask the server for the sights along a journey. Long journeys are looked up in parts, so it
 * asks again while the server says it isn't done; onPart shows what has arrived so far. */
export async function fetchSights(train, from, to, onPart) {
  const { CONFIG } = await import(/* @vite-ignore */ new URL("config.js", document.baseURI).href);
  let sights = [], waited = 0, ready = -1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(`${CONFIG.supabaseUrl}/functions/v1/journey-sights`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: CONFIG.supabaseKey },
      body: JSON.stringify({ train, from, to }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Couldn't look up the sights just now.");
    sights = body.sights;
    onPart?.(sights, body.done, body.stretches - body.missing, body.stretches);
    if (body.done) return sights;
    // Nothing new this time means OpenStreetMap is busy: wait longer before asking again.
    waited = body.stretches - body.missing > ready ? 1500 : Math.min(waited * 2 || 4000, 30000);
    ready = body.stretches - body.missing;
    await new Promise((r) => setTimeout(r, waited));
  }
  return sights;
}
