"""Journey Partner, step 3: fill the pilot route's timetables from open data, with no typing.

Source: the Indian Railways timetable gathered by Sanjay Bhangar and Sajjad Anwar and published
as github.com/datameet/railways under CC0. It has every stop of 5,208 trains, but it dates from
2016: clock times and a few train numbers have changed since. Journey Partner therefore shows
"minutes after the last stop" first and treats the clock time as approximate, and
timetable-fixes.json (made by hand or, later, by travellers) overrides anything here.

Usage:  git clone --depth 1 https://github.com/datameet/railways ../datameet-railways
        python3 scraper/journey_timetables.py ../datameet-railways/schedules.json
Writes data/journey/<route>/timetables.json, then run scraper/journey_build.py.
"""
import collections
import json
import pathlib
import sys

from journey_geo import timed_stops

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = "github.com/datameet/railways (CC0), Indian Railways timetable of 2016"
# Station codes that have changed since the data was gathered.
RENAMED = {"CSTM": "CSMT", "KJMG": "KJRD", "BGW": "BGWI"}


def halts(rows):
    """The stops where the train really halts. The data also lists every station it runs
    through, with the same arrival and departure time; those times are only estimates."""
    rows = sorted(rows, key=lambda r: r["id"])
    return [r for i, r in enumerate(rows) if i in (0, len(rows) - 1) or r["arrival"] != r["departure"]]


def trains_on_route(schedules, station_m):
    """Every train that halts at two or more of the route's stations, in the route's direction:
    [{"number", "name", "stops": [{"code", "arr", "dep"}]}], covering only its stretch on the route."""
    by_train = collections.defaultdict(list)
    for row in schedules:
        by_train[row["train_number"]].append(row)
    out = []
    for number, rows in sorted(by_train.items()):
        if not number.isdigit():  # "11057-Slip": coaches that are part of another train
            continue
        on = [(RENAMED.get(r["station_code"], r["station_code"]), r) for r in halts(rows)]
        on = [(code, r) for code, r in on if code in station_m]
        if len(on) < 2 or station_m[on[0][0]] >= station_m[on[-1][0]]:
            continue
        stops = []
        for i, (code, r) in enumerate(on):
            stop = {"code": code}
            # A through train's first stop here still has an arrival, but the journey on this route starts at its departure.
            if i > 0 and r["arrival"] != "None":
                stop["arr"] = r["arrival"][:5]
            if i < len(on) - 1 and r["departure"] != "None":
                stop["dep"] = r["departure"][:5]
            stops.append(stop)
        try:
            timed_stops(stops, station_m)
        except ValueError:
            continue  # runs the other way, or doubles back: not this route
        out.append({"number": number, "name": " ".join(rows[0]["train_name"].split()), "stops": stops})
    return out


def main(schedules_path, route_id="csmt-pune"):
    folder = ROOT / "data" / "journey" / route_id
    route = json.loads((folder / "route.json").read_text())
    schedules = json.loads(pathlib.Path(schedules_path).read_text())
    trains = trains_on_route(schedules, {s["code"]: s["m"] for s in route["stations"]})
    (folder / "timetables.json").write_text(json.dumps(
        {"route": route_id, "source": SOURCE, "trains": trains}, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(trains)} trains on {route['name']} from {SOURCE}")


if __name__ == "__main__":
    main(*sys.argv[1:])
