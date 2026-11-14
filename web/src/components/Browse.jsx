import { useEffect, useMemo, useRef } from "react";
import { m } from "motion/react";
import { slug } from "../facilities.jsx";

// One division: closed by default so the page isn't a wall of 688 links.
function Division({ div, stations, open }) {
  const ref = useRef(null);
  useEffect(() => { if (open && ref.current) ref.current.open = true; }, [open]);
  return (
    <details className="div-card" id={`b-${slug(div.division)}`} ref={ref}>
      <summary><b>{div.division} division</b><span>{stations.length} station{stations.length === 1 ? "" : "s"}</span></summary>
      <p className="src">
        Source: <a href={div.source_url} target="_blank" rel="noopener">{div.source_title || "Indian Railways"}</a>, checked {div.retrieved}.
        {div.method === "secondary" && " Not an official station list; treat as a guide."}
      </p>
      <ul className="st-links">
        {stations.map((s) => <li key={s.id}><a href={`#/s/${s.id}`}>{s.name}{s.code && <small>{s.code}</small>}</a></li>)}
      </ul>
    </details>
  );
}

// Every station by zone and division, with the document each division's facts come from.
// With `feature`, only stations where that facility is available.
export default function Browse({ data, focus, feature }) {
  const label = feature && data.features.find((f) => f.key === feature)?.label;
  const zones = useMemo(() => {
    const keep = (s) => !feature || s.features[feature]?.status === "yes";
    const out = new Map();
    for (const div of [...data.divisions].sort((a, b) => a.zone.localeCompare(b.zone) || a.division.localeCompare(b.division))) {
      const stations = data.stations.filter((s) => s.division === div.division && keep(s)).sort((a, b) => a.name.localeCompare(b.name));
      if (!stations.length) continue;
      if (!out.has(div.zone)) out.set(div.zone, []);
      out.get(div.zone).push({ div, stations });
    }
    return [...out];
  }, [data, feature]);
  const total = zones.reduce((n, [, divs]) => n + divs.reduce((k, d) => k + d.stations.length, 0), 0);
  const divCount = zones.reduce((n, [, divs]) => n + divs.length, 0);

  useEffect(() => {
    document.title = `${label ? `Stations with ${label}` : "All stations"} · Rail Club`;
    const target = focus && document.getElementById(`b-${focus}`);
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0 });
  }, [focus, label]);

  return (
    <div className="wrap page">
      <a className="back" href={feature ? "#/facilities" : "#/"}>← {feature ? "All facilities" : "Back to search"}</a>
      <m.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <p className="kicker hi" lang="hi">{feature ? "सुविधा" : "सभी स्टेशन"}</p>
        <h1 className="page-title">{label ? `Stations with: ${label}` : "All stations"}</h1>
        <p className="page-lede">
          {feature
            ? <><b>{total}</b> of {data.stations.length} stations have this marked as available, in {divCount} division{divCount === 1 ? "" : "s"}. Check at the station before you rely on it.</>
            : <><b>{total}</b> stations in <b>{divCount}</b> railway divisions. Open a division to see its stations and the document its facts come from.</>}
        </p>
      </m.div>
      {!total && <p className="caveat">No station has this marked as available yet.</p>}
      {zones.map(([zone, divs]) => (
        <section className="group" key={zone} id={`b-${slug(zone)}`} aria-labelledby={`z-${slug(zone)}`}>
          <h2 id={`z-${slug(zone)}`}>{zone}</h2>
          {divs.map(({ div, stations }) => (
            <Division key={div.division} div={div} stations={stations} open={focus === slug(div.division) || (feature && stations.length <= 12)} />
          ))}
        </section>
      ))}
    </div>
  );
}
