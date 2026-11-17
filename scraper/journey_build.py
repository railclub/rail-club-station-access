"""Journey Partner, steps 2 and 4: build the pilot route and its list of sight candidates.

Reads the raw map data that scraper/journey_fetch.py saved in data/journey/raw/ and writes,
under data/journey/<route>/:
  route.json       the track as a path with distance markers, and every station on it
  candidates.json  places near the track with distance along the route, distance from the
                   track and LEFT/RIGHT side. These are candidates only: a person prunes them
                   to what can really be seen from a train (step 4 of docs/journey-partner-plan.md).

Map data © OpenStreetMap contributors (ODbL); place data and photos from Wikidata (CC0).
Usage: python3 scraper/journey_build.py
"""
import gzip
import json
import pathlib
import re
import sys

from journey_geo import daylight, distance_m, locate, passing_time, route_path, timed_stops

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "journey" / "raw"

# The stops pin the route to the right line (via Kalyan and the Bhor Ghat, not via Panvel).
# Codes are looked up in data/station_coords.json; the two with coordinates aren't in that list.
PILOT = {
    "id": "csmt-pune",
    "name": "Mumbai CSMT → Pune",
    "stops": [("CSMT", 18.9398, 72.8355), "BY", "DR", "CLA", "GC", "TNA", ("DI", 19.2184, 73.0867), "KYN",
              "ULNR", "BUD", "VGI", "NRL", "BVS", "KJT", "KAD", "LNL", "MVL", "KMST", "VDN", "TGN", "DEHR",
              "AKRD", "CCH", "PMP", "KK", "SVJR", "PUNE"],
    # Stretches where trains run slower than elsewhere: (from, to, how many times slower).
    # In the 2016 timetable trains average 34 km/h up the Bhor Ghat and 63 km/h on the plains.
    "slow": [("KJT", "LNL", 1.9)],
}

# kind: how far from the track (metres) a place of that kind is still worth a person's look.
REACH = {"waterfall": 2000, "fort": 6000, "peak": 5000, "cave": 3000, "dam": 2000, "lake": 1500,
         "river": 300, "viewpoint": 1200, "landmark": 1200, "temple": 800}
NOT_A_SIGHT = re.compile(r"\b(hotel|oyo|resort|stay|villa|bank|branch|school|college|hospital|fuel|filling|"
                         r"road|station|society|apartment|restaurant|mall|office|stadium)\b", re.I)
WIKIDATA_KINDS = [("waterfall", r"waterfall|\bfalls\b"), ("fort", r"\bfort\b|\bcastle\b"),
                  ("cave", r"\bcaves?\b"), ("dam", r"\bdam\b"), ("lake", r"\blake\b|reservoir"),
                  ("peak", r"\bpeak\b|\bhill\b|mountain pass|pinnacle"), ("river", r"\briver\b|\bcreek\b"),
                  ("landmark", r"viaduct|\bbridge\b|monument|palace|hill station"), ("temple", r"\btemple\b")]


def load(name):
    with gzip.open(RAW / f"{name}.json.gz") as f:
        return json.load(f)


def osm_kind(tags):
    if tags.get("waterway") == "waterfall" or tags.get("natural") == "waterfall":
        return "waterfall"
    if tags.get("historic") in ("fort", "castle"):
        return "fort"
    if tags.get("natural") == "peak":
        return "peak"
    if tags.get("natural") == "cave_entrance" or tags.get("historic") == "archaeological_site":
        return "cave"
    if tags.get("waterway") == "dam":
        return "dam"
    if tags.get("natural") == "water":
        return "lake"
    if tags.get("waterway") == "river":
        return "river"
    if tags.get("tourism") == "viewpoint":
        return "viewpoint"
    if tags.get("amenity") == "place_of_worship":
        return "temple"
    if tags.get("tourism") == "attraction" or tags.get("historic") in ("monument", "ruins"):
        return "landmark"
    return None


def places():
    """Every candidate place from both sources as {name, kind, lat, lon, wikidata, photo, osm}."""
    out = []
    for e in load("sights")["elements"]:
        tags = e.get("tags", {})
        kind, name = osm_kind(tags), tags.get("name:en") or tags.get("name")
        lat, lon = (e.get("lat"), e.get("lon")) if "lat" in e else (e.get("center", {}).get("lat"), e.get("center", {}).get("lon"))
        if not kind or lat is None or (not name and kind != "waterfall"):
            continue
        out.append({"name": name or "Waterfall (unnamed)", "kind": kind, "lat": lat, "lon": lon,
                    "wikidata": tags.get("wikidata"), "osm": f"{e['type']}/{e['id']}"})
    seen = {}
    for f in sorted(RAW.glob("wikidata_*.json.gz")):
        with gzip.open(f) as fh:
            for b in json.load(fh)["results"]["bindings"]:
                q = b["item"]["value"].rsplit("/", 1)[1]
                item = seen.setdefault(q, {"wikidata": q})
                for key in ("label", "desc", "coord", "image"):
                    if key in b:
                        item[key] = b[key]["value"]
    for item in seen.values():
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", item.get("coord", ""))
        text = f"{item.get('label', '')} | {item.get('desc', '')}"
        if not m or "label" not in item or NOT_A_SIGHT.search(text):
            continue
        kind = next((k for k, pattern in WIKIDATA_KINDS if re.search(pattern, text, re.I)), None)
        if kind:
            out.append({"name": item["label"], "kind": kind, "lat": float(m[2]), "lon": float(m[1]),
                        "wikidata": item["wikidata"], "photo": item.get("image")})
    return out


def merge(found):
    """One entry per place: the two sources often list the same fort or waterfall."""
    merged = []
    for p in sorted(found, key=lambda p: (p.get("osm") is None, p["name"])):  # OpenStreetMap first: better positions
        for q in merged:
            same_id = p.get("wikidata") and p.get("wikidata") == q.get("wikidata")
            same_name = p["name"].casefold() == q["name"].casefold() and distance_m(p["lat"], p["lon"], q["lat"], q["lon"]) < 800
            if same_id or same_name:
                for key in ("wikidata", "photo", "osm"):
                    if p.get(key) and not q.get(key):
                        q[key] = p[key]
                break
        else:
            merged.append({k: v for k, v in p.items() if v})
    return merged


def on_route(path, tracks, tag):
    """Tunnels or bridges the route itself goes through: [(name, start_m, length_m)], merged when
    the map splits one structure into several pieces."""
    where = {(lat, lon): m for lat, lon, m in path}
    runs = []
    for way in tracks:
        tags = way.get("tags", {})
        if tags.get(tag) in (None, "no"):
            continue
        hits = sorted(where[(g["lat"], g["lon"])] for g in way.get("geometry", []) if (g["lat"], g["lon"]) in where)
        if len(hits) >= 2:
            runs.append([hits[0], hits[-1], tags.get(f"{tag}:name") or tags.get("name") or ""])
    runs.sort()
    joined = []
    for start, end, name in runs:
        if joined and start - joined[-1][1] < 30 and (not name or not joined[-1][2] or name == joined[-1][2]):
            joined[-1][1] = max(joined[-1][1], end)
            joined[-1][2] = joined[-1][2] or name
        else:
            joined.append([start, end, name])
    return [(name, start, end - start) for start, end, name in joined]


def build(pilot=PILOT):
    coords = json.loads((ROOT / "data" / "station_coords.json").read_text())
    stops = [s if isinstance(s, tuple) else (s, *coords[s]) for s in pilot["stops"]]
    tracks = load("tracks")["elements"]
    path, marks = route_path(tracks, stops)

    # Stations with a code only: the map also has uncoded duplicates ("Akurdi Railway Station").
    stations, codes = [], set()
    for e in load("stations")["elements"]:
        tags = e.get("tags", {})
        lat, lon = (e["lat"], e["lon"]) if "lat" in e else (e["center"]["lat"], e["center"]["lon"])
        name, code = tags.get("name:en") or tags.get("name"), tags.get("ref", "")
        if not name or not code or code in codes or tags.get("station") in ("subway", "monorail", "light_rail"):
            continue
        m, off, _ = locate(path, lat, lon)
        if off <= 250:
            codes.add(code)
            stations.append({"name": name, "code": code, "m": round(m)})
    by_code = {e["tags"]["ref"]: e["tags"].get("name:en") or e["tags"].get("name")
               for e in load("stations")["elements"] if e.get("tags", {}).get("ref")}
    for (code, lat, lon), (_, m) in zip(stops, marks):  # the route's own stops are always listed
        if code not in codes:
            stations.append({"name": by_code.get(code, code), "code": code, "m": round(m)})
    stations.sort(key=lambda s: s["m"])

    def between(m):
        before = [s["name"] for s in stations if s["m"] <= m]
        after = [s["name"] for s in stations if s["m"] > m]
        return (before[-1] if before else stations[0]["name"]), (after[0] if after else stations[-1]["name"])

    candidates = []
    for p in merge(places()):
        m, off, side = locate(path, p["lat"], p["lon"])
        if off > REACH[p["kind"]] or m <= 0 or m >= path[-1][2]:
            continue
        after, before = between(m)
        candidates.append({**p, "lat": round(p["lat"], 5), "lon": round(p["lon"], 5), "m": round(m),
                           "off_m": round(off), "side": "both" if off < 40 else side,
                           "after": after, "before": before})
    for kind, tag in (("tunnel", "tunnel"), ("bridge", "bridge")):
        for name, start, length in on_route(path, tracks, tag):
            if kind == "tunnel" or length >= 150:  # every tunnel; only the long bridges
                after, before = between(start)
                candidates.append({"name": name or f"{kind.title()} ({round(length)} m)", "kind": kind, "m": round(start),
                                   "length_m": round(length), "off_m": 0, "side": "both", "after": after, "before": before})
    candidates.sort(key=lambda c: c["m"])

    route = {"id": pilot["id"], "name": pilot["name"], "length_m": round(path[-1][2]),
             "credit": "Track and stations © OpenStreetMap contributors (ODbL)",
             "slow": [[next(x["m"] for x in stations if x["code"] == a), next(x["m"] for x in stations if x["code"] == b), f]
                      for a, b, f in pilot.get("slow", [])],
             "stations": stations, "path": [[round(lat, 5), round(lon, 5), round(m)] for lat, lon, m in path]}
    return route, candidates


def resolve_picks(picks, candidates):
    """Place the hand-picked sights (picks.json) using their candidate's position. Raises
    ValueError naming any pick that matches no candidate, so a typo can't silently drop one."""
    out = []
    for pick in picks:
        if "id" in pick:
            found = [c for c in candidates if pick["id"] in (c.get("osm"), c.get("wikidata"))]
        else:
            found = [c for c in candidates if c["kind"] == pick["kind"] and abs(c["m"] / 1000 - pick["km"]) < 0.15]
        if len(found) != 1:
            raise ValueError(f"Pick {pick['title']!r} matches {len(found)} candidates")
        c = found[0]
        sight = {"title": pick["title"], "kind": pick["kind"], "m": c["m"], "side": c["side"],
                 "off_m": c["off_m"], "season": pick["season"], "note": pick["note"],
                 "checked": pick.get("checked", "map")}
        for key in ("lat", "lon", "photo", "wikidata", "osm"):
            if c.get(key):
                sight[key] = c[key]
        out.append(sight)
    return sorted(out, key=lambda s: s["m"])


def hhmm(minute):
    return f"{int(minute) // 60 % 24:02d}:{int(minute) % 60:02d}"


def train_view(train, route, candidates):
    """One train's journey: its stops on the clock, and when it passes each candidate.
    Raises ValueError if the timetable doesn't fit the route."""
    names = {s["code"]: s["name"] for s in route["stations"]}
    timed = timed_stops(train["stops"], {s["code"]: s["m"] for s in route["stations"]})
    passes = []
    for c in candidates:
        when = passing_time(c["m"], timed, route.get("slow", ()))
        if when:
            minute, i, after = when
            passes.append({"name": c["name"], "kind": c["kind"], "side": c["side"], "m": c["m"], "time": hhmm(minute),
                           "after_stop": names[timed[i][0]], "after_min": round(after), "light": daylight(minute)})
    return {"number": train["number"], "name": train["name"],
            "stops": [{"code": code, "name": names[code], "m": m, "arr": hhmm(arr), "dep": hhmm(dep)}
                      for code, m, arr, dep in timed],
            "passes": passes}


def main():
    route, candidates = build()
    out = ROOT / "data" / "journey" / route["id"]
    out.mkdir(parents=True, exist_ok=True)
    (out / "route.json").write_text(json.dumps(route, ensure_ascii=False, separators=(",", ":")) + "\n")
    (out / "candidates.json").write_text(json.dumps(candidates, ensure_ascii=False, indent=1) + "\n")
    kinds = {}
    for c in candidates:
        kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
    print(f"{route['name']}: {route['length_m'] / 1000:.1f} km, {len(route['path'])} points, "
          f"{len(route['stations'])} stations, {len(candidates)} candidates {kinds}")

    picks = json.loads((out / "picks.json").read_text())["picks"]
    try:
        sights = resolve_picks(picks, candidates)
    except ValueError as e:
        raise SystemExit(f"picks.json: {e}")
    (out / "sights.json").write_text(json.dumps(sights, ensure_ascii=False, indent=1) + "\n")
    print(f"  {len(sights)} sights picked: " + ", ".join(
        f"{n} {k}" for k, n in sorted({s['kind']: sum(x['kind'] == s['kind'] for x in sights) for s in sights}.items())))

    # Timetables: the open-data feed, with hand-made fixes replacing a train of the same number.
    fixes = json.loads((out / "timetable-fixes.json").read_text())
    feed = json.loads((out / "timetables.json").read_text())
    fixed = {t["number"]: t for t in fixes["trains"]}
    trains = [fixed.pop(t["number"], t) for t in feed["trains"]] + list(fixed.values())
    for train in trains:  # numbers that changed since the feed was made
        train["number"] = fixes.get("renumbered", {}).get(train["number"], train["number"])
    views = []
    for train in sorted(trains, key=lambda t: t["number"]):
        try:
            view = train_view(train, route, candidates)
        except ValueError as e:
            raise SystemExit(f"Timetable for {train.get('number')} {train.get('name')}: {e}")
        views.append({"number": view["number"], "name": view["name"], "stops": view["stops"],
                      "source": train.get("source", feed["source"])})
    (out / "trains.json").write_text(json.dumps(views, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"  {len(views)} trains with timetables ({len(fixes['trains'])} fixed by hand)")


def preview(number):
    """Print what one train passes, for checking by eye: python3 scraper/journey_build.py 11007"""
    out = ROOT / "data" / "journey" / PILOT["id"]
    route = json.loads((out / "route.json").read_text())
    candidates = [{**s, "name": s["title"]} for s in json.loads((out / "sights.json").read_text())]
    train = next(t for t in json.loads((out / "trains.json").read_text()) if t["number"] == number)
    stops = [{"code": s["code"], "arr": s["arr"], "dep": s["dep"]} for s in train["stops"]]
    view = train_view({**train, "stops": stops}, route, candidates)
    print(f"{view['number']} {view['name']}: " + ", ".join(f"{s['name']} {s['dep']}" for s in view["stops"]))
    for p in view["passes"]:
        print(f"  {p['time']}  {p['side']:5}  {p['kind']:9} {p['name'][:36]:36} {p['after_min']:3} min after {p['after_stop']} ({p['light']})")


if __name__ == "__main__":
    preview(sys.argv[1]) if len(sys.argv) > 1 else main()
