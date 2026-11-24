"""Combine data/divisions/*.json into site/data/stations.json (one record per station).

    python scraper/build.py
"""
from __future__ import annotations

import datetime as dt
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import AMENITIES, AMENITY_KEYS, FEATURES, FEATURE_KEYS, NOT_LISTED, UNKNOWN, YES  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DIVISIONS_DIR = ROOT / "data" / "divisions"
NAMES_FILE = ROOT / "data" / "station_names.json"
AMENITIES_FILE = ROOT / "data" / "amenities.json"
OUT_FILE = ROOT / "site" / "data" / "stations.json"
COORDS_FILE = ROOT / "data" / "station_coords.json"
# Every Indian Railways station (scraper/all_stations.py): stations without accessibility data
# still get a page, and every station gets coordinates for the location check where known.
ALL_FILE = ROOT / "data" / "all_stations.json"
# Phase 2 backend: the stations a visitor can report on, with coordinates for the location check.
# Published with the site; the Supabase functions fetch it (see supabase/functions/_shared/server.ts).
BACKEND_FILE = ROOT / "site" / "data" / "backend-stations.json"
# The same coordinates, small, for the home page's "Find my station's chat" (worked out in the browser).
POINTS_FILE = ROOT / "site" / "data" / "station-points.json"


def station_points(backend: dict) -> dict:
    """Station id -> [lat, lon] for every station the server can place (the ones with coordinates)."""
    return {sid: [round(s["lat"], 5), round(s["lon"], 5)] for sid, s in backend.items()
            if s.get("lat") is not None and s.get("lon") is not None}


def _key(name: str) -> str:
    return re.sub(r"[^a-z]", "", name.lower())


def load_names(path: Path = NAMES_FILE) -> tuple[dict, dict]:
    """Return (canonical -> info, lookup key -> canonical) including aliases."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    canon = {k: v for k, v in raw.items() if not k.startswith("_")}
    lookup = {}
    for name, info in canon.items():
        lookup[_key(name)] = name
        for alias in info.get("aliases", []):
            lookup[_key(alias)] = name
    return canon, lookup


def canonical(name: str, lookup: dict) -> str:
    return lookup.get(_key(name), name.strip())


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def build_division(div: dict, lookup: dict) -> dict[str, dict]:
    """Return {canonical station name: {feature_key: {status, note?}}} for one division."""
    feats = div.get("features", {})
    listed = {
        key: {canonical(s, lookup) for s in entry.get("stations", [])}
        for key, entry in feats.items()
    }
    per_station = {
        key: {canonical(s, lookup): v for s, v in entry.get("per_station", {}).items()}
        for key, entry in feats.items()
    }
    all_names = set().union(*listed.values(), *(set(p) for p in per_station.values())) if feats else set()
    all_names |= {canonical(s, lookup) for s in div.get("station_notes", {})}

    stations = {}
    for name in sorted(all_names):
        record = {}
        for key in FEATURE_KEYS:
            entry = feats.get(key)
            if entry is None:
                record[key] = {"status": UNKNOWN}
                continue
            if name in per_station[key]:  # station-layout PDFs: explicit YES / NO
                item = dict(per_station[key][name])
            elif entry.get("all_stations") or name in listed[key]:
                item = {"status": YES}
                if entry.get("note"):
                    item["note"] = entry["note"]
            elif entry.get("complete") and "per_station" not in entry:
                item = {"status": NOT_LISTED}
            else:
                item = {"status": UNKNOWN}
                if entry.get("count_note"):
                    item["note"] = entry["count_note"]
            record[key] = item
        stations[name] = record
    return stations


def load_amenities(path: Path, lookup: dict) -> list[dict]:
    """Read data/amenities.json and return its facts, checked and with sources filled in.

    Each fact: {"station", "division"?, "amenity", "note"?, "sources": [source keys], "checked"}.
    Anything that doesn't add up (unknown amenity or source, missing date) stops the build,
    so a typo can't put a mark on the wrong page.
    """
    raw = json.loads(path.read_text(encoding="utf-8"))
    sources = raw.get("sources", {})
    out = []
    for i, fact in enumerate(raw.get("facts", [])):
        where = f"{path.name} fact {i + 1} ({fact.get('station', '?')})"
        if fact.get("amenity") not in AMENITY_KEYS:
            raise ValueError(f"{where}: unknown amenity {fact.get('amenity')!r}")
        if not fact.get("sources"):
            raise ValueError(f"{where}: no source")
        missing = [k for k in fact["sources"] if k not in sources]
        if missing:
            raise ValueError(f"{where}: unknown source {missing}")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fact.get("checked", "")):
            raise ValueError(f"{where}: 'checked' must be a date like 2026-11-17")
        out.append({
            "station": canonical(fact["station"], lookup),
            "division": fact.get("division"),
            "amenity": fact["amenity"],
            "item": {
                "status": YES,
                **({"note": fact["note"]} if fact.get("note") else {}),
                "sources": [{"title": sources[k]["title"], "url": sources[k]["url"]} for k in fact["sources"]],
                "checked": fact["checked"],
            },
        })
    return out


def apply_amenities(stations: list[dict], facts: list[dict]) -> None:
    """Add each fact to its station's "amenities". The station must already be on the site."""
    for fact in facts:
        matches = [s for s in stations if s["name"] == fact["station"]
                   and (not fact["division"] or s["division"] == fact["division"])]
        if len(matches) != 1:
            problem = "is not on the site" if not matches else "is in more than one division; add \"division\""
            raise ValueError(f"amenities: {fact['station']} {problem}")
        matches[0].setdefault("amenities", {})[fact["amenity"]] = fact["item"]


# Spellings that differ between sources: Mahalaxmi/Mahalakshmi, Bandra/Baandra, Wadi/Vadi.
SUFFIXES = re.compile(r"\b(junction|jn|halt|ph|terminus|term|cantonment|cantt|cant)\b")


def soft(name: str) -> str:
    k = _key(SUFFIXES.sub("", name.lower()))
    for a, b in (("ksh", "x"), ("w", "v"), ("aa", "a"), ("ee", "i"), ("oo", "u"), ("ph", "f")):
        k = k.replace(a, b)
    return re.sub(r"(.)\1+", r"\1", k)


def load_all(path: Path = ALL_FILE) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _km(a, b) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def add_all_stations(stations: list[dict], every: dict, near_km: float = 3, division_km: float = 300) -> int:
    """Join the open all-India list to the stations with facility data, then add the rest as
    basic pages (no facility data). Returns how many were added.

    The open list often has the same station twice (a goods yard code, a code since renamed) and
    the same name in different states. A station there with a name matching one of ours is the
    same station when it is within `near_km` of it, or, for ours without coordinates, within
    `division_km` of the middle of its division (or has no coordinates and the same zone). It
    then lends its code (when ours has none) or its coordinates (`alt_codes`), and isn't added."""
    used = {s["code"] for s in stations if s["code"]}
    by_soft: dict[str, list[str]] = {}
    for code, (name, *_rest) in every.items():
        by_soft.setdefault(soft(name), []).append(code)
    pos = lambda c: tuple(every[c][3:5]) if c in every and every[c][3] is not None else None  # noqa: E731
    spots: dict[str, list] = {}
    for st in stations:
        if st["code"] and pos(st["code"]):
            spots.setdefault(st["division"], []).append(pos(st["code"]))
    middle = {d: (sum(p[0] for p in ps) / len(ps), sum(p[1] for p in ps) / len(ps)) for d, ps in spots.items()}

    claimed: set[str] = set()
    for st in stations:
        home = pos(st["code"]) if st["code"] else None
        anchor, reach = (home, near_km) if home else (middle.get(st["division"]), division_km)
        names = {soft(n) for n in [st["name"], *st["aliases"]]}
        cands = [c for n in names for c in by_soft.get(n, []) if c not in used and c not in claimed]
        same = [c for c in cands if (pos(c) and anchor and _km(pos(c), anchor) <= reach)
                or (not pos(c) and every[c][2] == st["zone"])]
        if not same:
            continue
        placed = sorted((c for c in same if pos(c)), key=lambda c: _km(pos(c), anchor))
        if not home and placed:
            best = placed[0]
            if st["code"]:
                st["alt_codes"] = [best]  # ours has a code the open list doesn't know: borrow the place
            else:
                st["code"] = best
                used.add(best)
            same = [c for c in same if not pos(c) or _km(pos(c), pos(best)) <= near_km]
        elif not st["code"]:
            st["code"] = same[0]
            used.add(same[0])
        claimed.update(same)

    ids = {s["id"] for s in stations}
    added = 0
    for code, (name, state, zone, _lat, _lon) in every.items():
        if code in used or code in claimed:
            continue
        sid = slug(name) if slug(name) not in ids else slug(f"{name} {code}")
        ids.add(sid)
        stations.append({"id": sid, "name": name, "code": code, "aliases": [], "division": "",
                         "zone": zone or "", **({"state": state} if state else {}), "features": {}, "basic": True})
        added += 1
    return added


def build(divisions_dir: Path = DIVISIONS_DIR, names_file: Path = NAMES_FILE,
          amenities_file: Path = AMENITIES_FILE, all_file: Path = ALL_FILE) -> dict:
    canon, lookup = load_names(names_file)
    out_divisions, out_stations = [], []
    seen_ids: set[str] = set()
    for path in sorted(divisions_dir.glob("*.json")):
        div = json.loads(path.read_text(encoding="utf-8"))
        out_divisions.append({k: div.get(k) for k in
                              ("division", "zone", "source_title", "source_url",
                               "retrieved", "method", "method_note", "sources")})
        codes = {canonical(n, lookup): c for n, c in div.get("station_codes", {}).items()}
        notes = {canonical(n, lookup): t for n, t in div.get("station_notes", {}).items()}
        own_sources = {canonical(n, lookup): u for n, u in div.get("station_sources", {}).items()}
        for name, features in build_division(div, lookup).items():
            info = canon.get(name, {})
            code = info.get("code") or codes.get(name, "")
            # the same name in two divisions (Madhavnagar: Pune and Jabalpur) needs two pages
            sid = slug(name) if slug(name) not in seen_ids else slug(f"{name} {code or div['division']}")
            seen_ids.add(sid)
            out_stations.append({
                "id": sid,
                "name": name,
                "code": code,
                "aliases": info.get("aliases", []),
                **({"notes": notes[name]} if name in notes else {}),
                **({"sources": own_sources[name]} if name in own_sources else {}),
                "division": div["division"],
                "zone": div["zone"],
                "features": features,
            })
    if amenities_file.exists():
        apply_amenities(out_stations, load_amenities(amenities_file, lookup))
    add_all_stations(out_stations, load_all(all_file))
    out_stations.sort(key=lambda s: (s["name"], s["id"]))
    return {
        "generated": dt.date.today().isoformat(),
        "features": [{"key": f["key"], "label": f["label"]} for f in FEATURES],
        "amenities": [{"key": a["key"], "label": a["label"], "about": a["about"]} for a in AMENITIES],
        "divisions": out_divisions,
        "stations": out_stations,
    }


def backend_stations(data: dict) -> dict:
    coords = {c: [v[3], v[4]] for c, v in load_all().items() if v[3] is not None}
    # hand-checked coordinates win over the open list's
    coords.update({k: v for k, v in json.loads(COORDS_FILE.read_text(encoding="utf-8")).items() if not k.startswith("_")})
    out = {}
    for s in data["stations"]:
        item = {"name": s["name"], "code": s["code"], "division": s["division"], "aliases": s["aliases"],
                # features the official data already confirms: a visitor video adds nothing there
                "official_yes": sorted(k for k, f in s["features"].items() if f["status"] == YES)}
        where = next((coords[c] for c in [s["code"], *s.get("alt_codes", [])] if c in coords), None)
        if where:
            item["lat"], item["lon"] = where
        out[s["id"]] = item
    return out


def main() -> int:
    data = build()
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    BACKEND_FILE.parent.mkdir(parents=True, exist_ok=True)
    backend = backend_stations(data)
    BACKEND_FILE.write_text(json.dumps(backend, ensure_ascii=False) + "\n", encoding="utf-8")
    POINTS_FILE.write_text(json.dumps(station_points(backend), separators=(",", ":")) + "\n", encoding="utf-8")
    detailed = sum(1 for s in data["stations"] if not s.get("basic"))
    print(f"Wrote {OUT_FILE.relative_to(ROOT)}: {len(data['stations'])} stations, {detailed} with facility data "
          f"from {len(data['divisions'])} division(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
