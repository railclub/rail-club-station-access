import { useState } from "react";
import { m } from "motion/react";
import { SLIDES, srcSet } from "../photos.js";
import { REDUCED } from "../util.js";
import { CHAT_M, MAX_ACCURACY_M, nearestStation } from "../nearest.js";
import Search from "./Search.jsx";
import { locate } from "./StationChat.jsx";
import { profile, useAuth } from "../auth.js";

const rise = (d) => ({ initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0, transition: { duration: 0.7, delay: d, ease: [0.22, 0.8, 0.24, 1] } } });
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

// An example of a station chat, shown over the photos.
const EXAMPLE = [
  ["Priya #a1b2", "a", "Is the 8:15 fast to Churchgate running late?"],
  ["Ravi #c9d0", "b", "About 10 min, it just left Vile Parle"],
  [null, "me", "Thanks! Which platform for slow trains?"],
  ["Anil #77f2", "c", "PF 2, near the lift at the north end"],
];

// "Find my station's chat": the phone's location, used here in the browser only, picks the nearest station
// and opens its page at the chat. Joining the chat there checks the location properly (station-pass).
function ChatFinder({ stations }) {
  const [s, setS] = useState({ phase: "idle" });
  const busy = s.phase === "locating";
  const find = async () => {
    if (busy || !stations) return;
    setS({ phase: "locating" });
    try {
      const fix = await locate(12000);
      const best = await nearestStation(fix, stations);
      if (fix.accuracy_m > MAX_ACCURACY_M) return setS({ phase: "rough", best, accuracy: fix.accuracy_m });
      if (best && best.m <= CHAT_M) { location.hash = `#/s/${best.st.id}/chat`; return; }
      setS({ phase: "far", best });
    } catch (e) {
      setS({ phase: "error", message: e.message || "We couldn't get your location." });
    }
  };
  const near = (best) => <a href={`#/s/${best.st.id}/chat`}>{best.st.name}</a>;
  return (
    <div className="hb-finder">
      <button type="button" className="hb-btn" onClick={find} aria-disabled={busy || !stations}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></svg>
        {busy ? "Finding your station…" : "Find my station's chat"}
      </button>
      <p className="hb-note">Uses your phone's location once, on this phone, to find the nearest station. It isn't sent anywhere.</p>
      <p className="hb-msg" role="status" aria-live="polite">
        {s.phase === "far" && (!s.best ? <>We couldn't find a station near you.</>
          : s.best.m <= 2000 ? <>You seem to be near {near(s.best)}, {km(s.best.m)} away. Its chat lets you in once you're at the station.</>
          : <>You don't seem to be at a station: the nearest is {near(s.best)}, {km(s.best.m)} away. Its chat opens when you're there.</>)}
        {s.phase === "rough" && <>Your phone only knows roughly where you are (to within {km(s.accuracy)}){s.best && <>, near {near(s.best)}</>}. Step outside or turn on precise location, then try again.</>}
        {s.phase === "error" && s.message}
      </p>
    </div>
  );
}

// Home page hero: station chat first, then the station search; photos and an example chat on the right.
export default function Hero({ stations }) {
  const { user } = useAuth();
  const [paused, setPaused] = useState(REDUCED);

  return (
    <section className="hb-hero" aria-labelledby="hb-title">
      <div className="hb-in hb-hero-in">
        <div className="hb-copy">
          <m.p className="hb-live" {...rise(0)}><i className="hb-dot" aria-hidden="true" />{user ? `Welcome back, ${profile(user).first} · ` : "New · "}Station chat is live</m.p>
          <m.h1 id="hb-title" className="hb-h1" {...rise(0.06)}>Talk to the people <span>on your platform.</span></m.h1>
          <m.p className="hb-lede" {...rise(0.12)}>A live chat room for each of over 8,000 Indian railway stations, open only to people who are there right now. Ask if the train is late, which platform, or where the lift is.</m.p>
          <m.div {...rise(0.18)}><ChatFinder stations={stations} /></m.div>
          <m.div className="hb-search" {...rise(0.24)}>
            <p className="hb-or"><span>or look up any station</span></p>
            <Search stations={stations} />
          </m.div>
        </div>

        <m.div className={`hb-visual${paused ? " paused" : ""}`} {...rise(0.1)}>
          <div className="hb-frame" aria-hidden="true">
            {SLIDES.map((p, n) => (
              <img key={p.src} className={`hb-slide n${n + 1}`} src={p.src} srcSet={srcSet(p)} sizes="(max-width: 900px) 100vw, 46vw" alt=""
                style={{ objectPosition: p.pos }} fetchPriority={n === 0 ? "high" : "low"} decoding="async" />
            ))}
          </div>
          <div className="hb-phone" role="img" aria-label="An example station chat at Santa Cruz">
            <p className="hb-phone-head"><i className="hb-dot" aria-hidden="true" /><b>Santa Cruz</b><span>Example</span></p>
            {EXAMPLE.map(([who, tone, text], n) => (
              <m.p key={n} className={`hb-bub ${tone}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.8 + 0.9 * n }}>
                {who && <b>{who}</b>}{text}
              </m.p>
            ))}
          </div>
          {!REDUCED && (
            <button type="button" className="pause hb-pause" aria-pressed={paused} aria-label="Pause the photos" onClick={() => setPaused((p) => !p)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path className="i-pause" d="M8 5v14M16 5v14" /><path className="i-play" d="M8 5l11 7-11 7z" /></svg>
            </button>
          )}
        </m.div>
      </div>
    </section>
  );
}
