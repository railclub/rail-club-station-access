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


def clock(text):
    """"07:05" -> 425 minutes after midnight. Raises ValueError on anything else."""
    hours, _, minutes = text.partition(":")
    if not (hours.isdigit() and minutes.isdigit() and len(minutes) == 2 and int(hours) < 24 and int(minutes) < 60):
        raise ValueError(f"Not a time: {text!r}")
    return int(hours) * 60 + int(minutes)


def timed_stops(stops, station_m):
    """Check one train's timetable against the route and put it on a single clock.

    stops: [{"code", "arr", "dep"}] in order; the first needs "dep", the last "arr", the rest both.
    station_m: {code: metres_from_start} for the stations on the route.
    Returns [(code, metres_from_start, arrive_min, depart_min)], with minutes counted from the
    midnight before the first departure, so a train that runs past midnight keeps going up.
    Raises ValueError saying what is wrong, so a typing mistake can't reach the site."""
    if len(stops) < 2:
        raise ValueError("A train needs at least two stops")
    out, last_time, last_m = [], -1, -1.0
    for i, stop in enumerate(stops):
        code = stop.get("code", "")
        if code not in station_m:
            raise ValueError(f"{code or 'A stop'} is not a station on this route")
        if station_m[code] <= last_m:
            raise ValueError(f"{code} comes before the previous stop on this route")
        times = []
        for key, needed in (("arr", i > 0), ("dep", i < len(stops) - 1)):
            if needed and not stop.get(key):
                raise ValueError(f"{code} needs a {'departure' if key == 'dep' else 'arrival'} time")
            if stop.get(key):
                minute = clock(stop[key])
                while minute < last_time:  # past midnight
                    minute += 1440
                if minute - max(last_time, 0) > 720 and last_time >= 0:
                    raise ValueError(f"{code}: {stop[key]} is more than 12 hours after the previous time")
                last_time = minute
                times.append(minute)
        out.append((code, station_m[code], times[0], times[-1]))
        last_m = station_m[code]
    return out


def effort(chain_m, slow=()):
    """Distance along the route with slow stretches counted longer. slow: [(from_m, to_m, factor)],
    e.g. a ghat climb where trains run at about half their usual speed has factor 2."""
    extra = sum((factor - 1) * max(0.0, min(chain_m, end) - start) for start, end, factor in slow)
    return chain_m + extra


def passing_time(chain_m, timed, slow=()):
    """When a train passes a point: (minutes_on_the_clock, index_of_previous_stop,
    minutes_since_leaving_it). Between two stops the train is assumed to run at a steady speed,
    except on the slow stretches (see effort). None if the point is outside the train's journey.
    timed comes from timed_stops()."""
    for i, ((_, m0, _, dep), (_, m1, arr, _)) in enumerate(zip(timed, timed[1:])):
        if m0 <= chain_m <= m1:
            share = (effort(chain_m, slow) - effort(m0, slow)) / (effort(m1, slow) - effort(m0, slow))
            return dep + (arr - dep) * share, i, (arr - dep) * share
    return None


def daylight(minute):
    """Rough light for western India, where sunrise is 06:00-07:10 and sunset 18:00-19:20 over
    the year: "day", "dark", or "twilight" when it depends on the season."""
    minute %= 1440
    if 7 * 60 + 15 <= minute <= 17 * 60 + 45:
        return "day"
    if minute < 5 * 60 + 45 or minute > 19 * 60 + 30:
        return "dark"
    return "twilight"
