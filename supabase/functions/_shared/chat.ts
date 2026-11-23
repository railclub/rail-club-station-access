// Station Chat rules that don't need the network, so they can be tested.
import { distanceM } from "./rules.ts";

export type ChatSettings = {
  enabled: boolean;
  closed_stations: string[];
  pass_minutes: number;
  max_accuracy_m: number;
};

// Faster than any train in India, with room for GPS error: a pass at one station and then
// another this far away this soon means a faked location.
export const MAX_KMH = 250;
export const NEAR_ENOUGH_KM = 5;

/** True when moving between two stations' locations in the time between two passes is impossible. */
export function tooFast(from: { lat: number; lon: number }, to: { lat: number; lon: number },
  lastAt: Date, now: Date): boolean {
  const km = distanceM(from.lat, from.lon, to.lat, to.lon) / 1000;
  if (km <= NEAR_ENOUGH_KM) return false;
  const hours = Math.max((now.getTime() - lastAt.getTime()) / 3_600_000, 1 / 60);
  return km / hours > MAX_KMH;
}

export type PassInput = { station_id: string; lat: number; lon: number; accuracy_m: number };

export function parsePassInput(body: unknown): PassInput | string {
  if (!body || typeof body !== "object") return "Missing request body";
  const b = body as Record<string, unknown>;
  const n = (k: string) => (typeof b[k] === "number" && Number.isFinite(b[k]) ? (b[k] as number) : NaN);
  const input = { station_id: typeof b.station_id === "string" ? b.station_id : "", lat: n("lat"), lon: n("lon"), accuracy_m: n("accuracy_m") };
  if (!/^[a-z0-9-]{1,80}$/.test(input.station_id)) return "Unknown station";
  if (!(Math.abs(input.lat) <= 90 && Math.abs(input.lon) <= 180)) return "Location missing";
  if (!(input.accuracy_m >= 0)) return "Location accuracy missing";
  return input;
}
