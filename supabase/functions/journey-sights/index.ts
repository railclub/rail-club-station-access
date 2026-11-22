// POST /functions/v1/journey-sights   {"train": "11007", "from": "CSMT", "to": "PUNE"}
// (deploy with --no-verify-jwt: anyone may plan a journey, signed in or not)
//
// Finds the sights along a train's line in OpenStreetMap. The line is drawn through every
// station the train passes, taken from the timetable the site publishes (scraper/rail_data.py),
// never from what the browser sends. Each stretch between two stations is looked up once and
// kept in journey_segments, so popular lines cost OpenStreetMap nothing after the first visitor.
// OpenStreetMap's Overpass server refuses Edge Functions but answers the database's own HTTP
// client, so the database fetches (journey_fetch) and a later call collects the answer
// (journey_result). The answer says "done": false until every stretch has been looked up, and
// the page keeps asking every few seconds, showing what has arrived so far.
//
// POST {"warm": true} with the x-cron-secret header: the warm-up job (every minute, see the
// 20261118 migration) looks up whole lines ahead of visitors, popular trains first, so most
// journeys are instant. It uses one Overpass slot at most, leaving the other for visitors.
import { adminClient, preflight, reply } from "../_shared/server.ts";
import { type Point, overpassQuery, segKey, type Sight, sightsByStretch, uncachedRuns, warmOrder } from "../_shared/sights.ts";

const RAIL = Deno.env.get("RAIL_URL") ?? "https://railclub.github.io/rail-club-station-access/data/rail/";
const UA = "RailClub-JourneyPartner/1.0 (railclub.support@gmail.com)";
const KEEP_DAYS = 120;
const PER_HOUR = Number(Deno.env.get("JOURNEY_STRETCHES_PER_HOUR") ?? "3000"); // fair use of OpenStreetMap
const IN_FLIGHT = 2; // Overpass gives each address two query slots at a time
const WAIT_MS = 100_000; // a request with no answer by then is dropped and asked again later

type Stations = Record<string, [string, number | null, number | null]>;
type Row = [string, number | null, number | null];
let stations: Stations | null = null;
let order: string[] | null = null;
const shards = new Map<string, Record<string, Row[]>>();
const WARM_TRIES = 12; // a line with no progress for this many minutes in a row is skipped

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return await res.json();
}

const runKey = (run: Point[]) => `${run[0].code}>${run.at(-1)!.code}#${run.length}`;

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

async function timetable(train: string): Promise<Row[] | undefined> {
  stations ??= await getJson<Stations>(RAIL + "stations.json");
  const prefix = train.slice(0, 2);
  if (!shards.has(prefix)) shards.set(prefix, await getJson(RAIL + `t/${prefix}.json`));
  return shards.get(prefix)![train];
}

type Admin = ReturnType<typeof adminClient>;

/** One look at a journey: what is cached, answers that have come in, and new requests for the
 * rest (at most `inFlight` running at once, all callers together). */
async function step(admin: Admin, rows: Row[], i: number, j: number, inFlight = IN_FLIGHT) {
  const points: Point[] = rows.slice(i, j + 1)
    .map(([code]) => ({ code, lat: stations![code]?.[1], lon: stations![code]?.[2] }))
    .filter((p): p is Point => typeof p.lat === "number" && typeof p.lon === "number");
  const keys = [...new Set(points.slice(1).map((p, n) => segKey(points[n].code, p.code)))];

  const since = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const found = new Map<string, Sight[]>();
  for (let k = 0; k < keys.length; k += 100) {
    const { data } = await admin.from("journey_segments").select("key, sights")
      .in("key", keys.slice(k, k + 100)).gte("fetched_at", since);
    for (const row of data ?? []) found.set(row.key, row.sights as Sight[]);
  }

  const runs = uncachedRuns(points, new Set(found.keys()));
  if (runs.length) {
    const { data: pending } = await admin.from("journey_requests").select("run_key, request_id, created_at")
      .in("run_key", runs.map(runKey));
    const asked = new Map((pending ?? []).map((p) => [p.run_key as string, p]));

    // Collect answers that have arrived.
    for (const run of runs) {
      const p = asked.get(runKey(run));
      if (!p) continue;
      const { data } = await admin.rpc("journey_result", { p_id: p.request_id });
      const r = data?.[0];
      const stale = Date.now() - Date.parse(p.created_at) > WAIT_MS;
      if (!r && !stale) continue; // still on its way
      await admin.from("journey_requests").delete().eq("run_key", p.run_key);
      asked.delete(p.run_key);
      if (!r || r.status_code !== 200 || !r.content) {
        console.error("journey-sights overpass", r ? `${r.status_code} ${r.error_msg ?? ""} ${(r.content ?? "").slice(0, 120)}` : "no answer");
        continue; // asked again below or on a later call
      }
      let answer;
      try {
        answer = JSON.parse(r.content);
      } catch {
        continue;
      }
      const filed = sightsByStretch(run, answer.elements ?? []);
      await describe([...filed.values()].flat());
      const now = new Date().toISOString();
      await admin.from("journey_segments").upsert([...filed].map(([key, sights]) => ({ key, sights, fetched_at: now })));
      for (const [key, sights] of filed) found.set(key, sights);
    }

    // Ask for more, within OpenStreetMap's limits.
    const recent = new Date(Date.now() - WAIT_MS).toISOString();
    const [{ count: flying }, { count: lastHour }] = await Promise.all([
      admin.from("journey_requests").select("run_key", { count: "exact", head: true }).gte("created_at", recent),
      admin.from("journey_segments").select("key", { count: "exact", head: true })
        .gte("fetched_at", new Date(Date.now() - 3_600_000).toISOString()),
    ]);
    let slots = (lastHour ?? 0) > PER_HOUR ? 0 : inFlight - (flying ?? 0);
    for (const run of runs) {
      if (slots <= 0) break;
      const stillNeeded = run.slice(1).some((p, n) => !found.has(segKey(run[n].code, p.code)));
      if (asked.has(runKey(run)) || !stillNeeded) continue;
      const { data: id, error } = await admin.rpc("journey_fetch", { p_query: overpassQuery(run) });
      if (error) {
        console.error("journey-sights fetch", error.message);
        break;
      }
      await admin.from("journey_requests").upsert({ run_key: runKey(run), request_id: id, run, created_at: new Date().toISOString() });
      slots--;
    }
  }

  const seen = new Set<string>();
  const sights = keys.flatMap((k) => found.get(k) ?? []).filter((s) => !seen.has(s.id) && seen.add(s.id));
  const missing = keys.filter((k) => !found.has(k)).length;
  return { sights, done: missing === 0, stretches: keys.length, missing };
}

/** The warm-up job's minute: carry on with the first train in warmOrder whose line isn't fully
 * looked up yet. Trains whose lines are already done (often thanks to other trains on the same
 * track) are ticked off on the way, for up to 20 seconds. */
async function warm(admin: Admin) {
  order ??= warmOrder((await getJson<[string, ...unknown[]][]>(RAIL + "index.json")).map((t) => t[0]));
  const { data: rows } = await admin.from("journey_warm").select("train, tries, done, missing");
  const state = new Map((rows ?? []).map((r) => [r.train as string, r]));
  const started = Date.now();
  let ticked = 0;
  for (const train of order) {
    const s = state.get(train);
    if (s?.done || (s?.tries ?? 0) >= WARM_TRIES) continue;
    if (Date.now() - started > 20_000) break;
    const tt = await timetable(train);
    if (!tt || tt.length < 2) {
      await admin.from("journey_warm").upsert({ train, tries: WARM_TRIES, done: false, missing: null, updated_at: new Date().toISOString() });
      continue;
    }
    const r = await step(admin, tt, 0, tt.length - 1, 1);
    const progressed = s?.missing == null || r.missing < s.missing;
    const tries = r.done || progressed ? 0 : (s?.tries ?? 0) + 1;
    await admin.from("journey_warm").upsert({ train, tries, done: r.done, missing: r.missing, updated_at: new Date().toISOString() });
    if (!r.done) return { train, missing: r.missing, stretches: r.stretches, ticked };
    ticked++;
  }
  return { train: null, ticked };
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const body = await req.json().catch(() => ({}));

  if (body?.warm === true) {
    const admin = adminClient();
    const { data: ok } = await admin.rpc("journey_warm_ok", { p_secret: req.headers.get("x-cron-secret") ?? "" });
    if (!ok) return reply(req, { error: "Forbidden" }, 403);
    try {
      return reply(req, await warm(admin));
    } catch (e) {
      console.error("journey-sights warm", (e as Error).message);
      return reply(req, { error: (e as Error).message }, 502);
    }
  }

  const { train, from, to } = body ?? {};
  if (!/^\d{5}$/.test(train ?? "") || !/^[A-Z]{1,5}$/.test(from ?? "") || !/^[A-Z]{1,5}$/.test(to ?? "")) {
    return reply(req, { error: "Send a train number and two station codes" }, 400);
  }

  try {
    const rows = await timetable(train);
    const i = rows?.findIndex((r) => r[0] === from) ?? -1;
    const j = rows?.findIndex((r, n) => n > i && r[0] === to) ?? -1;
    if (!rows || i < 0 || j < 0) {
      console.error("journey-sights 404", train, from, to, rows ? `${rows.length} stops` : "no timetable");
      return reply(req, { error: "That train doesn't run between those stations" }, 404);
    }
    return reply(req, await step(adminClient(), rows, i, j));
  } catch (e) {
    console.error("journey-sights", (e as Error).message);
    return reply(req, { error: "Couldn't look up the sights just now. Please try again in a minute." }, 502);
  }
});
