import { useEffect, useMemo } from "react";
import { m } from "motion/react";
import { GROUPS, Legend } from "../facilities.jsx";

// The facilities Rail Club tracks, with how many stations have each one marked as available.
export default function Facilities({ data }) {
  const labels = useMemo(() => Object.fromEntries(data.features.map((f) => [f.key, f.label])), [data]);
  const counts = useMemo(() => {
    const c = {};
    for (const s of data.stations) for (const [k, f] of Object.entries(s.features)) if (f.status === "yes") c[k] = (c[k] || 0) + 1;
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
        <p className="page-lede"><b>{data.features.length}</b> facilities, checked for each of {total} stations. Pick one to see the stations that have it.</p>
      </m.div>
      {GROUPS.map((g) => (
        <section className="group" key={g.title} aria-labelledby={`fg-${g.keys[0]}`}>
          <h2 id={`fg-${g.keys[0]}`}>{g.title}</h2>
          <ul className="feat fac-list">
            {g.keys.map((k) => {
              const n = counts[k] || 0, i = row++;
              return (
                <m.li key={k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.025, duration: 0.4 }}>
                  <a href={`#/facilities/${k}`}>
                    <span className="fac-name">{labels[k] || k}</span>
                    <span className="fac-count">{n ? `Available at ${n} station${n === 1 ? "" : "s"}` : "Not marked as available anywhere yet"}</span>
                    <span className="fac-bar" aria-hidden="true"><i style={{ width: `${Math.max(n ? 2 : 0, (n / total) * 100)}%` }} /></span>
                    <span className="fac-go" aria-hidden="true">→</span>
                  </a>
                </m.li>
              );
            })}
          </ul>
        </section>
      ))}
      <section className="group" aria-labelledby="fg-key">
        <h2 id="fg-key">What the marks mean on a station page</h2>
        <Legend />
      </section>
    </div>
  );
}
