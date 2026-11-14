import { m } from "motion/react";
import { CARDS } from "../photos.js";
import { countYes } from "../util.js";
import { useCountUp } from "../hooks.js";
import { getRecent, profile, useAuth, useMyReports } from "../auth.js";

// Well-known stations shown as quick picks, when they're in the data.
const POPULAR = ["CSMT", "NDLS", "HWH", "MAS", "SBC", "ADI", "PUNE", "LKO", "SC", "BCT", "KYN", "NGP"];
const inView = (d = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "0px 0px -10% 0px" },
  transition: { duration: 0.7, delay: d, ease: [0.22, 0.8, 0.24, 1] },
});
// Card spotlight follows the pointer (CSS reads --mx/--my).
const spot = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};

function Stat({ value, children }) {
  const [ref, v] = useCountUp(value);
  return <div className="stat" ref={ref} onPointerMove={spot}><strong>{v.toLocaleString("en-IN")}</strong><span>{children}</span></div>;
}

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

export default function Home({ data }) {
  const { user } = useAuth();
  const stations = data?.stations || [];
  const picks = POPULAR.map((c) => stations.find((s) => s.code === c)).filter(Boolean);
  for (const s of [...stations].sort((a, b) => countYes(b) - countYes(a))) {
    if (picks.length >= 8) break;
    if (!picks.includes(s)) picks.push(s);
  }

  return (
    <div className="wrap">
      <m.div className="legend" aria-label="What the marks mean" {...inView()}>
        <span className="pill yes"><b aria-hidden="true">✓</b> Available</span>
        <span className="pill no"><b aria-hidden="true">✕</b> Not available</span>
        <span className="pill not_listed"><b aria-hidden="true">–</b> Not in official list</span>
        <span className="pill unknown"><b aria-hidden="true">?</b> No data yet</span>
      </m.div>

      {user && data && <ForYou user={user} stations={stations} />}

      <section className="block" aria-labelledby="quick-title">
        <m.p className="kicker hi" lang="hi" {...inView()}>लोकप्रिय स्टेशन</m.p>
        <m.h2 id="quick-title" className="block-title" {...inView(0.05)}>Popular stations</m.h2>
        <div className="boards">
          {picks.slice(0, 8).map((s, n) => (
            <m.a key={s.id} className="irboard" href={`#/s/${s.id}`} {...inView(0.04 * n)}
              whileHover={{ y: -6, rotate: n % 2 ? 0.8 : -0.8 }} whileTap={{ scale: 0.97 }}>
              <Board st={s} />
              <span className="irb-posts" aria-hidden="true"><i /><i /></span>
            </m.a>
          ))}
        </div>
      </section>

      {data && (
        <m.section className="stats" aria-label="Coverage so far" {...inView()}>
          <Stat value={data.stations.length}>stations covered</Stat>
          <Stat value={data.divisions.length}>railway divisions <span className="hi" lang="hi">मंडल</span></Stat>
          <Stat value={data.features.length}>facilities tracked</Stat>
        </m.section>
      )}

      <section className="block" aria-labelledby="what-title">
        <m.p className="kicker hi" lang="hi" {...inView()}>रेल क्लब क्या करता है</m.p>
        <m.h2 id="what-title" className="block-title" {...inView(0.05)}>What Rail Club does</m.h2>
        <div className="bento">
          <m.article className="pcard big" onPointerMove={spot} {...inView(0)}>
            <div className="pcard-img"><img src={CARDS.station.small} alt="" loading="lazy" decoding="async" style={{ objectPosition: CARDS.station.pos }} /></div>
            <div className="pcard-body">
              <span className="tag live">Live</span>
              <p className="kicker hi" lang="hi">स्टेशन सुविधाएँ</p>
              <h3>Station access, before you leave home</h3>
              <p>Lifts, ramps, wheelchairs and accessible toilets for every station we cover, with the official source for each fact and the date we checked it.</p>
              <a className="pcard-cta" href="#q">Search a station →</a>
            </div>
          </m.article>
          <m.article className="pcard" onPointerMove={spot} {...inView(0.08)}>
            <div className="pcard-img"><img src={CARDS.journey.small} alt="" loading="lazy" decoding="async" style={{ objectPosition: CARDS.journey.pos }} /></div>
            <div className="pcard-body">
              <span className="tag soon">Coming soon</span>
              <p className="kicker hi" lang="hi">यात्रा साथी</p>
              <h3>Journey Partner</h3>
              <p>Enter your train and see waterfalls, rivers and forts on the way, with the time and which side to look.</p>
            </div>
          </m.article>
          <m.article className="pcard" onPointerMove={spot} {...inView(0.16)}>
            <div className="pcard-img"><img src={CARDS.travellers.small} alt="" loading="lazy" decoding="async" style={{ objectPosition: CARDS.travellers.pos }} /></div>
            <div className="pcard-body">
              <span className="tag new">New</span>
              <p className="kicker hi" lang="hi">यात्रियों की नज़र से</p>
              <h3>Seen by travellers</h3>
              <p>Film a lift or ramp at your station. Every video is checked before it adds a "Seen by a visitor" mark.</p>
            </div>
          </m.article>
        </div>
      </section>
    </div>
  );
}
