// POST /functions/v1/station-pass   {"station_id": "santa-cruz", "lat": …, "lon": …, "accuracy_m": …}
// A signed-in visitor asks to join a station's chat. Their live location is checked against the
// station with the same rules as video reports (_shared/rules.ts gateLocation); if they're there,
// they get a short pass (chat_passes) that the chat functions and the live rooms check. The page
// asks again every few minutes, so leaving the station ends the pass (it's deleted here at once).
// Only the station and the distance are kept, never the location itself. An account can join
// at most MAX_STATIONS_A_DAY different stations a day, so one faked location can't roam India.
import { gateLocation, nearestStation } from "../_shared/rules.ts";
import { type ChatSettings, parsePassInput, tooFast } from "../_shared/chat.ts";
import { adminClient, currentUser, loadLimits, loadStations, preflight, reply } from "../_shared/server.ts";

const MAX_STATIONS_A_DAY = 10;
const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  try {
    const admin = adminClient();
    const user = await currentUser(req, admin);
    if (!user) return reply(req, { error: "Please sign in" }, 401);
    const input = parsePassInput(await req.json().catch(() => null));
    if (typeof input === "string") return reply(req, { error: input }, 400);

    const { data: row } = await admin.from("settings").select("value").eq("key", "chat").single();
    const chat = row?.value as ChatSettings | undefined;
    if (!chat?.enabled) return reply(req, { error: "Station chat is switched off for now. Please try again later." }, 503);
    if (chat.closed_stations?.includes(input.station_id)) {
      return reply(req, { error: "Chat is closed at this station for now." }, 403);
    }
    const { data: who } = await admin.from("contributors").select("blocked").eq("user_id", user.id).maybeSingle();
    if (who?.blocked) return reply(req, { error: "Your account can't use station chat." }, 403);

    const stations = await loadStations();
    const station = stations[input.station_id];
    if (!station) return reply(req, { error: "Unknown station" }, 400);
    if (station.lat === undefined || station.lon === undefined) {
      return reply(req, { error: `We can't check locations at ${station.name} yet, so its chat isn't open.` }, 409);
    }
    if (input.accuracy_m > chat.max_accuracy_m) {
      return reply(req, {
        error: `Your location is too rough (±${Math.round(input.accuracy_m)} m). Step near an open platform or outside, then try again.`,
      }, 422);
    }

    const limits = { ...(await loadLimits(admin)), max_accuracy_m: chat.max_accuracy_m };
    const loc = gateLocation(input.station_id, station, input.lat, input.lon, input.accuracy_m, limits, stations);
    if (!loc.ok) {
      const other = nearestStation(stations, input.lat, input.lon, input.station_id);
      const near = other && other.distance_m <= (limits.radius_overrides_m[other.id] ?? limits.radius_m) + input.accuracy_m
        ? { id: other.id, name: other.station.name, code: other.station.code } : null;
      // they've left (or were never there): end any pass for this station now, not in 20 minutes
      await admin.from("chat_passes").delete().eq("user_id", user.id).eq("station_id", input.station_id);
      return reply(req, { error: loc.reason, nearest: near }, 403);
    }

    const now = new Date();
    const { data: last } = await admin.from("chat_passes").select("station_id, updated_at").eq("user_id", user.id).maybeSingle();
    const before = last && last.station_id !== input.station_id ? stations[last.station_id] : null;
    if (before?.lat !== undefined && before?.lon !== undefined &&
      tooFast({ lat: before.lat, lon: before.lon }, { lat: station.lat, lon: station.lon }, new Date(last!.updated_at), now)) {
      console.error("station-pass too fast", last!.station_id, "->", input.station_id);
      return reply(req, { error: "Your location changed faster than a train can travel. Please try again in a few minutes." }, 429);
    }

    const day = istDay(now);
    const { data: today } = await admin.from("chat_pass_log").select("station_id").eq("user_id", user.id).eq("day", day);
    const seen = new Set((today ?? []).map((r) => r.station_id as string));
    if (!seen.has(input.station_id) && seen.size >= MAX_STATIONS_A_DAY) {
      return reply(req, { error: "You've joined chats at a lot of stations today. Please try again tomorrow." }, 429);
    }
    if (!seen.has(input.station_id)) {
      await admin.from("chat_pass_log").upsert({ user_id: user.id, station_id: input.station_id, day }, { ignoreDuplicates: true });
    }

    const expires = new Date(now.getTime() + chat.pass_minutes * 60_000).toISOString();
    const { error } = await admin.from("chat_passes").upsert({
      user_id: user.id, station_id: input.station_id, distance_m: loc.distance_m, expires_at: expires, updated_at: now.toISOString(),
    });
    if (error) throw new Error(error.message);

    let { data: prof } = await admin.from("chat_profiles").select("nickname").eq("user_id", user.id).maybeSingle();
    if (!prof) {
      const nickname = `Traveller ${1000 + Math.floor(Math.random() * 9000)}`;
      await admin.from("chat_profiles").upsert({ user_id: user.id, nickname }, { onConflict: "user_id", ignoreDuplicates: true });
      ({ data: prof } = await admin.from("chat_profiles").select("nickname").eq("user_id", user.id).maybeSingle());
    }
    return reply(req, {
      station_id: input.station_id, name: station.name, expires_at: expires, nickname: prof?.nickname ?? "Traveller",
      renew_after_s: Math.max(60, Math.floor(chat.pass_minutes * 60 / 4)),
    });
  } catch (e) {
    console.error("station-pass", (e as Error).message);
    return reply(req, { error: "Couldn't check you in just now. Please try again." }, 502);
  }
});
