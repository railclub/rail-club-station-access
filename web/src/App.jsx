import { useEffect } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, m } from "motion/react";
import { useRoute, useStations } from "./hooks.js";
import Header from "./components/Header.jsx";
import Hero from "./components/Hero.jsx";
import Highlights from "./components/Highlights.jsx";
import Home from "./components/Home.jsx";
import Station from "./components/Station.jsx";
import Footer from "./components/Footer.jsx";

const loadFeatures = () => import("./motion-features.js").then((r) => r.default);

const page = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 0.8, 0.24, 1] } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

export default function App() {
  const route = useRoute();
  const { data, error } = useStations();

  // "/" or Ctrl/⌘+K jumps to the station search from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        if (location.hash.startsWith("#/s/")) location.hash = "#/";
        setTimeout(() => { const q = document.getElementById("q"); q?.focus(); q?.scrollIntoView({ block: "center", behavior: "smooth" }); }, 60);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (route.page === "home") document.title = "Rail Club · Station Access Guide"; }, [route.page]);

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        <a className="skip" href="#main">Skip to content</a>
        <Header />
        <main id="main" className="full" tabIndex={-1}>
          {error && <p className="wrap hint">Couldn't load station data. Please refresh.</p>}
          <AnimatePresence mode="wait" initial={false}>
            {route.page === "station" && data ? (
              <m.section key={`s-${route.id}`} className="view" {...page}>
                <Station data={data} id={route.id} />
              </m.section>
            ) : (
              <m.section key="home" className="view" {...page}>
                <Hero stations={data?.stations} />
                <Highlights />
                <Home data={data} />
              </m.section>
            )}
          </AnimatePresence>
        </main>
        <Footer data={data} />
      </MotionConfig>
    </LazyMotion>
  );
}
