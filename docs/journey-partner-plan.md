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
2. **Track shape** (Claude). Extract the CSMT–Pune line from OpenStreetMap as a path with
   distance markers; check it against the station coordinates in `data/station_coords.json`.
   `scraper/journey_fetch.py` downloads the raw map data (and the step 4 sight candidates) into
   `data/journey/raw/`. It needs the `rail-club` cloud environment, which allows OpenStreetMap
   and Wikidata.
3. **Timetables** (you + Claude). Enter the pilot trains' stops and times by hand from the
   official published timetable. Do not scrape NTES or IRCTC. A timetable source at scale is
   the biggest open question.
4. **Sights** (Claude + you). Candidates near the track from OpenStreetMap and Wikidata; you prune
   to what is actually visible from a train. Tag each with a season (most ghat waterfalls flow
   only June to September).
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
7. **The Journey page** (Claude). Train number, then from/to limited to that train's stops.
   Animated vertical timeline: photo, time relative to the last stop, a big LEFT/RIGHT badge,
   season tag, "passes in the dark" flag. Summary card ("Sit on the LEFT: 7 of 9 sights").
   Works offline once loaded (poor signal in the ghats).
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
