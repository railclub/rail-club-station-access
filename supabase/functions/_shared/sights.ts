// Journey Partner for any train: find the sights along a stretch of line in OpenStreetMap.
// Pure functions (no network) so the rules can be tested; journey-sights does the fetching.
//
// The line is drawn station to station through every station the train passes (from the
// open timetable), so it follows the real track closely on the plains and loosely in the hills.

export type Point = { code: string; lat: number; lon: number };
export type Sight = {
  id: string; // "node/123", or "river/<way id>/<n>" for a crossing
  name: string;
  kind: string;
  lat: number;
  lon: number;
  score: number; // how worth a look it is, for ordering and trimming
  wikidata?: string;
  desc?: string;
  length_m?: number;
};

/** The cache key for the line between two stations; the same both ways. */
export const segKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// A run's box may be at most this many degrees tall or wide (about 40 km), so each query is small.
const MAX_SPAN = 0.36;
// How far from the line each kind is still worth a look (metres). OpenStreetMap is asked for a
// box around the line; anything further than this from the line itself is dropped here.
export const REACH: Record<string, number> = {
  waterfall: 2500, fort: 4000, peak: 5000, cave: 2000, dam: 2000, lake: 1500,
  viewpoint: 1000, temple: 800, landmark: 800, tunnel: 800,
};

/** Runs of consecutive stations whose stretches aren't cached yet, each small enough for one
 * quick OpenStreetMap query (at most `max` stations and about 40 km across). */
export function uncachedRuns(points: Point[], cached: Set<string>, max = 15): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  const tooBig = (r: Point[]) => {
    const lats = r.map((p) => p.lat), lons = r.map((p) => p.lon);
    return Math.max(...lats) - Math.min(...lats) > MAX_SPAN || Math.max(...lons) - Math.min(...lons) > MAX_SPAN;
  };
  for (let i = 0; i < points.length - 1; i++) {
    if (cached.has(segKey(points[i].code, points[i + 1].code))) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    if (run.length >= 2 && (run.length >= max || tooBig([...run, points[i + 1]]))) {
      runs.push(run);
      run = [];
    }
    if (!run.length) run.push(points[i]);
    run.push(points[i + 1]);
  }
  if (run.length) runs.push(run);
  return runs;
}

/** The box around a run, with room for the furthest sights: [south, west, north, east]. */
export function box(run: Point[]): [number, number, number, number] {
  const pad = 0.05; // about 5 km
  const lats = run.map((p) => p.lat), lons = run.map((p) => p.lon);
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return [r(Math.min(...lats) - pad), r(Math.min(...lons) - pad), r(Math.max(...lats) + pad), r(Math.max(...lons) + pad)];
}

/** One Overpass query for everything worth seeing in the box around a run of stations.
 * A plain box is far quicker for the servers than "near this line"; distance is checked after. */
export function overpassQuery(run: Point[]): string {
  const bb = box(run).join(",");
  return `[out:json][timeout:55][bbox:${bb}];
(
nwr["waterway"="waterfall"];nwr["natural"="waterfall"];
nwr["historic"~"^(fort|castle)$"];node["natural"="peak"]["wikidata"];
nwr["natural"="cave_entrance"]["name"];nwr["historic"="archaeological_site"]["wikidata"];
nwr["tourism"="viewpoint"]["name"];nwr["waterway"="dam"]["name"];
nwr["natural"="water"]["wikidata"];nwr["historic"="monument"]["wikidata"];
nwr["tourism"="attraction"]["wikidata"];nwr["amenity"="place_of_worship"]["wikidata"];
)->.p;
.p out center tags;
(way["railway"="rail"]["tunnel"="yes"];way["waterway"="river"]["name"];)->.g;
.g out tags geom(${bb});`;
}

type Tags = Record<string, string>;

/** What a map feature is, and how worth a look. null for anything not shown. */
export function classify(tags: Tags): { kind: string; score: number } | null {
  const wd = tags.wikidata ? 1 : 0;
  if (tags.waterway === "waterfall" || tags.natural === "waterfall") return { kind: "waterfall", score: 5 + wd };
  if (tags.historic === "fort" || tags.historic === "castle") return { kind: "fort", score: 4 + wd };
  if (tags.natural === "peak") return { kind: "peak", score: 3 };
  if (tags.natural === "cave_entrance" || tags.historic === "archaeological_site") return { kind: "cave", score: 3 + wd };
  if (tags.waterway === "dam") return { kind: "dam", score: 3 + wd };
  if (tags.natural === "water") return { kind: "lake", score: 3 };
  if (tags.tourism === "viewpoint") return { kind: "viewpoint", score: 2 + wd };
  if (tags.amenity === "place_of_worship") return { kind: "temple", score: 2 };
  if (tags.historic === "monument" || tags.tourism === "attraction") return { kind: "landmark", score: 2 };
  return null;
}

// Metres east/north of a reference point; plenty accurate over a few kilometres.
const R = 6_371_000;
function xy(lat: number, lon: number, lat0: number, lon0: number): [number, number] {
  const r = Math.PI / 180;
  return [(lon - lon0) * r * R * Math.cos(lat0 * r), (lat - lat0) * r * R];
}

/** Which stretch of the run a point is nearest: [index of its first station, metres away]. */
export function nearestSegment(run: Point[], lat: number, lon: number): [number, number] {
  let best: [number, number] = [0, Infinity];
  for (let i = 0; i < run.length - 1; i++) {
    const [ax, ay] = xy(run[i].lat, run[i].lon, lat, lon);
    const [bx, by] = xy(run[i + 1].lat, run[i + 1].lon, lat, lon);
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best[1]) best = [i, d];
  }
  return best;
}

/** Where two line segments cross, as a fraction along the first, or null. */
function cross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): number | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (!den) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Points where a river's course crosses the run's line. */
export function crossings(run: Point[], river: { lat: number; lon: number }[]): { lat: number; lon: number; seg: number }[] {
  const out: { lat: number; lon: number; seg: number }[] = [];
  const lat0 = run[0].lat, lon0 = run[0].lon;
  const P = (p: { lat: number; lon: number }) => xy(p.lat, p.lon, lat0, lon0);
  for (let i = 0; i < run.length - 1; i++) {
    const a = P(run[i]), b = P(run[i + 1]);
    for (let j = 0; j < river.length - 1; j++) {
      const t = cross(a, b, P(river[j]), P(river[j + 1]));
      if (t !== null) {
        out.push({ lat: run[i].lat + t * (run[i + 1].lat - run[i].lat), lon: run[i].lon + t * (run[i + 1].lon - run[i].lon), seg: i });
      }
    }
  }
  return out;
}

type Element = {
  type: string; id: number; tags?: Tags; lat?: number; lon?: number;
  center?: { lat: number; lon: number }; geometry?: ({ lat: number; lon: number } | null)[];
};

/** A way's geometry cut to the query box has gaps (null) where it leaves the box: the unbroken pieces. */
export function pieces(g: ({ lat: number; lon: number } | null)[]): { lat: number; lon: number }[][] {
  const out: { lat: number; lon: number }[][] = [[]];
  for (const p of g) {
    if (p) out.at(-1)!.push(p);
    else if (out.at(-1)!.length) out.push([]);
  }
  return out.filter((piece) => piece.length >= 2);
}

const metres = (g: { lat: number; lon: number }[]) =>
  g.slice(1).reduce((sum, p, i) => sum + Math.hypot(...xy(p.lat, p.lon, g[i].lat, g[i].lon)), 0);

/** Turn an Overpass answer into sights, filed under the stretch of line each one belongs to.
 * Every stretch of the run gets an entry, empty or not, so it isn't asked about again. */
export function sightsByStretch(run: Point[], elements: Element[]): Map<string, Sight[]> {
  const out = new Map<string, Sight[]>();
  for (let i = 0; i < run.length - 1; i++) out.set(segKey(run[i].code, run[i + 1].code), []);
  const file = (seg: number, s: Sight) => out.get(segKey(run[seg].code, run[seg + 1].code))!.push(s);
  const seen = new Set<string>();

  for (const el of elements) {
    const tags = el.tags ?? {};
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = tags["name:en"] || tags.name || "";
    if (tags.waterway === "river" && el.geometry) {
      pieces(el.geometry).flatMap((piece) => crossings(run, piece)).forEach((c, n) =>
        file(c.seg, { id: `river/${el.id}/${n}`, name: name || "River", kind: "river", lat: round(c.lat), lon: round(c.lon), score: 4 + (tags.wikidata ? 1 : 0), ...(tags.wikidata ? { wikidata: tags.wikidata } : {}) })
      );
      continue;
    }
    if (tags.railway === "rail" && tags.tunnel === "yes" && el.geometry?.length) {
      const g = pieces(el.geometry).sort((a, b) => b.length - a.length)[0];
      if (!g) continue;
      const mid = g[Math.floor(g.length / 2)], length = Math.round(metres(g));
      const [seg, off] = nearestSegment(run, mid.lat, mid.lon);
      if (length < 60 || off > REACH.tunnel) continue;
      file(seg, { id, name: tags["tunnel:name"] || "", kind: "tunnel", lat: round(mid.lat), lon: round(mid.lon), score: length >= 500 ? 3 : 2, length_m: length });
      continue;
    }
    const what = classify(tags);
    const at = el.center ?? (el.lat !== undefined ? { lat: el.lat, lon: el.lon! } : null);
    if (!what || !at) continue;
    if (!name && what.kind !== "waterfall") continue;
    const [seg, off] = nearestSegment(run, at.lat, at.lon);
    if (off > REACH[what.kind]) continue;
    file(seg, {
      id, name: name || "Waterfall", kind: what.kind, lat: round(at.lat), lon: round(at.lon), score: what.score,
      ...(tags.wikidata ? { wikidata: tags.wikidata } : {}),
    });
  }
  return out;
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;
