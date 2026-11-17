import { useEffect, useMemo } from "react";
import { m } from "motion/react";
import { AMENITY_TITLE, GROUPS, Legend, hasAmenity } from "../facilities.jsx";

// One facility or amenity: its name, how many stations have it, and a bar for the share.
function Row({ k, label, n, total, i, none }) {
  return (
    <m.li initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.025, duration: 0.4 }}>
      <a href={`#/facilities/${k}`}>
        <span className="fac-name">{label}</span>
        <span className="fac-count">{n ? `Available at ${n} station${n === 1 ? "" : "s"}` : none}</span>
        <span className="fac-bar" aria-hidden="true"><i style={{ width: `${Math.max(n ? 2 : 0, (n / total) * 100)}%` }} /></span>
        <span className="fac-go" aria-hidden="true">→</span>
      </a>
    </m.li>
  );
}

// The facilities Rail Club tracks, with how many stations have each one marked as available.
export default function Facilities({ data }) {
  const labels = useMemo(() => Object.fromEntries(data.features.map((f) => [f.key, f.label])), [data]);
  const amenities = data.amenities || [];
  const counts = useMemo(() => {
    const c = {};
    for (const s of data.stations) {
      for (const [k, f] of Object.entries(s.features)) if (f.status === "yes") c[k] = (c[k] || 0) + 1;
      for (const a of data.amenities || []) if (hasAmenity(s, a.key)) c[a.key] = (c[a.key] || 0) + 1;
    }
    return c;
  }, [data]);
  const total = data.stations.length;
  useEffect(() => { document.title = "Facilities we track · Rail Club"; window.scrollTo({ top: 0 }); }, []);
  let row = 0;

  return (
    <div className="wrap page">
      <a className="back" href="#/">← Back to search</a>
      <m.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <p className="kicker hi" lang="hi">सुविधाएँ</p>
        <h1 className="page-title">Facilities we track</h1>
        <p className="page-lede">
          <b>{data.features.length}</b> accessibility facilities, checked for each of {total} stations
          {amenities.length > 0 && <>, and <b>{amenities.length}</b> amenities for every traveller</>}. Pick one to see the stations that have it.
        </p>
      </m.div>
      {GROUPS.map((g) => (
        <section className="group" key={g.title} aria-labelledby={`fg-${g.keys[0]}`}>
          <h2 id={`fg-${g.keys[0]}`}>{g.title}</h2>
          <ul className="feat fac-list">
            {g.keys.map((k) => <Row key={k} k={k} label={labels[k] || k} n={counts[k] || 0} total={total} i={row++} none="Not marked as available anywhere yet" />)}
          </ul>
        </section>
      ))}
      {amenities.length > 0 && (
        <section className="group" aria-labelledby="fg-amenities">
          <h2 id="fg-amenities">{AMENITY_TITLE}</h2>
          <p className="group-lede">Not part of the official accessibility lists. We mark a station only when a railway page, news report or map shows it, so many stations that have one aren't marked yet.</p>
          <ul className="feat fac-list">
            {amenities.map((a) => <Row key={a.key} k={a.key} label={a.label} n={counts[a.key] || 0} total={total} i={row++} none="No station marked yet" />)}
          </ul>
        </section>
      )}
      <section className="group" aria-labelledby="fg-key">
        <h2 id="fg-key">What the marks mean on a station page</h2>
        <Legend />
      </section>
    </div>
  );
}
