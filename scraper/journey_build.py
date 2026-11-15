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

from journey_geo import distance_m, locate, route_path

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
    path, _ = route_path(tracks, stops)

    stations, names = [], set()
    for e in load("stations")["elements"]:
        tags = e.get("tags", {})
        lat, lon = (e["lat"], e["lon"]) if "lat" in e else (e["center"]["lat"], e["center"]["lon"])
        name = tags.get("name:en") or tags.get("name")
        if not name or tags.get("station") in ("subway", "monorail", "light_rail") or name in names:
            continue
        m, off, _ = locate(path, lat, lon)
        if off <= 250:
            names.add(name)
            stations.append({"name": name, "code": tags.get("ref", ""), "m": round(m)})
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
             "stations": stations, "path": [[round(lat, 5), round(lon, 5), round(m)] for lat, lon, m in path]}
    return route, candidates


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


if __name__ == "__main__":
    main()
