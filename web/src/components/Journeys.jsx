import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { PHOTOS, creditLine } from "../photos.js";
import { hhmm, plan } from "../journey.js";

const rise = (d) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: d, ease: [0.22, 0.8, 0.24, 1] } });
const ROUTE = "csmt-pune";
// The trains suggested first: the day trains people take for the view.
const FAVOURITES = ["11007", "12127", "11009", "12123", "22105"];
const ICON = { waterfall: "💧", fort: "🏰", cave: "⛰️", peak: "⛰️", dam: "🌊", river: "🌊", bridge: "🌉", tunnel: "🚇", temple: "🛕", landmark: "📍", lake: "🌊" };
const KIND = { waterfall: "Waterfall", fort: "Fort", cave: "Caves", peak: "Peak", dam: "Dam", river: "River", bridge: "Bridge", tunnel: "Tunnel", temple: "Temple", landmark: "Landmark", lake: "Lake" };

function useRouteData() {
  const [state, setState] = useState({ data: null, error: false });
  useEffect(() => {
    fetch(`data/journey/${ROUTE}.json`).then((r) => r.json())
      .then((data) => setState({ data, error: false }))
      .catch(() => setState({ data: null, error: true }));
  }, []);
  return state;
}

const go = (train, from, to) => { location.hash = `#/journeys/${train}/${from}/${to}`; };

export default function Journeys({ train: trainNo, from, to }) {
  const { data, error } = useRouteData();
  const p = PHOTOS.dudhsagar;
  useEffect(() => { document.title = "Journey Partner · Rail Club"; }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [trainNo]);

  const train = data?.trains.find((t) => t.number === trainNo);
  const names = useMemo(() => Object.fromEntries((data?.stations ?? []).map((s) => [s.code, s.name])), [data]);

  return (
    <div className="wrap page journey">
      <a className="back" href="#/">← Back to stations</a>
      <m.div className="page-hero" {...rise(0)}>
        <img src={p.small} srcSet={`${p.small} 960w, ${p.src} ${p.w}w`} sizes="(max-width: 860px) 100vw, 820px" alt="" style={{ objectPosition: p.pos }} />
        <div className="page-hero-text">
          <span className="tag new">Pilot: Mumbai → Pune</span>
          <p className="kicker hi" lang="hi">यात्रा साथी</p>
          <h1>Journey Partner</h1>
          <p>Never miss the waterfall again. Pick your train and see every sight on the way, when it comes and which window to look out of.</p>
        </div>
        <p className="credit"><a href={p.page} target="_blank" rel="noopener">{creditLine(p)}</a></p>
      </m.div>

      {error && <p className="hint">Couldn't load the journey data. Please refresh.</p>}
      {data && <Picker data={data} names={names} train={train} from={from} to={to} />}
      {data && train && <Result data={data} train={train} from={from} to={to} />}
      {data && !train && <Intro data={data} />}
    </div>
  );
}

function Picker({ data, names, train, from, to }) {
  const [q, setQ] = useState(train ? `${train.number} ${train.name}` : "");
  useEffect(() => { setQ(train ? `${train.number} ${train.name}` : ""); }, [train]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || (train && q === `${train.number} ${train.name}`)) return [];
    return data.trains.filter((t) => t.number.startsWith(s) || t.name.toLowerCase().includes(s)).slice(0, 8);
  }, [q, data, train]);
  const favourites = FAVOURITES.map((n) => data.trains.find((t) => t.number === n)).filter(Boolean);
  const pick = (t) => go(t.number, t.stops[0][0], t.stops.at(-1)[0]);
  const codes = train?.stops.map((s) => s[0]) ?? [];

  return (
    <section className="search-card jp-picker" aria-label="Choose your train">
      <label className="search-label" htmlFor="jp-train">Your train <span className="hi" lang="hi">आपकी ट्रेन</span></label>
      <div className="search-box">
        <input id="jp-train" className="jp-input" value={q} placeholder="Train number or name, e.g. 11007 or Deccan"
          autoComplete="off" inputMode="search" onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) pick(matches[0]); }} />
        {matches.length > 0 && (
          <ul className="jp-matches" role="listbox">
            {matches.map((t) => (
              <li key={t.number}><button type="button" onClick={() => pick(t)}><b>{t.number}</b> {t.name}
                <span>{names[t.stops[0][0]]} → {names[t.stops.at(-1)[0]]}</span></button></li>
            ))}
          </ul>
        )}
      </div>
      {!train && (
        <div className="jp-chips" aria-label="Popular trains">
          {favourites.map((t) => <button key={t.number} type="button" className="chip" onClick={() => pick(t)}>{t.number} {t.name}</button>)}
        </div>
      )}
      {train && (
        <div className="jp-fromto">
          <label>From
            <select value={from} onChange={(e) => go(train.number, e.target.value, codes.indexOf(to) > codes.indexOf(e.target.value) ? to : codes.at(-1))}>
              {codes.slice(0, -1).map((c) => <option key={c} value={c}>{names[c]}</option>)}
            </select>
          </label>
          <span aria-hidden="true">→</span>
          <label>To
            <select value={to} onChange={(e) => go(train.number, from, e.target.value)}>
              {codes.slice(codes.indexOf(from) + 1).map((c) => <option key={c} value={c}>{names[c]}</option>)}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}

function Result({ data, train, from, to }) {
  const result = useMemo(() => plan(data, train, from, to), [data, train, from, to]);
  if (!result) return <p className="hint">This train doesn't run from {from} to {to}. Pick the stations again.</p>;
  const { stops, sights, left, right, best } = result;
  // Stops and sights in one timeline, in the order the train meets them.
  const rows = [...stops.map((s) => ({ type: "stop", m: s.m, s })), ...sights.map((s) => ({ type: "sight", m: s.m, s }))]
    .sort((a, b) => a.m - b.m || (a.type === "stop" ? -1 : 1));

  return (
    <>
      <m.section className={`jp-summary ${best ?? "even"}`} key={`${train.number}-${from}-${to}`} {...rise(0.05)} aria-live="polite">
        {best ? (
          <>
            <p className="jp-sit">Sit on the <b>{best.toUpperCase()}</b></p>
            <p>{Math.max(left, right)} of {left + right} sights you can see today are on the {best} side, facing the way the train goes.</p>
          </>
        ) : (
          <>
            <p className="jp-sit">Either side works</p>
            <p>{left} sights on each side, facing the way the train goes.</p>
          </>
        )}
        <p className="jp-meta">{train.number} {train.name} · {stops[0].name} {hhmm(stops[0].dep)} → {stops.at(-1).name} {hhmm(stops.at(-1).arr)}</p>
      </m.section>

      <ol className="jp-line">
        <AnimatePresence initial={false}>
          {rows.map((r, n) => r.type === "stop" ? (
            <m.li key={`stop-${r.s.code}`} className="jp-stop" {...rise(Math.min(n * 0.03, 0.6))}>
              <time>{hhmm(r.s === stops[0] ? r.s.dep : r.s.arr)}</time>
              <span className="jp-dot" aria-hidden="true" />
              <b>{r.s.name}{r.s !== stops[0] && r.s !== stops.at(-1) && r.s.dep > r.s.arr && <small> leaves {hhmm(r.s.dep)}</small>}</b>
            </m.li>
          ) : (
            <m.li key={`sight-${r.s.title}-${r.s.m}`} className={`jp-sight ${r.s.side} ${r.s.season_now ? "" : "off"} ${r.s.light}`} {...rise(Math.min(n * 0.03, 0.6))}>
              <time>≈{hhmm(r.s.at)}</time>
              <span className="jp-dot" aria-hidden="true">{ICON[r.s.kind] ?? "📍"}</span>
              <div className="jp-card">
                <div className="jp-head">
                  <span className={`jp-side ${r.s.side}`}>{r.s.side === "both" ? "BOTH SIDES" : r.s.side.toUpperCase()}</span>
                  <span className="jp-after">{Math.max(1, Math.round(r.s.after))} min after {r.s.prev.name}</span>
                </div>
                <h3>{r.s.title}</h3>
                <p>{r.s.note}</p>
                <p className="jp-tags">
                  <span>{KIND[r.s.kind] ?? r.s.kind}</span>
                  {r.s.season !== "all year" && <span className={r.s.season_now ? "in" : "out"}>{r.s.season_now ? `Flowing now (${r.s.season})` : `Dry now · flows ${r.s.season}`}</span>}
                  {r.s.light === "dark" && <span className="out">Passes in the dark</span>}
                  {r.s.light === "twilight" && <span>Dusk or dawn, depending on the season</span>}
                  {r.s.checked === "map" && <span className="map">Side worked out from the map</span>}
                </p>
              </div>
            </m.li>
          ))}
        </AnimatePresence>
      </ol>
      <About data={data} />
    </>
  );
}

function Intro({ data }) {
  return (
    <m.div className="note-card" {...rise(0.2)}>
      <p><b>{data.sights.length} sights between Mumbai and Pune</b>, from Sion Fort to the Bhor Ghat waterfalls, Rajmachi, Duke's Nose, Lohagad and Visapur. {data.trains.length} trains to choose from.</p>
      <p>Type your train number above, or pick one of the popular day trains.</p>
      <About data={data} />
    </m.div>
  );
}

function About({ data }) {
  return (
    <details className="jp-about">
      <summary>How accurate is this?</summary>
      <ul>
        <li><b>Left and right</b> are worked out from the map, facing the direction the train is going. A sight is marked "seen from the train" once a traveller confirms it.</li>
        <li><b>Times are estimates.</b> The timetable comes from open data gathered in 2016, so clock times may have moved. "Minutes after the last stop" is more reliable than the clock: count from when your train actually leaves.</li>
        <li><b>The ghat is slow:</b> between Karjat and Lonavala trains climb at about half their usual speed, and the estimates allow for that.</li>
        <li>Unofficial and not linked to Indian Railways.</li>
      </ul>
      <p className="jp-credit">{data.credits.join(" · ")}. Place facts from Wikidata (CC0).</p>
    </details>
  );
}
