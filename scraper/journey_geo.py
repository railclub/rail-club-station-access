"""Journey Partner maths: turn railway lines into one route path, then say how far along the
route a sight is and whether it is on the LEFT or RIGHT in the direction of travel.

Pure functions (no network, no files) so every rule can be unit-tested.
"""
import heapq
import math

EARTH_M = 6_371_000.0


def distance_m(a_lat, a_lon, b_lat, b_lon):
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    h = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b_lon - a_lon) / 2) ** 2)
    return 2 * EARTH_M * math.asin(math.sqrt(h))


def to_xy(lat, lon, lat0, lon0):
    """Metres east and north of (lat0, lon0). Accurate to well under 1% across a pilot corridor."""
    return (math.radians(lon - lon0) * EARTH_M * math.cos(math.radians(lat0)),
            math.radians(lat - lat0) * EARTH_M)


def build_graph(ways):
    """ways: OpenStreetMap ways as [{"nodes": [id, ...], "geometry": [{"lat", "lon"}, ...]}].
    Tracks that share a node id are joined there. Returns (neighbours, coordinates)."""
    adj, coords = {}, {}
    for way in ways:
        ids, geom = way.get("nodes") or [], way.get("geometry") or []
        if len(ids) != len(geom):
            continue
        for node, pt in zip(ids, geom):
            coords[node] = (pt["lat"], pt["lon"])
        for a, b in zip(ids, ids[1:]):
            d = distance_m(*coords[a], *coords[b])
            adj.setdefault(a, []).append((b, d))
            adj.setdefault(b, []).append((a, d))
    return adj, coords


def nodes_near(coords, lat, lon, radius_m):
    """Track points within radius_m of a station: {node: metres}."""
    out = {}
    for node, (nlat, nlon) in coords.items():
        if abs(nlat - lat) > 0.01 or abs(nlon - lon) > 0.01:  # ~1 km: skip the far ones cheaply
            continue
        d = distance_m(lat, lon, nlat, nlon)
        if d <= radius_m:
            out[node] = d
    return out


def spread(adj, start_costs):
    """Shortest distance along the tracks from a set of starting points, each with a head start
    cost (Dijkstra). Returns (distance, previous point) for every point that can be reached."""
    dist, prev = dict(start_costs), {}
    heap = [(d, node) for node, d in start_costs.items()]
    heapq.heapify(heap)
    while heap:
        d, node = heapq.heappop(heap)
        if d > dist.get(node, math.inf):
            continue
        for nxt, w in adj.get(node, ()):
            nd = d + w
            if nd < dist.get(nxt, math.inf):
                dist[nxt], prev[nxt] = nd, node
                heapq.heappush(heap, (nd, nxt))
    return dist, prev


def route_path(ways, stops, radius_m=250.0):
    """stops: [(name, lat, lon), ...] in travel order. Follows the tracks from each stop to the
    next (so the route can't take a shorter line through other stations) and returns
    (path, marks): path is [(lat, lon, metres_from_start)], marks is [(name, metres_from_start)].

    A station has several tracks side by side, and the map doesn't always join them. So at each
    stop the route may step across to any track within radius_m, paying only the few metres
    between them, instead of going a long way round to find where the tracks meet.
    Raises ValueError naming the stop that can't be reached."""
    adj, coords = build_graph(ways)
    near = []
    for name, lat, lon in stops:
        found = nodes_near(coords, lat, lon, radius_m)
        if not found:
            raise ValueError(f"No track near {name}")
        near.append(found)

    # legs[i] = (previous-point map for the run into stop i+1, {start point: where we stepped from})
    costs, stepped, legs = {n: 0.0 for n in near[0]}, {}, []
    for (name, _, _), here in zip(stops[1:], near[1:]):
        dist, prev = spread(adj, costs)
        arrived = {n: dist[n] for n in here if n in dist}
        if not arrived:
            raise ValueError(f"Tracks don't connect to {name}")
        legs.append((prev, stepped))
        costs, stepped = {}, {}
        for n in here:
            frm = min(arrived, key=lambda r: arrived[r] + distance_m(*coords[r], *coords[n]))
            costs[n], stepped[n] = arrived[frm] + distance_m(*coords[frm], *coords[n]), frm
        last_arrived = arrived

    # Walk back from the cheapest arrival at the final stop.
    node, nodes = min(last_arrived, key=last_arrived.get), []
    for prev, stepped_here in reversed(legs):
        while True:
            nodes.append(node)
            if node not in prev:
                break
            node = prev[node]
        node = stepped_here.get(node, node)  # the step across at the stop this run started from
    nodes.reverse()

    path, total = [], 0.0
    for node in nodes:
        lat, lon = coords[node]
        if path:
            if (lat, lon) == (path[-1][0], path[-1][1]):
                continue
            total += distance_m(path[-1][0], path[-1][1], lat, lon)
        path.append((lat, lon, total))
    marks = [(name, locate(path, lat, lon)[0]) for name, lat, lon in stops]
    return path, marks


def locate(path, lat, lon):
    """Where a sight is relative to the route: (metres_from_start, metres_from_track, side).
    side is "left" or "right" for someone facing the direction of travel, taken at the point
    where the train passes closest."""
    lat0, lon0 = path[0][0], path[0][1]
    px, py = to_xy(lat, lon, lat0, lon0)
    best = (math.inf, 0.0, "left")
    ax, ay = to_xy(path[0][0], path[0][1], lat0, lon0)
    for (_, _, chain_a), (blat, blon, chain_b) in zip(path, path[1:]):
        bx, by = to_xy(blat, blon, lat0, lon0)
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        if seg2 > 0:
            t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
            off = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if off < best[0]:
                # Turning anticlockwise from the direction of travel to the sight means it is on the left.
                cross = dx * (py - ay) - dy * (px - ax)
                best = (off, chain_a + t * (chain_b - chain_a), "left" if cross > 0 else "right")
        ax, ay = bx, by
    return best[1], best[0], best[2]


def minutes_after(chain_m, timed_marks):
    """timed_marks: [(metres_from_start, minutes_from_start)] for the train's stops, in order.
    Estimates when the train passes chain_m by assuming steady speed between two stops.
    Returns (minutes_from_start, index_of_previous_stop), or None if outside the journey."""
    for i, ((m0, t0), (m1, t1)) in enumerate(zip(timed_marks, timed_marks[1:])):
        if m0 <= chain_m <= m1 and m1 > m0:
            return t0 + (t1 - t0) * (chain_m - m0) / (m1 - m0), i
    return None
