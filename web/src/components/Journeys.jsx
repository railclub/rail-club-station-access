import { useEffect } from "react";
import { m } from "motion/react";
import { PHOTOS, creditLine } from "../photos.js";

const rise = (d) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: d, ease: [0.22, 0.8, 0.24, 1] } });
const STEPS = [
  ["Enter your train", "Type the train number and the stations you board and get off at."],
  ["See what's on the way", "Waterfalls, rivers, ghats, forts and bridges, in the order you'll pass them."],
  ["Know when and which side", "Each sight comes with the expected time and whether to look left or right."],
  ["Add what you spot", "Travellers add new sights and confirm each other's, so the guide keeps getting better."],
];

// Journey Partner isn't built yet; this page says what it will be, without inventing any data.
export default function Journeys() {
  const p = PHOTOS.dudhsagar;
  useEffect(() => { document.title = "Journey Partner · Rail Club"; window.scrollTo({ top: 0 }); }, []);
  return (
    <div className="wrap page">
      <a className="back" href="#/">← Back to stations</a>
      <m.div className="page-hero" {...rise(0)}>
        <img src={p.small} srcSet={`${p.small} 960w, ${p.src} ${p.w}w`} sizes="(max-width: 860px) 100vw, 820px" alt="" style={{ objectPosition: p.pos }} />
        <div className="page-hero-text">
          <span className="tag soon">Coming soon</span>
          <p className="kicker hi" lang="hi">यात्रा साथी</p>
          <h1>Journey Partner</h1>
          <p>Never miss the waterfall again. Know what's coming, when, and which window to sit by.</p>
        </div>
        <p className="credit"><a href={p.page} target="_blank" rel="noopener">{creditLine(p)}</a></p>
      </m.div>

      <section className="group" aria-labelledby="j-how">
        <h2 id="j-how">How it will work</h2>
        <ol className="steps">
          {STEPS.map(([t, d], n) => (
            <m.li key={t} {...rise(0.1 + n * 0.07)}><span className="step-n" aria-hidden="true">{n + 1}</span><div><b>{t}</b><span>{d}</span></div></m.li>
          ))}
        </ol>
      </section>

      <m.div className="note-card" {...rise(0.4)}>
        <p><b>Where we're starting:</b> the Mumbai to Pune line through the Bhor Ghat, then more routes as travellers add sights.</p>
        <p>Journey Partner isn't open yet. Until then, you can check any station's lifts, ramps and accessible toilets.</p>
        <a className="btn" href="#/">Find a station</a>
      </m.div>
    </div>
  );
}
