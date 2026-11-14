import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { REDUCED } from "./util.js";

// Hash routes: "#/" is home, "#/s/<station id>" is a station page, "#/me" is the signed-in profile, "#/journeys" and "#/contribute" explain those features. Hash links keep old URLs working.
const subscribe = (cb) => { addEventListener("hashchange", cb); return () => removeEventListener("hashchange", cb); };
export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  const m = hash.match(/^#\/s\/([a-z0-9-]+)/);
  if (m) return { page: "station", id: m[1] };
  const page = { "#/me": "me", "#/journeys": "journeys", "#/contribute": "contribute" }[hash];
  return { page: page || "home" };
}

export function useStations() {
  const [state, setState] = useState({ data: null, error: false });
  useEffect(() => {
    fetch("data/stations.json").then((r) => r.json())
      .then((data) => setState({ data, error: false }))
      .catch(() => setState({ data: null, error: true }));
  }, []);
  return state;
}

// Counts up from zero the first time the element scrolls into view.
export function useCountUp(target) {
  const ref = useRef(null);
  const [value, setValue] = useState(REDUCED ? target : 0);
  useEffect(() => {
    if (REDUCED || !target || !ref.current) { setValue(target); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 1100);
        setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target]);
  return [ref, value];
}
