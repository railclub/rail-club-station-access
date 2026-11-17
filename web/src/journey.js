// Journey Partner maths for the browser. Mirrors scraper/journey_geo.py (timed_stops, effort,
// passing_time, daylight), which is where the tests live; keep the two in step.

export const clock = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min) % 60).padStart(2, "0")}`;

/** A train's stops between `from` and `to` on one clock: [{code, name, m, arr, dep}] in minutes
 * from the midnight before departure, so a journey past midnight keeps counting up. */
export function timed(route, train, from, to) {
  const byCode = Object.fromEntries(route.stations.map((s) => [s.code, s]));
  const out = [];
  let last = -1;
  const next = (t) => {
    if (!t) return null;
    let v = clock(t);
    while (v < last) v += 1440;
    last = v;
    return v;
  };
  for (const [code, arr, dep] of train.stops) {
    const a = next(arr), d = next(dep);
    out.push({ code, name: byCode[code]?.name ?? code, m: byCode[code]?.m ?? 0, arr: a ?? d, dep: d ?? a });
  }
  const i = out.findIndex((s) => s.code === from), j = out.findIndex((s) => s.code === to);
  return i >= 0 && j > i ? out.slice(i, j + 1) : [];
}

const effort = (m, slow) => m + slow.reduce((sum, [a, b, f]) => sum + (f - 1) * Math.max(0, Math.min(m, b) - a), 0);

/** When the train passes a point: {at, after, prev} (clock minutes, minutes since the last stop,
 * that stop), or null outside the journey. Steady speed between stops, slower on `slow` stretches. */
export function passing(m, stops, slow) {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (a.m <= m && m <= b.m) {
      const share = (effort(m, slow) - effort(a.m, slow)) / (effort(b.m, slow) - effort(a.m, slow) || 1);
      const after = (b.arr - a.dep) * share;
      return { at: a.dep + after, after, prev: a };
    }
  }
  return null;
}

/** Rough light in western India over the year (sunrise 06:00–07:10, sunset 18:00–19:20). */
export function light(min) {
  const t = ((min % 1440) + 1440) % 1440;
  if (t >= 435 && t <= 1065) return "day";
  if (t < 345 || t > 1170) return "dark";
  return "twilight";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Whether a season like "Jun–Sep" includes the given month (0-11). "all year" always does. */
export function inSeason(season, month = new Date().getMonth()) {
  const m = season.match(/^([A-Z][a-z]{2})\s*[–-]\s*([A-Z][a-z]{2})$/);
  if (!m) return true;
  const a = MONTHS.indexOf(m[1]), b = MONTHS.indexOf(m[2]);
  return a <= b ? month >= a && month <= b : month >= a || month <= b;
}

/** Everything the page shows for one journey. */
export function plan(route, train, from, to, month) {
  const stops = timed(route, train, from, to);
  if (!stops.length) return null;
  const sights = [];
  for (const s of route.sights) {
    const p = passing(s.m, stops, route.slow);
    if (p) sights.push({ ...s, ...p, light: light(p.at), season_now: inSeason(s.season, month) });
  }
  const visible = sights.filter((s) => s.side !== "both" && s.season_now && s.light !== "dark");
  const left = visible.filter((s) => s.side === "left").length, right = visible.length - left;
  return { stops, sights, left, right, best: left === right ? null : left > right ? "left" : "right" };
}
