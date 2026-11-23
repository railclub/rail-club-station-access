import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { parsePassInput, tooFast } from "../_shared/chat.ts";

const SANTACRUZ = { lat: 19.08202, lon: 72.84134 }, VILE_PARLE = { lat: 19.09958, lon: 72.84368 };
const PUNE = { lat: 18.5289, lon: 73.8744 }, DELHI = { lat: 28.6427, lon: 77.2207 };

Deno.test("station chat: a location that moves faster than a train is refused", () => {
  const t0 = new Date("2026-11-23T08:00:00Z");
  const after = (min: number) => new Date(t0.getTime() + min * 60_000);
  assert(!tooFast(SANTACRUZ, VILE_PARLE, t0, after(1)));   // neighbours: always fine
  assert(!tooFast(SANTACRUZ, PUNE, t0, after(200)));      // about 120 km in over 3 hours: a train
  assert(tooFast(SANTACRUZ, PUNE, t0, after(10)));        // 120 km in 10 minutes: no
  assert(tooFast(SANTACRUZ, DELHI, t0, after(120)));      // 1,150 km in 2 hours: no
  assert(!tooFast(SANTACRUZ, DELHI, t0, after(24 * 60))); // a day later: fine
});

Deno.test("station chat: pass request is checked", () => {
  assertEquals(parsePassInput(null), "Missing request body");
  assertEquals(parsePassInput({ station_id: "Santa Cruz!", lat: 19, lon: 72, accuracy_m: 10 }), "Unknown station");
  assertEquals(parsePassInput({ station_id: "santa-cruz", lat: "19", lon: 72, accuracy_m: 10 }), "Location missing");
  assertEquals(parsePassInput({ station_id: "santa-cruz", lat: 19, lon: 72 }), "Location accuracy missing");
  assertEquals(parsePassInput({ station_id: "santa-cruz", lat: 19.08, lon: 72.84, accuracy_m: 12 }),
    { station_id: "santa-cruz", lat: 19.08, lon: 72.84, accuracy_m: 12 });
});
