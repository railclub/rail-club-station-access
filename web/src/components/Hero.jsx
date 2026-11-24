import { m } from "motion/react";
import { SLIDES, srcSet } from "../photos.js";
import { REDUCED } from "../util.js";
import Search from "./Search.jsx";
import { profile, useAuth } from "../auth.js";

const rise = (d) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0, transition: { duration: 0.8, delay: d, ease: [0.22, 0.8, 0.24, 1] } } });

const POPULAR = [
  ["Mumbai CSMT", "chhatrapati-shivaji-maharaj-terminus"],
  ["Howrah", "howrah"],
  ["Pune", "pune"],
  ["Kalyan", "kalyan"],
];

// Full-height hero: four photos crossfade with a slow zoom (pure CSS, 28 s loop), with the station search on top.
// The pause button stops every moving photo on the page (the state lives in Home).
export default function Hero({ stations, paused, setPaused }) {
  const { user } = useAuth();
  const next = () => document.getElementById("guide")?.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" });

  return (
    <section className="ha-hero" aria-labelledby="ha-title">
      <div className="ha-slides" aria-hidden="true">
        {SLIDES.map((p, n) => (
          <img key={p.src} className={`ha-slide s${n + 1}`} src={p.src} srcSet={srcSet(p)} sizes="100vw" alt=""
            style={{ objectPosition: p.pos }} fetchPriority={n === 0 ? "high" : "low"} decoding="async" />
        ))}
      </div>
      <div className="ha-hero-shade" aria-hidden="true" />

      <div className="ha-in ha-hero-in">
        <m.p className="ha-eyebrow" {...rise(0)}>{user ? `Welcome back, ${profile(user).first}` : "Free · for every Indian rail traveller"}</m.p>
        <m.h1 id="ha-title" className="ha-h1" {...rise(0.08)}>Every station.<br />Every journey.<br /><span>Made easy.</span></m.h1>
        <m.p className="ha-lede" {...rise(0.16)}>Lifts and lounges at the station, waterfalls and forts from your window, and a live chat with the people on your platform.</m.p>
        <m.div {...rise(0.24)}><Search stations={stations} glass /></m.div>
        <m.p className="ha-popular" {...rise(0.32)}>
          Popular:{POPULAR.map(([name, id]) => <a key={id} href={`#/s/${id}`}>{name}</a>)}
        </m.p>
      </div>

      <div className="ha-hero-foot">
        <button type="button" className="ha-cue" onClick={next}>Scroll <span aria-hidden="true">↓</span></button>
        {!REDUCED && <button type="button" className="pause" aria-pressed={paused} aria-label={paused ? "Play the photos" : "Pause the photos"} onClick={() => setPaused((p) => !p)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path className="i-pause" d="M8 5v14M16 5v14" /><path className="i-play" d="M8 5l11 7-11 7z" /></svg>
        </button>}
      </div>
    </section>
  );
}
