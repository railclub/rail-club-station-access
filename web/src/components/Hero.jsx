import { useEffect, useState } from "react";
import { m, useScroll, useTransform } from "motion/react";
import { SLIDES, creditLine } from "../photos.js";
import { REDUCED } from "../util.js";
import Search from "./Search.jsx";
import { profile, useAuth } from "../auth.js";

const rise = (d) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0, transition: { duration: 0.8, delay: d, ease: [0.22, 0.8, 0.24, 1] } } });

export default function Hero({ stations }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(REDUCED);
  useEffect(() => {
    if (paused || SLIDES.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % SLIDES.length), 7000);
    return () => clearInterval(t);
  }, [paused]);
  const cur = SLIDES[i];
  const { user } = useAuth();
  // Gentle parallax: the photo drifts down and the text fades as you scroll past the hero.
  const { scrollY } = useScroll();
  const photoY = useTransform(scrollY, [0, 900], [0, REDUCED ? 0 : 160]);
  const textOpacity = useTransform(scrollY, [0, 520], [1, REDUCED ? 1 : 0.15]);

  return (
    <div className={`hero${paused ? " paused" : ""}`}>
      <m.div className="slides" style={{ y: photoY }}>
        {SLIDES.map((p, n) => (
          <figure key={p.src} className={`slide${n === i ? " on" : ""}`} style={{ "--pos": p.pos }}>
            <img src={p.src} srcSet={`${p.small} 960w, ${p.src} ${p.w}w`} sizes="100vw" alt=""
              fetchPriority={n === 0 ? "high" : "low"} loading={n === 0 ? "eager" : "lazy"} decoding="async" />
          </figure>
        ))}
      </m.div>
      <div className="hero-shade" aria-hidden="true" />

      <m.div className="wrap hero-in" style={{ opacity: textOpacity }}>
        <m.p className="eyebrow" {...rise(0)}><span className="hi" lang="hi">नमस्ते</span>{user ? <>, {profile(user).first} · welcome back</> : <> · Unofficial · by travellers, for travellers</>}</m.p>
        <m.h1 className="hero-title" {...rise(0.08)}>Will this station<br /><span>work for you?</span></m.h1>
        <m.p className="lede" {...rise(0.16)}>Lifts, ramps, wheelchairs, battery cars and accessible toilets at Indian railway stations, mostly from official Indian Railways data, checked by people who travel.</m.p>
        <m.div {...rise(0.24)}><Search stations={stations} /></m.div>
      </m.div>

      <div className="hero-foot wrap">
        <p className="credit"><a href={cur.page} target="_blank" rel="noopener">{creditLine(cur)}</a></p>
        {SLIDES.length > 1 && (
          <div className="slide-ctl">
            <div className="dots" role="group" aria-label="Choose photo">
              {SLIDES.map((_, n) => (
                <button key={n} type="button" aria-label={`Photo ${n + 1} of ${SLIDES.length}`} aria-current={n === i ? "true" : undefined} onClick={() => setI(n)} />
              ))}
            </div>
            <button type="button" className="pause" aria-pressed={paused} aria-label={paused ? "Play the photos" : "Pause the photos"} onClick={() => setPaused((p) => !p)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path className="i-pause" d="M8 5v14M16 5v14" /><path className="i-play" d="M8 5l11 7-11 7z" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
