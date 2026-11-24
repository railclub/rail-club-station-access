// The station nearest to a location, worked out in the browser: the location is never sent anywhere.
// Uses data/station-points.json (station id → [lat, lon]), written by scraper/build.py from the same
// coordinates the server checks against (backend-stations.json). The station-pass Edge Function still
// checks the location properly when someone joins a chat.

// Station chat lets people in within radius_m (400 m) of the station, allowing for a fix of up to
// max_accuracy_m (75 m): see the settings in supabase/migrations/20261123000000_station_chat.sql.
export const CHAT_M = 475;
export const MAX_ACCURACY_M = 75;
const R = 6_371_000, rad = Math.PI / 180;
const distance = (a, b) => {
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

let points = null;
const loadPoints = () => (points ??= fetch("data/station-points.json")
  .then((r) => { if (!r.ok) throw new Error("bad"); return r.json(); })
  .catch(() => { points = null; throw new Error("Couldn't load the station list. Please check your connection and try again."); }));

/** { st, m } for the nearest station, or null. `stations` is the site's list (for names). */
export async function nearestStation(fix, stations) {
  const pts = await loadPoints();
  const byId = new Map(stations.map((s) => [s.id, s]));
  let best = null;
  for (const [id, [lat, lon]] of Object.entries(pts)) {
    const m = distance(fix, { lat, lon });
    if (!best || m < best.m) best = { id, m };
  }
  const st = best && byId.get(best.id);
  return st ? { st, m: best.m } : null;
}
