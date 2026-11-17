// POST /functions/v1/journey-sights   {"train": "11007", "from": "CSMT", "to": "PUNE"}
// (deploy with --no-verify-jwt: anyone may plan a journey, signed in or not)
//
// Finds the sights along a train's line in OpenStreetMap. The line is drawn through every
// station the train passes, taken from the timetable the site publishes (scraper/rail_data.py),
// never from what the browser sends. Each stretch between two stations is looked up once and
// kept in journey_segments, so popular lines cost OpenStreetMap nothing after the first visitor.
// A long journey may take more than one call: the answer says "done": false until every
// stretch has been looked up, and the page asks again.
import { adminClient, preflight, reply } from "../_shared/server.ts";
import { type Point, overpassQuery, segKey, type Sight, sightsByStretch, uncachedRuns } from "../_shared/sights.ts";

const RAIL = Deno.env.get("RAIL_URL") ?? "https://railclub.github.io/rail-club-station-access/data/rail/";
const UA = "RailClub-JourneyPartner/1.0 (railclub.support@gmail.com)";
// The main Overpass server first, then public mirrors; each answers some networks and not others.
const OVERPASS = (Deno.env.get("OVERPASS_URLS") ??
  "https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter")
  .split(",");
const KEEP_DAYS = 120;
const PER_HOUR = Number(Deno.env.get("JOURNEY_STRETCHES_PER_HOUR") ?? "3000"); // fair use of OpenStreetMap
// The function may run for 150 s; stop well before, and give each OpenStreetMap request what's left.
const BUDGET_MS = 110_000;

type Stations = Record<string, [string, number | null, number | null]>;
let stations: Stations | null = null;
const shards = new Map<string, Record<string, [string, number | null, number | null][]>>();

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return await res.json();
}

async function overpass(query: string, deadline: number): Promise<{ elements: never[] }> {
  const errors: string[] = [];
  for (const url of OVERPASS) {
    const left = deadline - Date.now();
    if (left < 8_000) break;
    try {
      // GET: overpass-api.de answers 406 to this function's POSTs but accepts the same query as a GET.
      const res = await fetch(`${url}?data=${encodeURIComponent(query)}`, {
        headers: { "accept": "application/json", "user-agent": UA },
        signal: AbortSignal.timeout(Math.min(left - 3_000, 60_000)),
      });
      if (res.ok) return await res.json();
      errors.push(`${new URL(url).host} ${res.status}`); // 429/502/504: busy, try the next server
    } catch (e) {
      errors.push(`${new URL(url).host} ${(e as Error).name}`);
    }
  }
  throw new Error(errors.join(", ") || "out of time");
}

/** English names and one-line descriptions from Wikidata, for the sights that have an id. */
async function describe(sights: Sight[]) {
  const ids = [...new Set(sights.map((s) => s.wikidata).filter((q): q is string => !!q && /^Q\d+$/.test(q)))];
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const url = "https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels|descriptions&languages=en&format=json&ids=" + ids.slice(i, i + 50).join("|");
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10_000) });
      const entities = (await res.json()).entities ?? {};
      for (const s of sights) {
        const e = s.wikidata && entities[s.wikidata];
        if (!e) continue;
        const label = e.labels?.en?.value, desc = e.descriptions?.en?.value;
        if (label && !/^[\x20-\x7e]+$/.test(s.name)) s.name = label; // prefer English over a local script
        if (desc) s.desc = desc;
      }
    } catch {
      // descriptions are a nicety; carry on without them
    }
  }
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const started = Date.now();
  const body = await req.json().catch(() => ({}));
  const { train, from, to } = body ?? {};
  if (!/^\d{5}$/.test(train ?? "") || !/^[A-Z]{1,5}$/.test(from ?? "") || !/^[A-Z]{1,5}$/.test(to ?? "")) {
    return reply(req, { error: "Send a train number and two station codes" }, 400);
  }

  try {
    stations ??= await getJson<Stations>(RAIL + "stations.json");
    const prefix = train.slice(0, 2);
    if (!shards.has(prefix)) shards.set(prefix, await getJson(RAIL + `t/${prefix}.json`));
    const rows = shards.get(prefix)![train];
    const i = rows?.findIndex((r) => r[0] === from) ?? -1;
    const j = rows?.findIndex((r, n) => n > i && r[0] === to) ?? -1;
    if (i < 0 || j < 0) return reply(req, { error: "That train doesn't run between those stations" }, 404);

    const points: Point[] = rows.slice(i, j + 1)
      .map(([code]) => ({ code, lat: stations![code]?.[1], lon: stations![code]?.[2] }))
      .filter((p): p is Point => typeof p.lat === "number" && typeof p.lon === "number");
    const keys = [...new Set(points.slice(1).map((p, n) => segKey(points[n].code, p.code)))];

    const admin = adminClient();
    const since = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
    const found = new Map<string, Sight[]>();
    for (let k = 0; k < keys.length; k += 100) {
      const { data } = await admin.from("journey_segments").select("key, sights")
        .in("key", keys.slice(k, k + 100)).gte("fetched_at", since);
      for (const row of data ?? []) found.set(row.key, row.sights as Sight[]);
    }

    let done = true;
    const runs = uncachedRuns(points, new Set(found.keys()));
    if (runs.length) {
      const { count } = await admin.from("journey_segments").select("key", { count: "exact", head: true })
        .gte("fetched_at", new Date(Date.now() - 3_600_000).toISOString());
      if ((count ?? 0) > PER_HOUR) {
        done = false; // busy hour: show what we have, the page tries again later
      } else {
        for (const run of runs) {
          let answer;
          try {
            answer = await overpass(overpassQuery(run), started + BUDGET_MS);
          } catch (e) {
            // Busy or out of time: keep what we have; the page asks again for the rest.
            console.error("journey-sights overpass", (e as Error).message);
            done = false;
            break;
          }
          const filed = sightsByStretch(run, answer.elements);
          await describe([...filed.values()].flat());
          const now = new Date().toISOString();
          await admin.from("journey_segments").upsert(
            [...filed].map(([key, sights]) => ({ key, sights, fetched_at: now })),
          );
          for (const [key, sights] of filed) found.set(key, sights);
        }
      }
    }

    const seen = new Set<string>();
    const sights = keys.flatMap((k) => found.get(k) ?? []).filter((s) => !seen.has(s.id) && seen.add(s.id));
    const missing = keys.filter((k) => !found.has(k)).length;
    return reply(req, { sights, done: done && missing === 0, stretches: keys.length, missing });
  } catch (e) {
    console.error("journey-sights", (e as Error).message);
    return reply(req, { error: "Couldn't reach OpenStreetMap just now. Please try again in a minute." }, 502);
  }
});
