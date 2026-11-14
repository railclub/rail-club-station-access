import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { profile, signIn, signOut, useAuth } from "../auth.js";
import Avatar from "./Avatar.jsx";

function GoogleG() {
  return (
    <svg className="g-mark" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function Account() {
  const { ready, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef(null), button = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    addEventListener("pointerdown", away);
    addEventListener("keydown", esc);
    return () => { removeEventListener("pointerdown", away); removeEventListener("keydown", esc); };
  }, [open]);

  if (!ready) return <span className="avatar avatar-wait" aria-hidden="true" />;
  if (!user) {
    return (
      <button type="button" className="signin" disabled={busy} onClick={() => { setBusy(true); signIn().catch(() => setBusy(false)); }}>
        <GoogleG /><span>Sign in<span className="signin-long"> with Google</span></span>
      </button>
    );
  }
  const who = profile(user);
  return (
    <div className="account" ref={box}>
      <button type="button" className="account-btn" ref={button} aria-haspopup="menu" aria-expanded={open}
        aria-label={`Account menu for ${who.name}`} onClick={() => setOpen((o) => !o)}>
        <Avatar who={who} />
      </button>
      <AnimatePresence>
        {open && (
          <m.div className="menu" role="menu" initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.18 }}>
            <div className="menu-who">
              <Avatar who={who} size={44} />
              <div><b>{who.name}</b><span>{who.email}</span></div>
            </div>
            <a role="menuitem" href="#/me" onClick={() => setOpen(false)}>My contributions</a>
            <a role="menuitem" href="#/" onClick={() => setOpen(false)}>Find a station</a>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); signOut(); }}>Sign out</button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Header() {
  return (
    <header className="top">
      <div className="wrap top-in">
        <a className="brand" href="#/" aria-label="Rail Club, home">
          <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
            <rect width="40" height="40" rx="11" className="bm-bg" />
            <path d="M11 32C13.5 23 16 15.5 20 8M29 32C26.5 23 24 15.5 20 8" className="bm-rail" />
            <path d="M14 27h12M15.6 21.5h8.8M17.3 16h5.4" className="bm-sleeper" />
          </svg>
          <span className="brand-text">
            <b>Rail Club <span className="hi" lang="hi">रेल क्लब</span></b>
            <small>Station Access Guide</small>
          </span>
        </a>
        <div className="top-right">
          <nav className="nav" aria-label="Sections">
            <a href="#/" className="nav-on">Stations</a>
            <span className="nav-soon" title="Coming soon">Journeys <i>soon</i></span>
          </nav>
          <Account />
        </div>
      </div>
    </header>
  );
}
