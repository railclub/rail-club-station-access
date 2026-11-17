# Journey Partner: build plan

Goal: a traveller enters a train number, where they board and where they get off, and sees
the sights on the way (waterfalls, rivers, forts, bridges) in order, with roughly when they pass
each one and whether to look LEFT or RIGHT in the direction of travel.

Agreed on 15 November 2026. Work through the steps **in this order**.

## How it works underneath

1. **Timetable:** the train's stops in order, with times.
2. **Track shape:** the real line between stations as a map path (OpenStreetMap, free with credit).
3. **Sights:** each one's exact location (OpenStreetMap, Wikidata, and travellers).
4. **Maths:** project each sight onto the track to get how far along the route it is (so the time
   can be estimated between two stops), and use the track direction to say left or right.

## Steps, in order

1. **Lock the pilot.** **Done, 15 November 2026.** Route Mumbai CSMT → Pune through the Bhor
   Ghat, one direction first (the reverse just swaps sides). Trains: 11007 Deccan Express first,
   then 12123 Deccan Queen, 22105 Indrayani Express, 12127 Intercity Express and 11009 Sinhagad
   Express (numbers and stops to be checked against the official timetable in step 3).
2. **Track shape.** **Done, 15 November 2026.** The CSMT–Pune line is a path of 1,542 points,
   188.5 km long, with all 58 stations on it: `data/journey/csmt-pune/route.json`
   ([map](journey-pilot-route.png)). It follows the fast line through the Parsik tunnel, as
   express trains do.
   - `scraper/journey_fetch.py` downloads the raw map data into `data/journey/raw/` (not kept on
     `main`; a copy is on the `journey-pilot` branch). It needs the `rail-club` cloud
     environment, which allows the OpenStreetMap mirror servers and Wikidata.
   - `scraper/journey_build.py` builds the route and the candidates from that raw data.
   - `scraper/journey_geo.py` holds the maths (route following, distance along it, left/right),
     with tests in `tests/test_journey.py`.
3. **Timetables.** **Done for the pilot, 15 November 2026, with one known weakness.** The owner
   will not type or screenshot timetables, so they come from open data with no typing:
   - `scraper/journey_timetables.py` reads the Indian Railways timetable published as
     [datameet/railways](https://github.com/datameet/railways) (CC0, 5,208 trains) and picks
     every train that halts at two or more stations of the route, in its direction: **92 trains**
     for CSMT → Pune, in `data/journey/csmt-pune/timetables.json`.
   - **Weakness: that data is from 2016.** Clock times have shifted (11007 left at 07:10 then,
     07:00 now by third-party sites) and a few numbers changed (Indrayani was 12525, now 22105).
     Running times between stops change far less. So the page must show "minutes after the last
     stop" first, treat the clock time as approximate, and say the timetable's age.
   - `timetable-fixes.json` overrides any train by hand and holds renumberings. Later,
     travellers' ride recordings (step 6) and corrections can feed it.
   - `scraper/journey_build.py` refuses a timetable that doesn't fit the route and writes
     `trains.json`. `python3 scraper/journey_build.py 11007` prints what a train passes and when.
   - Trains climb the Bhor Ghat at about 34 km/h against 63 km/h on the plains (measured from
     the timetable), so Karjat → Lonavala counts 1.9 times its length when estimating times.
   - **Open:** a newer official source. data.gov.in publishes the Indian Railways timetable
     under the Government Open Data Licence; it is blocked from the cloud workspace until the
     host is allowed. Do not scrape NTES or IRCTC.
4. **Sights.** **First pick done, 17 November 2026.** From the 192 candidates in
   `candidates.json`, 22 sights that can really be seen from the window are in `picks.json`,
   each with a short note and a season (the ghat waterfalls flow June to September). The build
   places them in `sights.json` with distance along the route and side. Every one is marked
   "checked on the map" until someone confirms it from a train (step 6). The facts in the
   notes are kept to well-known ones; anything doubtful was left out.
5. **Side and time.** **Done.** `scraper/journey_geo.py` gives each sight its side and position;
   passing times are estimated between a train's stops, with the Bhor Ghat counted 1.9 times
   slower; each pass is marked day, twilight or dark. Tested in `tests/test_journey.py`.
   `python3 scraper/journey_build.py 11007` prints what a train passes and when.
6. Work through the steps **in this order**.

## How it works underneath

1. **Timetable:** the train's stops in order, with times.
2. **Track shape:** the real line between stations as a map path (OpenStreetMap, free with credit).
3. **Sights:** each one's exact location (OpenStreetMap, Wikidata, and travellers).
4. **Maths:** project each sight onto the track to get how far along the route it is (so the time
   can be estimated between two stops), and use the track direction to say left or right.

## Steps, in order

1. **Lock the pilot.** **Done, 15 November 2026.** Route Mumbai CSMT → Pune through the Bhor
   Ghat, one direction first (the reverse just swaps sides). Trains: 11007 Deccan Express first,
   then 12123 Deccan Queen, 22105 Indrayani Express, 12127 Intercity Express and 11009 Sinhagad
   Express (numbers and stops to be checked against the official timetable in step 3).
2. **Track shape.** **Done, 15 November 2026.** The CSMT–Pune line is a path of 1,542 points,
   188.5 km long, with all 58 stations on it: `data/journey/csmt-pune/route.json`
   ([map](journey-pilot-route.png)). It follows the fast line through the Parsik tunnel, as
   express trains do.
   - `scraper/journey_fetch.py` downloads the raw map data into `data/journey/raw/` (not kept on
     `main`; a copy is on the `journey-pilot` branch). It needs the `rail-club` cloud
     environment, which allows the OpenStreetMap mirror servers and Wikidata.
   - `scraper/journey_build.py` builds the route and the candidates from that raw data.
   - `scraper/journey_geo.py` holds the maths (route following, distance along it, left/right),
     with tests in `tests/test_journey.py`.
3. **Timetables.** **Done for the pilot, 15 November 2026, with one known weakness.** The owner
   will not type or screenshot timetables, so they come from open data with no typing:
   - `scraper/journey_timetables.py` reads the Indian Railways timetable published as
     [datameet/railways](https://github.com/datameet/railways) (CC0, 5,208 trains) and picks
     every train that halts at two or more stations of the route, in its direction: **92 trains**
     for CSMT → Pune, in `data/journey/csmt-pune/timetables.json`.
   - **Weakness: that data is from 2016.** Clock times have shifted (11007 left at 07:10 then,
     07:00 now by third-party sites) and a few numbers changed (Indrayani was 12525, now 22105).
     Running times between stops change far less. So the page must show "minutes after the last
     stop" first, treat the clock time as approximate, and say the timetable's age.
   - `timetable-fixes.json` overrides any train by hand and holds renumberings. Later,
     travellers' ride recordings (step 6) and corrections can feed it.
   - `scraper/journey_build.py` refuses a timetable that doesn't fit the route and writes
     `trains.json`. `python3 scraper/journey_build.py 11007` prints what a train passes and when.
   - Trains climb the Bhor Ghat at about 34 km/h against 63 km/h on the plains (measured from
     the timetable), so Karjat → Lonavala counts 1.9 times its length when estimating times.
   - **Open:** a newer official source. data.gov.in publishes the Indian Railways timetable
     under the Government Open Data Licence; it is blocked from the cloud workspace until the
     host is allowed. Do not scrape NTES or IRCTC.
4. **Sights.** **First pick done, 17 November 2026.** From the 192 candidates in
   `candidates.json`, 22 sights that can really be seen from the window are in `picks.json`,
   each with a short note and a season (the ghat waterfalls flow June to September). The build
   places them in `sights.json` with distance along the route and side. Every one is marked
   "checked on the map" until someone confirms it from a train (step 6). The facts in the
   notes are kept to well-known ones; anything doubtful was left out.
5. **Side and time** (Claude). A Python script like `scraper/build.py` that gives each sight its
   position along the route, its side, minutes after the previous stop and whether it passes in
   daylight for each train. Unit tests, especially for left/right. Output a small JSON file the
   site loads; no database for the pilot.
6. **Check it against the real view.** The owner may not be able to ride the route, so the
   pilot must not depend on one trip:
   - Claude checks every sight's side against the map and satellite view before launch, and
     marks each one "checked on the map" or "seen from the train".
   - A "ride mode" page still gets built: tap "seen it, left/right" on the train and it records
     GPS and time on the phone. Anyone can use it (the owner if a trip happens, a friend, or
     early travellers), and each recording corrects the data.
   - Until a sight is seen from a train, the page says the side is worked out from the map.
7. **The Journey page.** **Pilot live, 17 November 2026** at `#/journeys`. Pick a train (search
   by number or name, or one of five popular day trains), then from/to limited to its stops;
   the address (`#/journeys/11007/CSMT/PUNE`) can be shared. Shows "Sit on the LEFT/RIGHT" with
   the count, then a timeline of stops and sights: approximate time, minutes after the last
   stop, a big LEFT/RIGHT badge, the note, "dry now" for out-of-season waterfalls, "passes in
   the dark", and "side worked out from the map". "How accurate is this?" explains the 2016
   timetable and credits OpenStreetMap, datameet and Wikidata.
   - Data: `scraper/journey_build.py` writes `site/data/journey/csmt-pune.json` (25 KB).
   - The page's maths (`web/src/journey.js`) mirrors `scraper/journey_geo.py`; keep them in step.
   - **Still to do:** works offline once loaded (a service worker), photos for each sight
     (needs per-photo credits), and the reverse direction (Pune → Mumbai swaps the sides).
8. **Travellers add and confirm sights** (Claude). Signed-in users add a sight from the train
   (GPS + time, side worked out automatically) or confirm/flag existing ones. New sights go
   through review like video reports; confirmed after a few independent confirmations. New
   Supabase tables with the same row level security approach as `reports`.
9. **Live mode** (later). On-device GPS: "Waterfall in 4 minutes, look LEFT". Location never
   leaves the phone.
10. **More routes** (later). Track shapes and sight candidates automate easily from
    OpenStreetMap; timetables need a licensed source, a partnership or crowd-sourcing.

## Known limits

- Only "left/right in the direction of travel", not seat numbers: which numbers face which
  window differs by coach type and needs a separate verified source.
- Some trains reverse at a station and the sides flip; flag these per train.
- Times are approximate; show them relative to the last stop.
- Credit OpenStreetMap (ODbL) on the page.

## Decided

- Pilot route and first train confirmed (15 November 2026).
- OpenStreetMap will be credited on the page.
- A checking ride by the owner is not certain; see step 6.
