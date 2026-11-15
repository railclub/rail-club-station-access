import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))

from journey_build import merge, on_route, osm_kind, train_view  # noqa: E402
from journey_geo import clock, daylight, distance_m, effort, locate, passing_time, route_path, timed_stops
from journey_timetables import trains_on_route  # noqa: E402  # noqa: E402


def way(*pts):
    """pts: (node id, lat, lon)."""
    return {"nodes": [p[0] for p in pts], "geometry": [{"lat": p[1], "lon": p[2]} for p in pts]}


# A line running north from A to B, then east to C. A shortcut joins A straight to C.
A, B, C = (1, 18.00, 73.00), (2, 18.10, 73.00), (3, 18.10, 73.10)
WAYS = [way(A, (10, 18.05, 73.00), B), way(B, (11, 18.10, 73.05), C), way(A, C)]
STOPS = [("A", 18.00, 73.00), ("B", 18.10, 73.00), ("C", 18.10, 73.10)]


def test_route_goes_through_every_stop_not_the_shortcut():
    path, marks = route_path(WAYS, STOPS)
    assert [m[0] for m in marks] == ["A", "B", "C"]
    north, east = distance_m(18.00, 73.00, 18.10, 73.00), distance_m(18.10, 73.00, 18.10, 73.10)
    assert abs(marks[1][1] - north) < 1 and abs(marks[2][1] - (north + east)) < 1
    assert (18.05, 73.00) in [(p[0], p[1]) for p in path]  # went via B, not along the shortcut
    assert [p[2] for p in path] == sorted(p[2] for p in path)


def test_route_says_which_stop_is_unreachable():
    for stops, word in (([*STOPS, ("Far", 19.5, 74.5)], "Far"),):
        try:
            route_path(WAYS, stops)
            raise AssertionError("expected ValueError")
        except ValueError as e:
            assert word in str(e)
    island = [*WAYS, way((20, 18.50, 73.50), (21, 18.51, 73.50))]
    try:
        route_path(island, [*STOPS, ("Island", 18.50, 73.50)])
        raise AssertionError("expected ValueError")
    except ValueError as e:
        assert "Island" in str(e)


def test_route_steps_across_side_by_side_tracks_at_a_station():
    # Two tracks 20 m apart that the map never joins. The first stop sits on one and the last on
    # the other; the route must step across at the middle stop, not fail or wander.
    west = way((30, 18.00, 73.0000), (31, 18.05, 73.0000), (32, 18.10, 73.0000))
    east = way((40, 18.00, 73.0002), (41, 18.05, 73.0002), (42, 18.10, 73.0002))
    path, marks = route_path([west, east], [("S", 18.00, 72.9990), ("M", 18.05, 73.0001), ("N", 18.10, 73.0012)],
                             radius_m=120)
    assert abs(path[-1][2] - distance_m(18.00, 73.0, 18.10, 73.0)) < 60
    assert [round(m[1] / 1000) for m in marks] == [0, 6, 11]


def test_left_and_right_follow_the_direction_of_travel():
    path, _ = route_path(WAYS, STOPS)
    # Heading north out of A: east is on the right, west on the left.
    chain, off, side = locate(path, 18.05, 73.01)
    assert side == "right" and abs(off - distance_m(18.05, 73.00, 18.05, 73.01)) < 5
    assert abs(chain - distance_m(18.00, 73.00, 18.05, 73.00)) < 5
    assert locate(path, 18.05, 72.99)[2] == "left"
    # Heading east out of B: north is on the left, south on the right.
    assert locate(path, 18.11, 73.05)[2] == "left"
    assert locate(path, 18.09, 73.05)[2] == "right"


def test_the_return_journey_swaps_the_sides():
    back, _ = route_path(WAYS, STOPS[::-1])
    assert locate(back, 18.05, 73.01)[2] == "left"
    assert locate(back, 18.05, 72.99)[2] == "right"
    assert locate(back, 18.11, 73.05)[2] == "right"


STATION_M = {"A": 0, "B": 10_000, "C": 30_000, "D": 50_000}


def test_timetable_is_put_on_one_clock_and_times_are_estimated():
    timed = timed_stops([{"code": "A", "dep": "07:00"}, {"code": "B", "arr": "07:20", "dep": "07:25"},
                         {"code": "D", "arr": "08:05"}], STATION_M)
    assert timed == [("A", 0, 420, 420), ("B", 10_000, 440, 445), ("D", 50_000, 485, 485)]
    assert passing_time(5_000, timed) == (430, 0, 10)       # halfway to B: 07:10, 10 min after A
    assert passing_time(30_000, timed) == (465, 1, 20)      # C is passed without stopping, 20 min after B
    assert passing_time(60_000, timed) is None


def test_timetable_past_midnight_keeps_counting_up():
    timed = timed_stops([{"code": "A", "dep": "23:40"}, {"code": "B", "arr": "00:10", "dep": "00:15"},
                         {"code": "C", "arr": "01:00"}], STATION_M)
    assert [t[2] for t in timed] == [1420, 1450, 1500]
    assert daylight(passing_time(20_000, timed)[0]) == "dark"


def test_timetable_mistakes_are_refused_with_a_reason():
    bad = [
        ([{"code": "A", "dep": "07:00"}], "at least two"),
        ([{"code": "A", "dep": "07:00"}, {"code": "Z", "arr": "08:00"}], "Z is not a station"),
        ([{"code": "B", "dep": "07:00"}, {"code": "A", "arr": "08:00"}], "A comes before"),
        ([{"code": "A"}, {"code": "B", "arr": "08:00"}], "A needs a departure"),
        ([{"code": "A", "dep": "07:00"}, {"code": "B", "arr": "07:20"}, {"code": "C", "arr": "08:00"}], "B needs a departure"),
        ([{"code": "A", "dep": "7.00"}, {"code": "B", "arr": "08:00"}], "Not a time"),
        ([{"code": "A", "dep": "07:00"}, {"code": "B", "arr": "06:00"}], "more than 12 hours"),  # 08:00 mistyped
    ]
    for stops, word in bad:
        try:
            timed_stops(stops, STATION_M)
            raise AssertionError(f"expected a refusal: {word}")
        except ValueError as e:
            assert word in str(e), str(e)
    assert clock("23:59") == 1439


def test_light_at_the_edges_of_the_day():
    assert [daylight(clock(t)) for t in ("05:00", "06:30", "07:15", "12:00", "17:45", "18:30", "20:00")] == \
        ["dark", "twilight", "day", "day", "day", "twilight", "dark"]


def test_places_from_two_sources_are_listed_once():
    found = [
        {"name": "Lohagad Fort", "kind": "fort", "lat": 18.71, "lon": 73.476, "osm": "way/1", "wikidata": "Q1"},
        {"name": "Lohagad", "kind": "fort", "lat": 18.7102, "lon": 73.4761, "wikidata": "Q1", "photo": "lohagad.jpg"},
        {"name": "Kune Falls", "kind": "waterfall", "lat": 18.76, "lon": 73.38, "osm": "node/2"},
        {"name": "kune falls", "kind": "waterfall", "lat": 18.7603, "lon": 73.3801, "wikidata": "Q2"},
        {"name": "Kune Falls", "kind": "waterfall", "lat": 19.50, "lon": 73.90, "wikidata": "Q3"},  # a namesake far away
    ]
    out = merge(found)
    assert len(out) == 3
    fort = next(p for p in out if p["kind"] == "fort")
    assert fort["osm"] == "way/1" and fort["photo"] == "lohagad.jpg"  # keeps the map position, gains the photo


def test_kinds_and_tunnels_on_the_route():
    assert osm_kind({"waterway": "waterfall"}) == "waterfall"
    assert osm_kind({"historic": "fort", "name": "X"}) == "fort"
    assert osm_kind({"shop": "bakery"}) is None
    path, _ = route_path(WAYS, STOPS)
    tunnel = {**way((10, 18.05, 73.00), B), "tags": {"tunnel": "yes", "name": "Tunnel 1"}}
    elsewhere = {**way((50, 19.0, 74.0), (51, 19.1, 74.0)), "tags": {"tunnel": "yes"}}
    found = on_route(path, [tunnel, elsewhere, {**way(A, C), "tags": {}}], "tunnel")
    assert len(found) == 1 and found[0][0] == "Tunnel 1"
    assert abs(found[0][2] - distance_m(18.05, 73.00, 18.10, 73.00)) < 1


def test_a_trains_view_lists_what_it_passes_and_when():
    route = {"stations": [{"code": c, "name": f"{c} Town", "m": m} for c, m in STATION_M.items()]}
    sights = [{"name": "Falls", "kind": "waterfall", "side": "left", "m": 20_000},
              {"name": "Beyond", "kind": "fort", "side": "right", "m": 45_000}]
    train = {"number": "1", "name": "Test Express",
             "stops": [{"code": "A", "dep": "17:00"}, {"code": "B", "arr": "17:20", "dep": "17:25"}, {"code": "C", "arr": "17:55"}]}
    view = train_view(train, route, sights)
    assert [s["name"] for s in view["stops"]] == ["A Town", "B Town", "C Town"]
    assert view["passes"] == [{"name": "Falls", "kind": "waterfall", "side": "left", "m": 20_000, "time": "17:40",
                               "after_stop": "B Town", "after_min": 15, "light": "day"}]  # "Beyond" is after the last stop


def test_slow_stretches_take_their_share_of_the_time():
    # 30 km in 40 minutes, but the last 10 km is a climb taken at half speed: 20 km flat + 10 km
    # counted double = 40 units, so one minute per unit.
    timed = timed_stops([{"code": "A", "dep": "07:00"}, {"code": "C", "arr": "07:40"}], STATION_M)
    slow = [(20_000, 30_000, 2)]
    assert effort(25_000, slow) == 30_000
    assert passing_time(20_000, timed, slow)[0] == 440   # reaches the foot of the climb at 07:20, not 07:27
    assert passing_time(25_000, timed, slow)[0] == 450
    assert round(passing_time(20_000, timed)[0]) == 447  # without the climb: steady speed all the way


def row(i, number, code, arr, dep, name="Test Express"):
    return {"id": i, "train_number": number, "train_name": name, "station_code": code,
            "arrival": arr, "departure": dep, "day": 1}


def test_trains_are_picked_from_open_data_for_this_route():
    schedules = [
        # Starts before the route, halts at A and C, runs through B, ends beyond the route.
        row(1, "100", "X", "None", "06:00:00"), row(2, "100", "A", "07:00:00", "07:05:00"),
        row(3, "100", "B", "07:20:00", "07:20:00"), row(4, "100", "C", "07:50:00", "07:55:00"),
        row(5, "100", "Y", "09:00:00", "None"),
        # The return train, a train with one stop here, and slip coaches: none belong.
        row(6, "101", "C", "None", "10:00:00"), row(7, "101", "A", "11:00:00", "None"),
        row(8, "102", "A", "None", "12:00:00"), row(9, "102", "Y", "13:00:00", "None"),
        row(10, "100-Slip", "A", "None", "07:05:00"), row(11, "100-Slip", "C", "07:50:00", "None"),
        # An old station code is mapped to today's.
        row(12, "103", "CSTM", "None", "08:00:00"), row(13, "103", "D", "09:30:00", "None"),
    ]
    found = trains_on_route(schedules, {**STATION_M, "CSMT": -5_000})
    assert [t["number"] for t in found] == ["100", "103"]
    assert found[0]["stops"] == [{"code": "A", "dep": "07:05"}, {"code": "C", "arr": "07:50"}]
    assert found[1]["stops"][0] == {"code": "CSMT", "dep": "08:00"}
