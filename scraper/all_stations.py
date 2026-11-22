"""Every Indian Railways station, from the open datameet list (CC0, github.com/datameet/railways),
for the site's search and for checking that a visitor filming a station is really there.

Writes data/all_stations.json (committed, so the site builds without the datameet checkout):
  {code: [name, state, zone, lat, lon]}   state/zone/lat/lon are null when the source has none.
Usage: python3 scraper/all_stations.py <datameet checkout>
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from rail_data import RENAMED, tidy  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "all_stations.json"
ZONES = {
    "CR": "Central Railway", "WR": "Western Railway", "ER": "Eastern Railway", "NR": "Northern Railway",
    "SR": "Southern Railway", "NER": "North Eastern Railway", "NFR": "Northeast Frontier Railway",
    "SER": "South Eastern Railway", "SCR": "South Central Railway", "ECR": "East Central Railway",
    "ECoR": "East Coast Railway", "NCR": "North Central Railway", "NWR": "North Western Railway",
    "SECR": "South East Central Railway", "SWR": "South Western Railway", "WCR": "West Central Railway",
    "KR": "Konkan Railway",
}
KEEP_MUMBAI = {"Central", "CSMT"}  # "Mumbai Central" is the station's real name
# Where the source's spelling differs from the station's own board
OFFICIAL = {"MX": "Mahalaxmi"}


def display_name(raw: str) -> str:
    """The source prefixes Mumbai's suburban stations with "Mumbai": "MUMBAI SION" -> "Sion"."""
    name = tidy(raw)
    rest = name[len("Mumbai "):]
    return rest if name.startswith("Mumbai ") and rest and rest not in KEEP_MUMBAI else name


def convert(source: pathlib.Path) -> dict:
    out = {}
    for f in json.loads((source / "stations.json").read_text())["features"]:
        p, g = f["properties"], f.get("geometry") or {}
        lon, lat = (g.get("coordinates") or [None, None])[:2]
        code = RENAMED.get(p["code"], p["code"])
        if not code or not p.get("name"):
            continue
        out[code] = [OFFICIAL.get(code) or display_name(p["name"]), p.get("state") or None, ZONES.get(p.get("zone") or ""),
                     round(lat, 5) if lat is not None else None, round(lon, 5) if lon is not None else None]
    return dict(sorted(out.items()))


if __name__ == "__main__":
    data = convert(pathlib.Path(sys.argv[1]))
    OUT.write_text("{\n" + ",\n".join(f"{json.dumps(k)}:{json.dumps(v, ensure_ascii=False)}" for k, v in data.items()) + "\n}\n", encoding="utf-8")
    print(f"{len(data)} stations, {sum(1 for v in data.values() if v[3] is not None)} with coordinates -> {OUT.relative_to(ROOT)}")
