import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))

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
