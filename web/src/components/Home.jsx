import { m } from "motion/react";
import { BANNER, LINES, PHOTOS, srcSet } from "../photos.js";
import { useCountUp } from "../hooks.js";
import Hero from "./Hero.jsx";
import { getRecent, profile, signIn, useAuth, useMyReports } from "../auth.js";

const inView = (d = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "0px 0px -10% 0px" },
  transition: { duration: 0.7, delay: d, ease: [0.22, 0.8, 0.24, 1] },
});
export function Board({ st, big = false }) {
  return (
    <span className={`irb-face${big ? " big" : ""}`}>
      <span className="irb-name">{st.name}</span>
      {st.code && <span className="irb-code">{st.code}</span>}
    </span>
  );
}

// Shown only when signed in: the person's recent stations and a way into their contributions.
function ForYou({ user, stations }) {
  const { rows } = useMyReports(user);
  const who = profile(user);
  const recent = getRecent(user.id).map((id) => stations.find((s) => s.id === id)).filter(Boolean).slice(0, 3);
  const published = (rows || []).filter((r) => r.status === "published").length;
  return (
    <m.section className="foryou" aria-labelledby="foryou-title" {...inView()}>
      <div className="foryou-head">
        <div>
          <p className="kicker hi" lang="hi">आपके लिए</p>
          <h2 id="foryou-title" className="block-title">For you, {who.first}</h2>
        </div>
        <a className="foryou-link" href="#/me">
          <b>{rows ? rows.length : "–"}</b> video{rows?.length === 1 ? "" : "s"} sent · <b>{rows ? published : "–"}</b> published<span aria-hidden="true"> →</span>
        </a>
      </div>
      {recent.length > 0 ? (
        <div className="boards">
          {recent.map((s) => (
            <m.a key={s.id} className="irboard" href={`#/s/${s.id}`} whileHover={{ y: -6 }} whileTap={{ scale: 0.97 }}>
              <Board st={s} /><span className="irb-posts" aria-hidden="true"><i /><i /></span>
            </m.a>
          ))}
        </div>
      ) : (
        <p className="foryou-empty">Stations you open will appear here, so the ones you use are always one tap away.</p>
      )}
    </m.section>
  );
}

const ICON = {
  lift: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 9l3-3 3 3M9 15l3 3 3-3" /></>,
  ramp: <path d="M3 19h18L3 9z" />,
  wheelchair: <><circle cx="11" cy="4" r="2" /><path d="M11 7v6h5l2 6M11 10H7M8 13a5 5 0 1 0 7 6" /></>,
  lounge: <><path d="M4 11h16v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M7 11V5h10v6" /></>,
  cloak: <><rect x="4" y="7" width="16" height="13" rx="2" /><path d="M9 7V4h6v3" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17.5v.01" /></>,
};
const FACS = [
  ["lift", "lift", "Lifts", "for passengers"],
  ["ramp_entry", "ramp", "Ramps", "at the main entry"],
  ["wheelchair", "wheelchair", "Wheelchairs", "at the station"],
  ["lounge", "lounge", "Lounges", "paid, by the hour"],
  ["cloak_room", "cloak", "Cloak rooms", "leave your bags"],
  ["help_booth", "help", "Help desks", "and enquiry booths"],
];

// A real example from Journey Partner: 11007 Deccan Express, Mumbai CSMT to Pune. Station times are the timetable's;
// sight times are worked out from where each sight is on the line (data/journey/csmt-pune.json), between the stops.
const TIMELINE = [
  ["08:58", "", "Karjat", null],
  ["≈09:08", "grey", "Bhor Ghat begins", "20+ tunnels, both sides"],
  ["≈09:25", "green", "Rajmachi forts", "LEFT"],
  ["≈09:38", "green", "Duke's Nose", "RIGHT"],
  ["09:40", "", "Khandala", null],
  ["≈09:44", "blue", "Kune Falls (Jun–Sep)", "LEFT"],
  ["09:48", "", "Lonavala", null],
  ["≈09:55", "green", "Lohagad Fort", "RIGHT"],
];

// How station chat works, as shown under the hero (checked against StationChat.jsx and the chat migrations).
const STEPS = [
  ["Be at the station", "Open the station's page, or tap “Find my station's chat”. Sign in with Google."],
  ["Let your phone check", "Your location is checked against the station once, then every few minutes. It's never shown or kept."],
  ["Say hello", "You chat under a nickname you can change. Ask, answer, or open a private room for your group."],
];
const SAFE = [
  "Links and phone numbers are blocked",
  "Messages vanish after 2 hours",
  "Report or block anyone from any message",
];

function Num({ value, children }) {
  const [ref, v] = useCountUp(value);
  return <div className="hb-num" ref={ref}><b>{v.toLocaleString("en-IN")}</b><span>{children}</span></div>;
}

export default function Home({ data }) {
  const { user } = useAuth();
  const all = data?.stations || [];
  const full = all.filter((s) => !s.basic);
  const toSearch = (e) => { e.preventDefault(); const q = document.getElementById("q"); q?.scrollIntoView({ block: "center", behavior: "smooth" }); q?.focus({ preventScroll: true }); };

  return (
    <div className="hb">
      <Hero stations={data?.stations} />

      {user && data && <div className="hb-foryou"><div className="hb-in"><ForYou user={user} stations={full} /></div></div>}

      <section className="hb-sec hb-how" aria-labelledby="how-title">
        <div className="hb-in hb-two">
          <div>
            <m.p className="hb-kicker" {...inView()}>Station chat</m.p>
            <m.h2 id="how-title" className="hb-h2" {...inView(0.05)}>Only people at the station can join.</m.h2>
            <ol className="hb-steps">
              {STEPS.map(([t, d], n) => (
                <m.li key={t} {...inView(0.08 * n)}><span className="hb-step-n">{n + 1}</span><div><b>{t}</b><p>{d}</p></div></m.li>
              ))}
            </ol>
            <ul className="hb-safe">{SAFE.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
          <m.figure className="hb-photo hb-photo-tall" {...inView(0.1)}>
            <img src={PHOTOS.mumbaiLocal.small} srcSet={srcSet(PHOTOS.mumbaiLocal)} sizes="(max-width: 900px) 100vw, 45vw" alt="" loading="lazy" decoding="async" />
            <figcaption>Somebody on your platform probably knows the answer.</figcaption>
          </m.figure>
        </div>
      </section>

      <section id="guide" className="hb-sec hb-guide" aria-labelledby="guide-title">
        <div className="hb-in hb-two">
          <div className="hb-collage">
            <m.img className="hb-c1" src={BANNER.small} srcSet={srcSet(BANNER)} sizes="(max-width: 900px) 90vw, 40vw" alt="" loading="lazy" decoding="async" style={{ objectPosition: BANNER.pos }} {...inView()} />
            <m.img className="hb-c2" src={PHOTOS.csmt.small} srcSet={srcSet(PHOTOS.csmt)} sizes="(max-width: 900px) 60vw, 26vw" alt="" loading="lazy" decoding="async" {...inView(0.12)} />
            {data && <m.p className="hb-chip" {...inView(0.2)}><b>{full.length.toLocaleString("en-IN")}</b> stations with full facility lists</m.p>}
          </div>
          <div>
            <m.p className="hb-kicker" {...inView()}>Station guide</m.p>
            <m.h2 id="guide-title" className="hb-h2" {...inView(0.05)}>Know the station before you step onto it.</m.h2>
            <m.p className="hb-lede" {...inView(0.1)}>Mostly from the railways' own lists: which stations have lifts, ramps, wheelchairs and accessible toilets, plus paid lounges and cloak rooms where a railway page, news report or map shows one.</m.p>
            <div className="hb-facs">
              {FACS.map(([key, icon, label, sub], n) => (
                <m.a key={key} className="hb-fac" href={`#/facilities/${key}`} {...inView(0.04 * n)}>
                  <span className="hb-fic"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ICON[icon]}</svg></span>
                  <b>{label}</b><small>{sub}</small>
                </m.a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="journey" className="hb-sec hb-journey" aria-labelledby="journey-title">
        <div className="hb-in">
          <div className="hb-journey-head">
            <div>
              <m.p className="hb-kicker" {...inView()}>Journey Partner</m.p>
              <m.h2 id="journey-title" className="hb-h2" {...inView(0.05)}>Know which window to look out of.</m.h2>
            </div>
            <m.div {...inView(0.1)}>
              <p className="hb-lede">Pick your train and where you get on and off. We follow the line and tell you when each waterfall, fort, river and tunnel comes, and on which side.</p>
              <a className="hb-btn" href="#/journeys">Plan my journey</a>
            </m.div>
          </div>
          <div className="hb-jgrid">
            <m.a className="hb-tl" href="#/journeys/11007/CSMT/PUNE" {...inView()}>
              <p className="hb-tl-head">Example · 11007 Deccan Express · Mumbai CSMT → Pune</p>
              <p className="hb-tl-big">Sit on the <span>RIGHT</span></p>
              <ol>
                {TIMELINE.map(([t, dot, name, side]) => (
                  <li key={name}>
                    <time>{t}</time><i className={`hb-tdot ${dot}`} />
                    <span><b>{name}</b>{side && (/^(LEFT|RIGHT)$/.test(side) ? <em className="hb-side">{side}</em> : <small> {side}</small>)}</span>
                  </li>
                ))}
              </ol>
              <span className="hb-tl-go">See every sight on this line <span aria-hidden="true">→</span></span>
            </m.a>
            {LINES.map(({ p, name, cls }, n) => (
              <m.a key={name} className={`hb-line${cls ? ` ${cls}` : ""}`} href="#/journeys" {...inView(0.06 * n)}>
                <img src={p.small} srcSet={srcSet(p)} sizes="(max-width: 900px) 100vw, 30vw" alt="" loading="lazy" decoding="async" style={{ objectPosition: p.pos }} />
                <span>{name}</span>
              </m.a>
            ))}
          </div>
        </div>
      </section>

      <section className="hb-sec hb-end" aria-labelledby="end-title">
        <div className="hb-in">
          <div className="hb-banner">
            <img src={PHOTOS.sleeperFront.small} srcSet={srcSet(PHOTOS.sleeperFront)} sizes="100vw" alt="" loading="lazy" decoding="async" style={{ objectPosition: PHOTOS.sleeperFront.pos }} />
            <div className="hb-banner-in">
              {data && (
                <div className="hb-nums">
                  <Num value={all.length}>stations</Num>
                  <div className="hb-num"><b>5,000+</b><span>trains</span></div>
                  <Num value={full.length}>full facility lists</Num>
                  <div className="hb-num"><b>₹0</b><span>always free</span></div>
                </div>
              )}
              <m.h2 id="end-title" className="hb-h2" {...inView()}>Your next journey starts at the station.</m.h2>
              <div className="hb-btns">
                <a className="hb-btn" href="#/" onClick={toSearch}>Find my station</a>
                {!user && <button type="button" className="hb-btn ghost" onClick={() => signIn().catch(() => {})}>Sign in with Google</button>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
