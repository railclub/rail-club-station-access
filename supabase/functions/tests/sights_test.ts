// deno test supabase/functions/tests/
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { box, classify, pieces, crossings, nearestSegment, overpassQuery, segKey, sightsByStretch, uncachedRuns } from "../_shared/sights.ts";

// Three stations on a line heading north, then east.
const A = { code: "AAA", lat: 18.0, lon: 73.0 }, B = { code: "BBB", lat: 18.1, lon: 73.0 }, C = { code: "CCC", lat: 18.1, lon: 73.1 };

Deno.test("stretch keys are the same in both directions", () => {
  assertEquals(segKey("PUNE", "CSMT"), "CSMT|PUNE");
  assertEquals(segKey("CSMT", "PUNE"), "CSMT|PUNE");
});

Deno.test("only stretches not looked up yet are queried, in runs", () => {
  const D = { code: "DDD", lat: 18.2, lon: 73.1 };
  assertEquals(uncachedRuns([A, B, C, D], new Set()).map((r) => r.map((p) => p.code)), [["AAA", "BBB", "CCC", "DDD"]]);
  assertEquals(uncachedRuns([A, B, C, D], new Set([segKey("BBB", "CCC")])).map((r) => r.map((p) => p.code)), [["AAA", "BBB"], ["CCC", "DDD"]]);
  assertEquals(uncachedRuns([A, B, C, D], new Set(["AAA|BBB", "BBB|CCC", "CCC|DDD"])), []);
  assertEquals(uncachedRuns([A, B, C, D], new Set(), 3).map((r) => r.map((p) => p.code)), [["AAA", "BBB", "CCC"], ["CCC", "DDD"]]); // capped runs share their end station
});

Deno.test("the query asks for a padded box around the line, and long runs are split", () => {
  assertEquals(box([A, B, C]), [17.95, 72.95, 18.15, 73.15]);
  const q = overpassQuery([A, B]);
  assert(q.includes("[bbox:17.95,72.95,18.15,73.05]"));
  assert(q.includes(".g out tags geom(17.95,72.95,18.15,73.05);"));
  // Stations 0.15 degrees apart heading north: a run stops before it spans more than about 40 km.
  const line = Array.from({ length: 6 }, (_, n) => ({ code: `S${n}`, lat: 18 + n * 0.15, lon: 73 }));
  assertEquals(uncachedRuns(line, new Set()).map((r) => r.map((p) => p.code)), [["S0", "S1", "S2"], ["S2", "S3", "S4"], ["S4", "S5"]]);
});

Deno.test("what counts as a sight", () => {
  assertEquals(classify({ waterway: "waterfall" }), { kind: "waterfall", score: 5 });
  assertEquals(classify({ historic: "fort", wikidata: "Q1" }), { kind: "fort", score: 5 });
  assertEquals(classify({ shop: "bakery" }), null);
});

Deno.test("nearest stretch and river crossings", () => {
  assertEquals(nearestSegment([A, B, C], 18.05, 73.001)[0], 0);
  assertEquals(nearestSegment([A, B, C], 18.101, 73.05)[0], 1);
  // A river running east-west across the first stretch at 18.05, and one that never reaches the line.
  const across = [{ lat: 18.05, lon: 72.95 }, { lat: 18.05, lon: 73.05 }];
  const beside = [{ lat: 18.05, lon: 72.95 }, { lat: 18.05, lon: 72.99 }];
  const x = crossings([A, B, C], across);
  assertEquals(x.length, 1);
  assertEquals(x[0].seg, 0);
  assert(Math.abs(x[0].lat - 18.05) < 1e-9 && Math.abs(x[0].lon - 73.0) < 1e-9);
  assertEquals(crossings([A, B, C], beside), []);
});

Deno.test("an Overpass answer is filed by stretch, with every stretch present", () => {
  const filed = sightsByStretch([A, B, C], [
    { type: "node", id: 1, lat: 18.05, lon: 73.01, tags: { waterway: "waterfall" } }, // unnamed waterfall: kept
    { type: "node", id: 2, lat: 18.11, lon: 73.05, tags: { historic: "fort", name: "Hill Fort", wikidata: "Q9" } },
    { type: "node", id: 3, lat: 18.11, lon: 73.06, tags: { natural: "peak", wikidata: "Q8" } }, // no name: dropped
    { type: "node", id: 6, lat: 18.05, lon: 73.04, tags: { amenity: "place_of_worship", name: "Far Temple", wikidata: "Q7" } }, // 4 km off: dropped
    { type: "way", id: 4, tags: { waterway: "river", name: "Big River" }, geometry: [{ lat: 18.05, lon: 72.95 }, { lat: 18.05, lon: 73.05 }] },
    { type: "way", id: 5, tags: { railway: "rail", tunnel: "yes" }, geometry: [{ lat: 18.1, lon: 73.02 }, { lat: 18.1, lon: 73.03 }] },
    { type: "node", id: 1, lat: 18.05, lon: 73.01, tags: { waterway: "waterfall" } }, // listed twice: once
  ]);
  assertEquals([...filed.keys()], ["AAA|BBB", "BBB|CCC"]);
  assertEquals(filed.get("AAA|BBB")!.map((s) => [s.id, s.kind, s.name]), [["node/1", "waterfall", "Waterfall"], ["river/4/0", "river", "Big River"]]);
  const second = filed.get("BBB|CCC")!;
  assertEquals(second.map((s) => s.kind), ["fort", "tunnel"]);
  assert(second[1].length_m! > 1000 && second[1].length_m! < 1100);
  assertEquals(sightsByStretch([A, B], []).get("AAA|BBB"), []);
});

Deno.test("ways cut at the box edge are used piece by piece", () => {
  const p = (lat: number) => ({ lat, lon: 73 });
  assertEquals(pieces([null, p(1), p(2), null, p(3), null, p(4), p(5), null]), [[p(1), p(2)], [p(4), p(5)]]);
  // A river whose middle is outside the box still counts where it crosses inside.
  const filed = sightsByStretch([A, B], [{ type: "way", id: 7, tags: { waterway: "river", name: "Cut River" },
    geometry: [{ lat: 18.05, lon: 72.95 }, { lat: 18.05, lon: 73.05 }, null, { lat: 18.5, lon: 73.5 }, { lat: 18.6, lon: 73.5 }] }]);
  assertEquals(filed.get("AAA|BBB")!.map((s) => s.name), ["Cut River"]);
});
