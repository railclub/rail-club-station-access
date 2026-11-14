import { useEffect } from "react";
import { m } from "motion/react";
import { PHOTOS, creditLine } from "../photos.js";
import { signIn, useAuth } from "../auth.js";

const rise = (d) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: d, ease: [0.22, 0.8, 0.24, 1] } });
const STEPS = [
  ["Open the station you're at", "Search for it, then scroll to “Add a video of this station”."],
  ["Tick what you can film", "A lift, a ramp, an accessible toilet, tactile paving and similar. We only ask for what isn't confirmed yet."],
  ["Sign in and allow location", "Google sign-in stops spam. Your location is checked once, only to confirm you're at the station."],
  ["Record 15 to 60 seconds", "Film the facility, not people. No sound is recorded."],
  ["We check it", "Every video is checked before anything is published. A new contributor's first videos are checked by a person."],
  ["It shows as “Seen by a visitor”", "Only the fact and the date are published. The video is deleted after it has been checked."],
];

export default function Contribute() {
  const p = PHOTOS.sleeperFront;
  const { user } = useAuth();
  useEffect(() => { document.title = "Seen by travellers · Rail Club"; window.scrollTo({ top: 0 }); }, []);
  return (
    <div className="wrap page">
      <a className="back" href="#/">← Back to stations</a>
      <m.div className="page-hero" {...rise(0)}>
        <img src={p.small} srcSet={`${p.small} 960w, ${p.src} ${p.w}w`} sizes="(max-width: 860px) 100vw, 820px" alt="" style={{ objectPosition: p.pos }} />
        <div className="page-hero-text">
          <span className="tag new">New</span>
          <p className="kicker hi" lang="hi">यात्रियों की नज़र से</p>
          <h1>Seen by travellers</h1>
          <p>Official lists miss things. A short video from you tells the next traveller what's really there.</p>
        </div>
        <p className="credit"><a href={p.page} target="_blank" rel="noopener">{creditLine(p)}</a></p>
      </m.div>

      <section className="group" aria-labelledby="c-how">
        <h2 id="c-how">How it works</h2>
        <ol className="steps">
          {STEPS.map(([t, d], n) => (
            <m.li key={t} {...rise(0.1 + n * 0.06)}><span className="step-n" aria-hidden="true">{n + 1}</span><div><b>{t}</b><span>{d}</span></div></m.li>
          ))}
        </ol>
      </section>

      <m.div className="note-card" {...rise(0.5)}>
        <p><b>Ready?</b> You need to be at the station to send a video.</p>
        <div className="note-actions">
          <a className="btn" href="#/">Find a station</a>
          {user ? <a className="btn ghost" href="#/me">My contributions</a>
            : <button type="button" className="btn ghost" onClick={() => signIn()}>Sign in with Google</button>}
        </div>
        <p className="src">More about what we collect and delete: <a href="privacy.html">Privacy</a>.</p>
      </m.div>
    </div>
  );
}
