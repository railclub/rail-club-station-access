import { useMemo, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { countYes, search } from "../util.js";

// Accessible combobox: type, arrow keys to move, Enter to open, Escape to clear.
export default function Search({ stations }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => (stations ? search(stations, query) : []), [stations, query]);
  const open = (st) => { if (st) location.hash = `#/s/${st.id}`; };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % Math.max(results.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + results.length) % Math.max(results.length, 1)); }
    else if (e.key === "Enter") { e.preventDefault(); open(results[active]); }
    else if (e.key === "Escape") { setQuery(""); }
  };

  const status = !stations ? "Loading stations…"
    : !query.trim() ? `${stations.length} stations so far`
    : results.length ? `${results.length} match${results.length > 1 ? "es" : ""}. Use arrow keys and Enter to open.`
    : "No station found. We only cover some divisions so far.";

  return (
    <div className="search-card">
      <div className="search" role="search">
        <label htmlFor="q" className="search-label">Find a station <span className="hi" lang="hi">स्टेशन खोजें</span></label>
        <div className="search-box">
          <svg className="search-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
          <input id="q" type="search" autoComplete="off" spellCheck="false" placeholder="Name or code, e.g. Howrah, HWH"
            role="combobox" aria-expanded={results.length > 0} aria-controls="results" aria-autocomplete="list"
            aria-activedescendant={results.length ? `opt-${active}` : undefined}
            value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} />
        </div>
        <ul id="results" role="listbox" aria-label="Matching stations">
          <AnimatePresence initial={false}>
            {results.map((s, i) => (
              <m.li key={s.id} id={`opt-${i}`} role="option" aria-selected={i === active} layout
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                onMouseEnter={() => setActive(i)} onClick={() => open(s)}>
                <span>
                  <span className="r-name">{s.name}</span>{s.code && <> <span className="r-code">{s.code}</span></>}
                  <br /><span className="r-meta">{s.division} division · {s.zone}</span>
                </span>
                <span className="r-score">{countYes(s)} facilities</span>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
      <p className="hint" aria-live="polite">{status}</p>
    </div>
  );
}
