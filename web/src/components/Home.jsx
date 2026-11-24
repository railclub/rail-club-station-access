import { useState } from "react";
import { m } from "motion/react";
import { REDUCED } from "../util.js";
import { BANNER, GALLERY, PHOTOS, srcSet } from "../photos.js";
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

const CHAT = [
  ["Priya #a1b2", "gold", "Is the 8:15 fast to Churchgate running late?"],
  ["Ravi #c9d0", "blue", "About 10 min, it just left Vile Parle"],
  [null, "me", "Thanks! Which platform for slow trains?"],
  ["Anil #77f2", "green", "PF 2, near the lift at the north end"],
];

function Num({ value, children }) {
  const [ref, v] = useCountUp(value);
  return <div className="ha-num" ref={ref}><b>{v.toLocaleString("en-IN")}</b><span>{children}</span></div>;
}

export default function Home({ data }) {
  const { user } = useAuth();
  const all = data?.stations || [];
  const full = all.filter((s) => !s.basic);
  const [paused, setPaused] = useState(REDUCED);

  return (
    <div className={paused ? "ha paused" : "ha"}>
      <Hero stations={data?.stations} paused={paused} setPaused={setPaused} />

      {user && data && <div className="ha-foryou"><div className="ha-in"><ForYou user={user} stations={full} /></div></div>}

      <section id="guide" className="ha-sec" aria-labelledby="guide-title">
        <div className="ha-in ha-two">
          <m.div className="ha-tile ha-tall" {...inView()}>
            <img className="ha-kb" src={BANNER.src} srcSet={srcSet(BANNER)} sizes="(max-width: 900px) 100vw, 50vw" alt="" loading="lazy" decoding="async" style={{ objectPosition: BANNER.pos }} />
          </m.div>
          <div className="ha-col">
            <m.p className="ha-eyebrow" {...inView()}>Station guide</m.p>
            <m.h2 id="guide-title" className="ha-h2" {...inView(0.05)}>Know the station before you step onto it.</m.h2>
            <m.p className="ha-lede" {...inView(0.1)}>Mostly from the railways' own lists: which stations have lifts, ramps, wheelchairs and accessible toilets, plus paid lounges and cloak rooms where a railway page, news report or map shows one.</m.p>
            <div className="ha-facs">
              {FACS.map(([key, icon, label, sub], n) => (
                <m.a key={key} className="ha-fac" href={`#/facilities/${key}`} {...inView(0.04 * n)}>
                  <span className="ha-fic"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ICON[icon]}</svg></span>
                  <span><b>{label}</b><small>{sub}</small></span>
                </m.a>
              ))}
            </div>
            {data && (
              <p className="ha-count"><b>{full.length.toLocaleString("en-IN")}</b> stations with full facility lists · <b>{all.length.toLocaleString("en-IN")}</b> to search</p>
            )}
          </div>
        </div>
      </section>

      <section id="journey" className="ha-sec ha-photo" aria-labelledby="journey-title">
        <img className="ha-bg ha-kb" src={PHOTOS.dudhsagarTall.src} srcSet={srcSet(PHOTOS.dudhsagarTall)} sizes="100vw" alt="" loading="lazy" decoding="async" style={{ objectPosition: PHOTOS.dudhsagarTall.pos }} />
        <div className="ha-shade-left" aria-hidden="true" />
        <div className="ha-in ha-two">
          <div>
            <m.p className="ha-eyebrow" {...inView()}>Journey Partner</m.p>
            <m.h2 id="journey-title" className="ha-h2" {...inView(0.05)}>Know which window to look out of.</m.h2>
            <m.p className="ha-lede" {...inView(0.1)}>Pick your train and where you get on and off. We follow the line and tell you when each waterfall, fort, river and tunnel comes, and on which side.</m.p>
            <m.a className="ha-btn" href="#/journeys" {...inView(0.15)}>Plan my journey</m.a>
          </div>
          <m.a className="ha-card ha-tl" href="#/journeys/11007/CSMT/PUNE" {...inView(0.1)}>
            <p className="ha-tl-head">Example · 11007 Deccan Express · Mumbai CSMT → Pune</p>
            <p className="ha-tl-big">Sit on the <span>RIGHT</span></p>
            <ol>
              {TIMELINE.map(([t, dot, name, side]) => (
                <li key={name}>
                  <time>{t}</time><i className={`ha-dot ${dot}`} />
                  <span><b>{name}</b>{side && (/^(LEFT|RIGHT)$/.test(side) ? <em className="ha-side">{side}</em> : <small> {side}</small>)}</span>
                </li>
              ))}
            </ol>
            <span className="ha-tl-go">See every sight on this line <span aria-hidden="true">→</span></span>
          </m.a>
        </div>
      </section>

      <section id="chat" className="ha-sec ha-alt" aria-labelledby="chat-title">
        <div className="ha-in ha-two">
          <m.div className="ha-chat" {...inView()}>
            <img src={PHOTOS.mumbaiLocal.small} alt="" loading="lazy" decoding="async" />
            <div className="ha-chat-in" aria-label="An example conversation" role="img">
              <p className="ha-live"><i className="ha-pulse" />Example: live at Santa Cruz</p>
              {CHAT.map(([who, tone, text], n) => (
                <m.p key={n} className={`ha-bub ${tone}`} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "0px 0px -15% 0px" }} transition={{ duration: 0.6, delay: 0.3 + 0.6 * n }}>{who && <><b>{who}</b><br /></>}{text}</m.p>
              ))}
            </div>
          </m.div>
          <div>
            <m.p className="ha-eyebrow" {...inView()}>Station chat</m.p>
            <m.h2 id="chat-title" className="ha-h2" {...inView(0.05)}>Ask the people on your platform.</m.h2>
            <m.p className="ha-lede" {...inView(0.1)}>A live room for every station, open only to people who are there. Is the train late? Which platform? Has anyone seen a lost bag?</m.p>
            <ul className="ha-points">
              <li>Your phone's location lets you in, and is never shared</li>
              <li>Nicknames only; links and phone numbers are blocked</li>
              <li>Messages vanish after 2 hours</li>
            </ul>
            <m.a className="ha-btn" href="#/s/santa-cruz" {...inView(0.15)}>Open a station chat</m.a>
          </div>
        </div>
      </section>

      <section className="ha-sec" aria-labelledby="lines-title">
        <div className="ha-in">
          <m.p className="ha-eyebrow ha-c" {...inView()}>Journeys worth the window seat</m.p>
          <m.h2 id="lines-title" className="ha-h2 ha-c" {...inView(0.05)}>India's most beautiful lines</m.h2>
          <ul className="ha-gallery">
            {GALLERY.map(({ p, name, cls }, n) => (
              <m.li key={name} className={`ha-tile${cls ? ` ${cls}` : ""}`} {...inView(0.05 * n)}>
                <a href="#/journeys">
                  <img src={p.small} srcSet={srcSet(p)} sizes="(max-width: 900px) 100vw, 40vw" alt="" loading="lazy" decoding="async" style={{ objectPosition: p.pos }} />
                  <span>{name}</span>
                </a>
              </m.li>
            ))}
          </ul>
        </div>
      </section>

      <section className="ha-sec ha-photo ha-end" aria-labelledby="end-title">
        <img className="ha-bg ha-dim" src={PHOTOS.csmt.small} srcSet={srcSet(PHOTOS.csmt)} sizes="100vw" alt="" loading="lazy" decoding="async" />
        <div className="ha-in">
          {data && (
            <div className="ha-nums">
              <Num value={all.length}>stations</Num>
              <div className="ha-num"><b>5,000+</b><span>trains</span></div>
              <Num value={full.length}>full facility lists</Num>
              <div className="ha-num"><b>₹0</b><span>always free</span></div>
            </div>
          )}
          <m.h2 id="end-title" className="ha-h2" {...inView()}>Your next journey starts at the station.</m.h2>
          <div className="ha-btns">
            <a className="ha-btn" href="#/" onClick={(e) => { e.preventDefault(); const q = document.getElementById("q"); q?.scrollIntoView({ block: "center", behavior: "smooth" }); q?.focus({ preventScroll: true }); }}>Find my station</a>
            {!user && <button type="button" className="ha-btn ghost" onClick={() => signIn().catch(() => {})}>Sign in with Google</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
