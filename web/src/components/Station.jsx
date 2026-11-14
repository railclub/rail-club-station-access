import { useEffect, useMemo, useRef } from "react";
import { m } from "motion/react";
import { BANNER, creditLine } from "../photos.js";
import { pushRecent, useAuth } from "../auth.js";

const REPO = "https://github.com/railclub/rail-club-station-access";
const GROUPS = [
  { title: "Getting around", keys: ["lift", "escalator", "ramp_entry", "ramp_second", "ramp_fob", "battery_car", "boarding_ramp"] },
  { title: "Help on hand", keys: ["wheelchair", "wheelchair_booking", "human_assistance", "help_booth"] },
  { title: "Facilities", keys: ["accessible_toilet", "water_booth", "parking", "low_counter", "tactile_path", "braille_signage", "braille_map"] },
];
const STATUS = {
  yes: { mark: "✓", text: "Available" },
  no: { mark: "✕", text: "Not available, according to official data" },
  not_listed: { mark: "–", text: "Not in the official list for this division" },
  unknown: { mark: "?", text: "No data yet" },
};

// Phone numbers in notes become tap-to-call links.
function Note({ text }) {
  const parts = text.split(/\b([6-9]\d{9})\b/);
  return <div className="f-note">{parts.map((p, i) => (i % 2 ? <a key={i} href={`tel:+91${p}`}>{p}</a> : p))}</div>;
}

export default function Station({ data, id }) {
  const st = data.stations.find((s) => s.id === id);
  const labels = useMemo(() => Object.fromEntries(data.features.map((f) => [f.key, f.label])), [data]);
  const div = useMemo(() => data.divisions.find((d) => d.division === st?.division) || {}, [data, st]);
  const title = useRef(null);
  const { user } = useAuth();
  useEffect(() => { if (user && st) pushRecent(user.id, st.id); }, [user?.id, st?.id]);

  useEffect(() => {
    if (!st) return;
    document.title = `${st.name} accessibility · Rail Club`;
    title.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
    window.stationShown = { station: st, labels };
    document.dispatchEvent(new CustomEvent("station:shown", { detail: window.stationShown }));
  }, [st, labels]);

  if (!st) return <div className="wrap"><a className="back" href="#/">← Search another station</a><h1>Station not found</h1><p>It may not be covered yet.</p></div>;

  const counts = { yes: 0, not_listed: 0, unknown: 0 };
  Object.values(st.features).forEach((f) => counts[f.status === "no" ? "not_listed" : f.status]++);
  const issue = `${REPO}/issues/new?title=${encodeURIComponent(`Correction: ${st.name}`)}&body=${encodeURIComponent(`Station: ${st.name}${st.code ? ` (${st.code})` : ""}\n\nWhat is wrong or missing?\n\n`)}`;
  let row = 0;

  return (
    <div className="wrap station-page">
      <a className="back" href="#/">← Search another station</a>
      <div className="st-banner">
        <img src={BANNER.small} srcSet={`${BANNER.small} 960w, ${BANNER.src} ${BANNER.w}w`} sizes="(max-width: 860px) 100vw, 820px" alt="" style={{ objectPosition: BANNER.pos }} />
        <m.div className="board-wrap" initial={{ y: -40, rotate: -3, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 140, damping: 12, mass: 0.9 }}>
          <div className="board">
            <h1 tabIndex={-1} id="st-title" ref={title}>{st.name}</h1>
            {st.code && <span className="st-code" aria-label={`Station code ${st.code}`}>{st.code}</span>}
          </div>
          <div className="posts" aria-hidden="true"><i /><i /></div>
        </m.div>
        <p className="credit"><a href={BANNER.page} target="_blank" rel="noopener">{creditLine(BANNER)}</a></p>
      </div>
      <p className="st-sub"><span>{st.division} division</span><span>{st.zone}</span></p>
      {st.notes && <p className="st-note">{st.notes}</p>}
      {div.method === "secondary" && (
        <div className="caveat">
          <p><strong>Not from an official station list.</strong> {div.method_note} Call 139 or the station before you travel.</p>
          <ul>{(div.sources || []).filter((x) => !st.sources || st.sources.includes(x.url)).map((x) => <li key={x.url}><a href={x.url} target="_blank" rel="noopener">{x.title}</a></li>)}</ul>
        </div>
      )}
      <div className="summary">
        {[["yes", "available"], ["not_listed", "not available"], ["unknown", "no data yet"]].map(([k, label], n) => (
          <m.div key={k} className={k} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.15 + n * 0.07, type: "spring", stiffness: 260, damping: 22 }}>
            <strong>{counts[k]}</strong><span>{label}</span>
          </m.div>
        ))}
      </div>
      {GROUPS.map((g) => (
        <section className="group" aria-labelledby={`g-${g.keys[0]}`} key={g.title}>
          <h2 id={`g-${g.keys[0]}`}>{g.title}</h2>
          <ul className="feat">
            {g.keys.map((k) => {
              const f = st.features[k] || { status: "unknown" };
              const s = STATUS[f.status];
              const i = row++;
              return (
                <m.li key={k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.03, duration: 0.4 }}>
                  <span className={`mark ${f.status}`} aria-hidden="true">{s.mark}</span>
                  <div>
                    <div className="f-label">{labels[k] || k}</div>
                    <div className="f-status">{s.text}</div>
                    {f.note && <Note text={f.note} />}
                  </div>
                </m.li>
              );
            })}
          </ul>
        </section>
      ))}
      <div id="visitor-slot" />
      <a className="report" href={issue} target="_blank" rel="noopener">Something wrong or missing? Tell us</a>
      <p className="src">
        Source: <a href={div.source_url || "#"} target="_blank" rel="noopener">{div.source_title || "Indian Railways"}</a>, checked {div.retrieved || ""}.{" "}
        {Object.values(st.features).some((f) => f.status === "unknown") && "“No data yet” means this division hasn't published that detail by station. "}
        {div.method !== "secondary" && div.method_note}
      </p>
    </div>
  );
}
