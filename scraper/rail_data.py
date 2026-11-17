"""Journey Partner for any train: turn the open Indian Railways timetable into small files the
site loads on demand.

Source: github.com/datameet/railways (CC0), gathered in 2016. Writes, under site/data/rail/:
  index.json       every train: [number, name, first station, last station]
  stations.json    {code: [name, lat, lon]} (lat/lon null when the source has none)
  t/<NN>.json      timetables for trains whose number starts with NN:
                   {number: [[code, arrive_min, depart_min], ...]} with minutes counted from
                   midnight before the journey starts (so day 2 06:00 is 1800); null at the ends.
Every station a train passes is listed, not only its stops; a row whose arrival equals its
departure is a station it runs through. Those times are the source's estimates.

CI runs this on every deploy (see .github/workflows/pages.yml); the output is not committed.
Usage: python3 scraper/rail_data.py <datameet checkout> [output folder]
"""
import collections
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RENAMED = {"CSTM": "CSMT", "KJMG": "KJRD", "BGW": "BGWI"}  # codes changed since 2016


# Abbreviations in the source's station names, spelled out (or kept as capitals) for travellers.
WORDS = {"Jn": "Junction", "Rd": "Road", "Cant": "Cantonment", "Cantt": "Cantonment", "Cst": "CSMT",
         "Csmt": "CSMT", "Ltt": "LTT", "Ph": "Halt", "P.H.": "Halt", "Bg": "BG", "Mg": "MG", "Ng": "NG"}


def tidy(name):
    """ "MUMBAI CST" -> "Mumbai CSMT", "PUNE JN" -> "Pune Junction"."""
    return " ".join(WORDS.get(w, w) for w in " ".join(name.split()).title().split())


def minutes(text, day):
    if not text or text == "None":
        return None
    h, m, _ = text.split(":")
    return (int(day or 1) - 1) * 1440 + int(h) * 60 + int(m)


def build(source: pathlib.Path, out: pathlib.Path):
    stations = {}
    for f in json.loads((source / "stations.json").read_text())["features"]:
        p, g = f["properties"], f.get("geometry") or {}
        lon, lat = (g.get("coordinates") or [None, None])[:2]
        code = RENAMED.get(p["code"], p["code"])
        stations[code] = [tidy(p.get("name") or code),
                          round(lat, 5) if lat is not None else None, round(lon, 5) if lon is not None else None]

    by_train = collections.defaultdict(list)
    for r in json.loads((source / "schedules.json").read_text()):
        by_train[r["train_number"]].append(r)

    index, shards = [], collections.defaultdict(dict)
    for number, rows in sorted(by_train.items()):
        if not (number.isdigit() and len(number) == 5) or len(rows) < 2:
            continue  # "11057-Slip": coaches that run as part of another train
        rows.sort(key=lambda r: r["id"])
        timetable, last = [], -1
        for i, r in enumerate(rows):
            code = RENAMED.get(r["station_code"], r["station_code"])
            arr = None if i == 0 else minutes(r["arrival"], r["day"])
            dep = None if i == len(rows) - 1 else minutes(r["departure"], r["day"])
            # The source sometimes leaves "day" at 1 after midnight; keep the clock going forward.
            for t in ("arr", "dep"):
                v = arr if t == "arr" else dep
                if v is not None:
                    while v < last:
                        v += 1440
                    last = v
                    arr, dep = (v, dep) if t == "arr" else (arr, v)
            timetable.append([code, arr, dep])
            stations.setdefault(code, [tidy(r.get("station_name") or code), None, None])
        shards[number[:2]][number] = timetable
        index.append([number, " ".join(rows[0]["train_name"].split()), timetable[0][0], timetable[-1][0]])

    used = {row[0] for t in shards.values() for tt in t.values() for row in tt}
    (out / "t").mkdir(parents=True, exist_ok=True)
    dump = lambda path, data: path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    dump(out / "index.json", index)
    dump(out / "stations.json", {c: v for c, v in sorted(stations.items()) if c in used})
    for prefix, trains in shards.items():
        dump(out / "t" / f"{prefix}.json", trains)
    size = sum(f.stat().st_size for f in out.rglob("*.json")) // 1024
    print(f"{len(index)} trains, {len(used)} stations, {len(shards)} timetable files, {size} KB in {out}")


if __name__ == "__main__":
    src = pathlib.Path(sys.argv[1])
    build(src, pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "site" / "data" / "rail")
