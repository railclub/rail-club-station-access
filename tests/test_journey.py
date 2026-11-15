import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))

from journey_build import merge, on_route, osm_kind  # noqa: E402
from journey_geo import distance_m, locate, minutes_after, route_path  # noqa: E402


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


def test_minutes_between_stops():
    marks = [(0, 0), (10_000, 20), (30_000, 40)]  # 20 min for 10 km, then 20 min for 20 km
    assert minutes_after(5_000, marks) == (10, 0)
    assert minutes_after(20_000, marks) == (30, 1)
    assert minutes_after(40_000, marks) is None


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
