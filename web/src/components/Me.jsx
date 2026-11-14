import { useEffect, useMemo } from "react";
import { m } from "motion/react";
import { getRecent, profile, signIn, signOut, useAuth, useMyReports } from "../auth.js";
import Avatar from "./Avatar.jsx";
import { Board } from "./Home.jsx";

const STATUS = {
  published: { cls: "yes", text: "Published" },
  pending: { cls: "not_listed", text: "Waiting for a reviewer" },
  rejected: { cls: "no", text: "Not accepted" },
  not_needed: { cls: "unknown", text: "Already confirmed" },
  expired: { cls: "unknown", text: "Not reviewed in time" },
};
const day = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Me({ data }) {
  const { ready, user } = useAuth();
  const { rows, error } = useMyReports(user);
  const labels = useMemo(() => Object.fromEntries((data?.features || []).map((f) => [f.key, f.label])), [data]);
  const byId = useMemo(() => Object.fromEntries((data?.stations || []).map((s) => [s.id, s])), [data]);
  useEffect(() => { document.title = "My contributions · Rail Club"; window.scrollTo({ top: 0 }); }, []);

  if (!ready) return <div className="wrap me"><p className="hint">Loading…</p></div>;
  if (!user) {
    return (
      <div className="wrap me">
        <h1>My contributions</h1>
        <p>Sign in to see the videos you've sent and what happened to each one.</p>
        <button type="button" className="btn" onClick={() => signIn()}>Sign in with Google</button>
      </div>
    );
  }

  const who = profile(user);
  const count = (s) => (rows || []).filter((r) => r.status === s).length;
  const recent = getRecent(user.id).map((id) => byId[id]).filter(Boolean);

  return (
    <div className="wrap me">
      <m.div className="me-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Avatar who={who} size={72} />
        <div className="me-id">
          <p className="kicker hi" lang="hi">नमस्ते</p>
          <h1>{who.name}</h1>
          <p className="me-email">{who.email} · joined {day(user.created_at)}</p>
        </div>
        <button type="button" className="me-out" onClick={() => signOut()}>Sign out</button>
      </m.div>

      <div className="summary me-stats">
        <div className="unknown"><strong>{rows ? rows.length : "–"}</strong><span>videos sent</span></div>
        <div className="yes"><strong>{rows ? count("published") : "–"}</strong><span>published</span></div>
        <div className="not_listed"><strong>{rows ? count("pending") : "–"}</strong><span>waiting for review</span></div>
      </div>

      <section className="group" aria-labelledby="me-list">
        <h2 id="me-list">Your contributions</h2>
        {error && <p className="caveat">Couldn't load your contributions. Please refresh.</p>}
        {!error && !rows && <p className="hint">Loading…</p>}
        {rows && !rows.length && (
          <div className="me-empty">
            <p><b>No contributions yet.</b> Open a station you're at, tap <b>Add a video of this station</b> and film a lift, ramp or accessible toilet.</p>
            <a className="btn" href="#/">Find a station</a>
          </div>
        )}
        {rows && rows.length > 0 && (
          <ul className="feat me-list">
            {rows.map((r, n) => {
              const st = byId[r.station_id];
              const s = STATUS[r.status] || STATUS.pending;
              const shown = r.status === "published" && r.published_features?.length ? r.published_features : r.claimed_features;
              return (
                <m.li key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + n * 0.03, duration: 0.4 }}>
                  <span className={`mark ${s.cls}`} aria-hidden="true">{r.status === "published" ? "✓" : r.status === "rejected" ? "✕" : "…"}</span>
                  <div>
                    <div className="f-label"><a href={`#/s/${r.station_id}`}>{st ? st.name : r.station_id}</a> <span className={`pill ${s.cls}`}>{s.text}</span></div>
                    <div className="f-status">{day(r.created_at)} · {shown.map((k) => labels[k] || k).join(", ")}</div>
                    {r.status !== "published" && r.reasons?.[0] && <div className="f-note">{r.reasons[0]}</div>}
                  </div>
                </m.li>
              );
            })}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <section className="group" aria-labelledby="me-recent">
          <h2 id="me-recent">Stations you opened recently</h2>
          <div className="boards">
            {recent.map((s) => (
              <a key={s.id} className="irboard" href={`#/s/${s.id}`}><Board st={s} /><span className="irb-posts" aria-hidden="true"><i /><i /></span></a>
            ))}
          </div>
          <p className="src">This list is kept in your browser only.</p>
        </section>
      )}
    </div>
  );
}
