"""Journey Partner, steps 2 and 4: download the raw map data for the pilot corridor.

Mumbai CSMT -> Pune (Bhor Ghat). Saves, under data/journey/raw/:
  tracks.json.gz     railway lines with their shape        (OpenStreetMap, ODbL)
  stations.json.gz   stations and halts                    (OpenStreetMap, ODbL)
  routes.json.gz     named train/track routes, tags only   (OpenStreetMap, ODbL)
  sights.json.gz     waterfalls, forts, viewpoints, dams…  (OpenStreetMap, ODbL)
  wikidata_*.json.gz places with coordinates, photos       (Wikidata, CC0)
  FETCH_LOG.txt      what worked and what didn't

Only downloads; scraper/journey_build.py turns this into what the site uses. Run rarely and
politely: one request at a time, with pauses. Usage: python3 scraper/journey_fetch.py
"""
import gzip
import json
import pathlib
import subprocess
import sys
import time
import urllib.parse
import urllib.request

# South, west, north, east: CSMT, north to Kalyan, south-east through the ghats to Pune.
S, W, N, E = 18.45, 72.78, 19.30, 73.95
BBOX = f"({S},{W},{N},{E})"
UA = "RailClub-JourneyPartner/0.1 (railclub.support@gmail.com)"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "journey" / "raw"
OVERPASS = "https://overpass-api.de/api/interpreter"
WIKIDATA = "https://query.wikidata.org/sparql"

OSM = {
    "routes": f'relation["type"="route"]["route"~"^(train|tracks|railway)$"]{BBOX};out tags;',
    # Running lines only: sidings, yards and spurs all carry a "service" tag.
    "tracks": f'way["railway"="rail"][!"service"]{BBOX};out geom;',
    "stations": f'nwr["railway"~"^(station|halt)$"]{BBOX};out center;',
    "sights": f"""(
      nwr["waterway"="waterfall"]{BBOX}; nwr["natural"="waterfall"]{BBOX};
      nwr["tourism"~"^(viewpoint|attraction)$"]{BBOX};
      nwr["historic"~"^(fort|castle|ruins|monument|archaeological_site)$"]{BBOX};
      nwr["natural"="peak"]["name"]{BBOX}; nwr["natural"="cave_entrance"]["name"]{BBOX};
      nwr["waterway"="dam"]{BBOX}; nwr["natural"="water"]["name"]{BBOX};
      nwr["amenity"="place_of_worship"]["wikidata"]{BBOX};
      way["waterway"="river"]["name"]{BBOX};
    );out center tags;""",
}

SPARQL = """SELECT ?item ?label ?desc ?coord ?image ?class ?links WHERE {
  SERVICE wikibase:box { ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(%s %s)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(%s %s)"^^geo:wktLiteral . }
  ?item wikibase:sitelinks ?links .
  OPTIONAL { ?item rdfs:label ?label . FILTER(LANG(?label) = "en") }
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P31 ?class }
}"""


def get(url: str, data: bytes | None, accept: str) -> bytes:
    headers = {"User-Agent": UA, "Accept": accept}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=300) as r:
            return r.read()
    except Exception as first:  # some sandboxes only trust their proxy through curl
        cmd = ["curl", "-sS", "--fail", "-m", "300", "-A", UA, "-H", f"Accept: {accept}", url]
        if data is not None:
            cmd += ["--data-binary", "@-"]
        done = subprocess.run(cmd, input=data, capture_output=True)
        if done.returncode:
            raise RuntimeError(f"{first}; curl: {done.stderr.decode(errors='replace').strip()[:200]}")
        return done.stdout


def save(name: str, fetch) -> str:
    try:
        body = fetch()
        parsed = json.loads(body)  # make sure it's complete JSON, not an error page
        count = len(parsed.get("elements", parsed.get("results", {}).get("bindings", [])))
        with gzip.open(OUT / f"{name}.json.gz", "wb") as f:
            f.write(body)
        return f"OK    {name}: {count} items, {len(body) // 1024} KB"
    except Exception as e:
        return f"FAIL  {name}: {str(e)[:300]}"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    log = [f"Fetched {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}, box S{S} W{W} N{N} E{E}"]
    for name, q in OSM.items():
        body = urllib.parse.urlencode({"data": f"[out:json][timeout:240];{q}"}).encode()
        log.append(save(name, lambda: get(OVERPASS, body, "application/json")))
        print(log[-1], flush=True)
        time.sleep(15)
    # Wikidata in a 3 x 3 grid so the dense Mumbai squares can't time the whole query out.
    for i in range(3):
        for j in range(3):
            s, n = S + (N - S) * i / 3, S + (N - S) * (i + 1) / 3
            w, e = W + (E - W) * j / 3, W + (E - W) * (j + 1) / 3
            url = WIKIDATA + "?" + urllib.parse.urlencode({"query": SPARQL % (w, s, e, n), "format": "json"})
            log.append(save(f"wikidata_{i}{j}", lambda: get(url, None, "application/sparql-results+json")))
            print(log[-1], flush=True)
            time.sleep(5)
    (OUT / "FETCH_LOG.txt").write_text("\n".join(log) + "\n")
    return 1 if all(line.startswith("FAIL") for line in log[1:]) else 0


if __name__ == "__main__":
    sys.exit(main())
