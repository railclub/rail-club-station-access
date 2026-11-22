import { useEffect, useMemo, useRef, useState } from "react";
import { m, useScroll, useSpring, useTransform } from "motion/react";
import { PHOTOS, creditLine } from "../photos.js";
import { bestSide, dayOf, fetchSights, halts, hhmm, journey, loadIndex, loadStations, loadTimetable, placeSights } from "../journey.js";
import { loadPhotos } from "../sightPhotos.js";

const rise = (d) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: d, ease: [0.22, 0.8, 0.24, 1] } });
// Suggested to start with: day trains through the ghats and along the coast.
const FAVOURITES = ["11007", "12123", "12051", "10103", "12779", "16525"];
const ICON = { waterfall: "💧", fort: "🏰", cave: "⛰️", peak: "⛰️", dam: "🌊", river: "🌊", bridge: "🌉", tunnel: "🚇", temple: "🛕", landmark: "📍", lake: "🌊", viewpoint: "🔭" };
const KIND = { waterfall: "Waterfall", fort: "Fort", cave: "Caves", peak: "Peak", dam: "Dam", river: "River crossing", bridge: "Bridge", tunnel: "Tunnel", temple: "Temple", landmark: "Landmark", lake: "Lake", viewpoint: "Viewpoint" };
const go = (train, from, to) => { location.hash = from ? `#/journeys/${train}/${from}/${to}` : `#/journeys/${train}`; };
const when = (min, start) => `${hhmm(min)}${dayOf(min) > dayOf(start) ? ` · day ${dayOf(min)}` : ""}`;

// Hand-written wording for sights on the pilot route; matched to OpenStreetMap results by id.
let curatedP = null;
const loadCurated = () => (curatedP ??= fetch("data/journey/csmt-pune.json").then((r) => r.json()).then((d) => d.sights).catch(() => []));

export default function Journeys({ train: trainNo, from, to }) {
  const p = PHOTOS.dudhsagar;
  const [index, setIndex] = useState(null);
  const [stations, setStations] = useState(null);
  const [rows, setRows] = useState(undefined); // undefined: not loaded; null: no such train
  const [failed, setFailed] = useState(false);

  useEffect(() => { document.title = "Journey Partner · Rail Club"; }, []);
  useEffect(() => {
    Promise.all([loadIndex(), loadStations()]).then(([i, s]) => { setIndex(i); setStations(s); }).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    setRows(undefined);
    if (trainNo) loadTimetable(trainNo).then(setRows).catch(() => setFailed(true));
  }, [trainNo]);

  const train = index?.find((t) => t[0] === trainNo);
  const stops = rows ? halts(rows) : [];
  const f = from ?? stops[0]?.[0], t = to ?? stops.at(-1)?.[0];
  const path = useMemo(() => (rows && stations ? journey(rows, stations, f, t) : null), [rows, stations, f, t]);

  return (
    <div className="wrap page journey">
      <a className="back" href="#/">← Back to stations</a>
      <m.div className="page-hero" {...rise(0)}>
        <img src={p.small} srcSet={`${p.small} 960w, ${p.src} ${p.w}w`} sizes="(max-width: 860px) 100vw, 820px" alt="" style={{ objectPosition: p.pos }} />
        <div className="page-hero-text">
          <span className="tag new">New · any train</span>
          <p className="kicker hi" lang="hi">यात्रा साथी</p>
          <h1>Journey Partner</h1>
          <p>Enter your train and where you get on and off. We follow its line on the map and show the waterfalls, forts, rivers and tunnels on the way, when they come and which window to look out of.</p>
        </div>
        <p className="credit"><a href={p.page} target="_blank" rel="noopener">{creditLine(p)}</a></p>
      </m.div>

      {failed && <p className="hint">Couldn't load the timetable. Please check your connection and refresh.</p>}
      {index && stations && <Picker index={index} stations={stations} train={train} stops={stops} from={f} to={t} />}
      {trainNo && index && !train && <p className="hint">We don't have train {trainNo} in our timetable. Try another number or search by name.</p>}
      {train && path && <Result key={`${trainNo}-${f}-${t}`} train={train} path={path} />}
      {!trainNo && index && <Intro count={index.length} />}
    </div>
  );
}

function Picker({ index, stations, train, stops, from, to }) {
  const label = train ? `${train[0]} ${train[1]}` : "";
  const [q, setQ] = useState(label);
  useEffect(() => { setQ(label); }, [label]);
  const name = (code) => stations[code]?.[0] ?? code;
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || q === label) return [];
    const words = s.split(/\s+/);
    return index.filter((t) => t[0].startsWith(s) || words.every((w) => `${t[1]} ${name(t[2])} ${name(t[3])}`.toLowerCase().includes(w))).slice(0, 8);
  }, [q, index, label]);
  const favourites = FAVOURITES.map((n) => index.find((t) => t[0] === n)).filter(Boolean);
  const codes = stops.map((s) => s[0]);

  return (
    <section className="search-card jp-picker" aria-label="Choose your train">
      <label className="search-label" htmlFor="jp-train">Your train <span className="hi" lang="hi">आपकी ट्रेन</span></label>
      <div className="search-box">
        <input id="jp-train" className="jp-input" value={q} placeholder="Train number, name or route, e.g. 12051 or Goa"
          autoComplete="off" inputMode="search" onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) go(matches[0][0]); }} />
        {matches.length > 0 && (
          <ul className="jp-matches" role="listbox">
            {matches.map((t) => (
              <li key={t[0]}><button type="button" onClick={() => go(t[0])}><b>{t[0]}</b> {t[1]}<span>{name(t[2])} → {name(t[3])}</span></button></li>
            ))}
          </ul>
        )}
      </div>
      {!train && (
        <div className="jp-chips" aria-label="Popular trains">
          {favourites.map((t) => <button key={t[0]} type="button" className="chip" onClick={() => go(t[0])}>{t[0]} {t[1]}</button>)}
        </div>
      )}
      {train && codes.length > 1 && (
        <div className="jp-fromto">
          <label>Getting on at
            <select value={from} onChange={(e) => go(train[0], e.target.value, codes.indexOf(to) > codes.indexOf(e.target.value) ? to : codes.at(-1))}>
              {codes.slice(0, -1).map((c) => <option key={c} value={c}>{name(c)}</option>)}
            </select>
          </label>
          <span aria-hidden="true">→</span>
          <label>Getting off at
            <select value={to} onChange={(e) => go(train[0], from, e.target.value)}>
              {codes.slice(codes.indexOf(from) + 1).map((c) => <option key={c} value={c}>{name(c)}</option>)}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}

function Result({ train, path }) {
  const [raw, setRaw] = useState(null);
  const [curated, setCurated] = useState([]);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState({});
  const from = path[0], to = path.at(-1);

  useEffect(() => {
    let live = true;
    loadCurated().then((c) => live && setCurated(c));
    fetchSights(train[0], from.code, to.code, (s, done, ready, total) => { if (live) { setRaw(s); setProgress(done ? null : [ready, total]); } })
      .then((r) => { if (live && !r.done) setProgress("partial"); })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [train[0], from.code, to.code]);

  const sights = useMemo(() => (raw ? placeSights(path, raw, curated) : []), [raw, curated, path]);
  const ids = sights.map((s) => s.id).join(",");
  useEffect(() => {
    if (!sights.length) return undefined;
    return loadPhotos(sights, (id, ph) => setPhotos((p) => (p[id] ? p : { ...p, [id]: ph })));
  }, [ids]);

  const { left, right, best } = bestSide(sights);
  const rows = [...path.filter((s) => s.halt).map((s) => ({ type: "stop", m: s.m, s })), ...sights.map((s) => ({ type: "sight", m: s.m, s }))]
    .sort((a, b) => a.m - b.m || (a.type === "stop" ? -1 : 1));
  const km = Math.round(to.m / 1000);
  const looking = !error && (!raw || (!raw.length && Array.isArray(progress)));
  const highlights = sights.filter((s) => photos[s.id]).sort((a, b) => b.score - a.score || a.m - b.m).slice(0, 10).sort((a, b) => a.m - b.m);

  return (
    <>
      <m.section className={`jp-summary ${raw ? best ?? "even" : "wait"}`} {...rise(0.05)} aria-live="polite">
        {error ? (
          <><p className="jp-sit">Couldn't find the sights</p><p>{error}</p></>
        ) : looking ? (
          <><p className="jp-sit">Looking along the line…</p><p>Checking the map for waterfalls, forts, rivers and tunnels along {km} km of track.</p></>
        ) : best ? (
          <><p className="jp-sit">Sit on the <b>{best.toUpperCase()}</b></p><p>{Math.max(left, right)} of {left + right} sights you can see today are on the {best} side, facing the way the train goes.</p></>
        ) : left + right ? (
          <><p className="jp-sit">Either side works</p><p>{left} sights on each side, facing the way the train goes.</p></>
        ) : (
          <><p className="jp-sit">A quiet stretch</p><p>We found nothing marked on the map to look out for in daylight on this journey{sights.length ? ", apart from the river crossings and tunnels below" : ""}.</p></>
        )}
        {looking && <TrainLoader progress={Array.isArray(progress) ? progress : null} />}
        {!looking && Array.isArray(progress) && <p className="jp-meta">Still looking: {progress[0]} of {progress[1]} stretches of line checked. Sights appear as they're found.</p>}
        {progress === "partial" && <p className="jp-meta">Part of the line couldn't be checked just now. Open this journey again later to see the rest.</p>}
        <p className="jp-meta">{train[0]} {train[1]} · {from.name} {hhmm(from.dep)} → {to.name} {when(to.arr, from.dep)} · {km} km</p>
      </m.section>

      {highlights.length >= 2 && <Highlights sights={highlights} photos={photos} />}

      <Line>
        {rows.map((r, n) => r.type === "stop" ? (
          <m.li key={`stop-${r.s.code}-${n}`} className="jp-stop" {...rise(Math.min(n * 0.02, 0.5))}>
            <time>{hhmm(r.s === from ? r.s.dep : r.s.arr)}</time>
            <span className="jp-dot" aria-hidden="true" />
            <b>{r.s.name}{r.s !== from && r.s !== to && r.s.dep > r.s.arr && <small> leaves {hhmm(r.s.dep)}</small>}{dayOf(r.s.arr) > dayOf(from.dep) && <small> day {dayOf(r.s.arr)}</small>}</b>
          </m.li>
        ) : (
          <m.li key={r.s.id} id={`sight-${r.s.id.replace(/\W/g, "-")}`} className={`jp-sight ${r.s.side} ${r.s.season_now ? "" : "off"} ${r.s.light}`}
            initial={{ opacity: 0, x: r.s.side === "right" ? 28 : -28 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.55, ease: [0.22, 0.8, 0.24, 1] }}>
            <time>≈{hhmm(r.s.at)}</time>
            <span className="jp-dot" aria-hidden="true">{ICON[r.s.kind] ?? "📍"}</span>
            <div className="jp-card">
              {photos[r.s.id] ? <Photo p={photos[r.s.id]} alt={r.s.title} /> : <Scene kind={r.s.kind} />}
              <div className="jp-body">
                <div className="jp-head">
                  <span className={`jp-side ${r.s.side}`}>{r.s.side === "both" ? (r.s.kind === "river" || r.s.kind === "tunnel" ? "ON THE LINE" : "BOTH SIDES") : r.s.side.toUpperCase()}</span>
                  <span className="jp-after">{Math.max(1, Math.round(r.s.after))} min after {r.s.prev.name}</span>
                </div>
                <h3>{r.s.title}</h3>
                {r.s.note && <p>{r.s.note}</p>}
                <p className="jp-tags">
                  <span>{KIND[r.s.kind] ?? r.s.kind}</span>
                  {r.s.side !== "both" && <span>{r.s.off < 1000 ? `${Math.round(r.s.off / 50) * 50} m` : `${(r.s.off / 1000).toFixed(1)} km`} from the line</span>}
                  {r.s.season !== "all year" && <span className={r.s.season_now ? "in" : "out"}>{r.s.season_now ? `Flowing now (${r.s.season})` : `Dry now · flows ${r.s.season}`}</span>}
                  {r.s.light === "dark" && <span className="out">Passes in the dark</span>}
                  {r.s.light === "twilight" && <span>Dusk or dawn, depending on the season</span>}
                  {r.s.curated && <span className="in">Written up by Rail Club</span>}
                </p>
              </div>
            </div>
          </m.li>
        ))}
      </Line>
      {raw && <About />}
    </>
  );
}

/** A train running along a track while the line is being looked up. */
function TrainLoader({ progress }) {
  const pct = progress && progress[1] ? Math.round((progress[0] / progress[1]) * 100) : null;
  return (
    <div className="jp-loader" role="progressbar" aria-label="Looking along the line" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
      <div className="jp-scenery" aria-hidden="true"><span>⛰️</span><span>🌳</span><span>🏰</span><span>🌴</span><span>💧</span><span>⛰️</span><span>🌳</span><span>🛕</span></div>
      <div className="jp-track" aria-hidden="true">
        <span className="jp-loco" style={pct !== null ? { left: `${Math.max(4, Math.min(pct, 92))}%` } : undefined}>🚆</span>
      </div>
      <p className="jp-meta">{progress ? `${progress[0]} of ${progress[1]} stretches of line checked. Sights appear as they're found.` : "Starting up…"}</p>
    </div>
  );
}

/** The journey's best photos, side by side; they drift slowly, like a view from the window. */
function Highlights({ sights, photos }) {
  return (
    <m.section className="jp-highlights" aria-label="Highlights of this journey" {...rise(0.1)}>
      <h2>On this journey</h2>
      <div className="jp-strip">
        {sights.map((s) => {
          const p = photos[s.id];
          return (
            <button key={s.id} type="button" className="jp-shot"
              onClick={() => document.getElementById(`sight-${s.id.replace(/\W/g, "-")}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              <img src={p.thumb} alt={s.title} loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add("in")} />
              <span className="jp-shot-text"><b>{s.title}</b><small>≈{hhmm(s.at)} · {s.side === "both" ? "on the line" : `${s.side} side`}</small></span>
            </button>
          );
        })}
      </div>
    </m.section>
  );
}

function Photo({ p, alt }) {
  return (
    <figure className="jp-photo">
      <img src={p.thumb} alt={alt} loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add("in")} />
      <figcaption><a href={p.page} target="_blank" rel="noopener">Photo: {p.author} · {p.license}</a></figcaption>
    </figure>
  );
}

/** A small moving picture for sights without a photo: water flows, a tunnel's light passes. */
function Scene({ kind }) {
  return (
    <div className={`jp-scene ${kind}`} aria-hidden="true">
      <span className="jp-scene-icon">{ICON[kind] ?? "📍"}</span>
    </div>
  );
}

/** The timeline, with a train that rides down the line as you scroll. */
function Line({ children }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  const top = useTransform(smooth, (v) => `${Math.max(0, Math.min(1, v)) * 100}%`);
  return (
    <div className="jp-line-wrap" ref={ref}>
      <m.span className="jp-rider" aria-hidden="true" style={{ top }}>🚆</m.span>
      <ol className="jp-line">{children}</ol>
    </div>
  );
}

function Intro({ count }) {
  return (
    <m.div className="note-card" {...rise(0.2)}>
      <p><b>{count.toLocaleString("en-IN")} trains across India.</b> Type a train number, its name, or the cities it runs between, then pick where you get on and off.</p>
      <p>Or start with one of the scenic day trains above: the Deccan Express through the Bhor Ghat, or the Jan Shatabdi down the Konkan coast.</p>
      <About />
    </m.div>
  );
}

function About() {
  return (
    <details className="jp-about">
      <summary>How does this work, and how accurate is it?</summary>
      <ul>
        <li><b>The line</b> is drawn through every station your train passes, from an open copy of the Indian Railways timetable. On the plains it follows the track closely; in the hills the real track curves more, so a sight's side can occasionally be wrong there.</li>
        <li><b>The sights</b> come from OpenStreetMap, the map anyone can edit, with short descriptions from Wikidata. Waterfalls are shown as flowing from June to September.</li>
        <li><b>The photos</b> are openly licensed pictures from Wikimedia Commons: the one Wikidata lists for the place, or a photo with the same name taken nearby. Each shows its photographer and licence; tap it for the original. Places without a matching photo show a small picture of their kind instead.</li>
        <li><b>Times are estimates.</b> The timetable was gathered in 2016, so clock times may have moved. "Minutes after the last stop" is more reliable: count from when your train actually leaves.</li>
        <li>Unofficial and not linked to Indian Railways.</li>
      </ul>
      <p className="jp-credit">Map data © OpenStreetMap contributors (ODbL) · Timetable: datameet/railways (CC0, 2016) · Descriptions: Wikidata (CC0) · Photos: Wikimedia Commons, credited on each.</p>
    </details>
  );
}
