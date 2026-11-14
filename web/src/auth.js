import { useEffect, useState, useSyncExternalStore } from "react";

// site/supa.js holds the one Supabase client, shared with report.js. It's tiny; the Supabase
// library itself only loads for people who are signed in or press "Sign in".
const supa = () => import(/* @vite-ignore */ new URL("supa.js", document.baseURI).href);

let state = { ready: false, user: null };
const subs = new Set();
const set = (next) => { state = { ...state, ...next }; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

let started = false;
export async function startAuth() {
  if (started) return;
  started = true;
  try {
    const m = await supa();
    if (!m.hasStoredSession() && !new URLSearchParams(location.search).has("code")) return set({ ready: true });
    const c = await m.client();
    const { data } = await c.auth.getSession();
    set({ ready: true, user: data.session?.user ?? null });
    c.auth.onAuthStateChange((_event, session) => set({ ready: true, user: session?.user ?? null }));
  } catch {
    set({ ready: true });
  }
}

export const signIn = async () => (await supa()).signInWithGoogle();
export async function signOut() {
  const c = await (await supa()).client();
  await c.auth.signOut();
  set({ user: null });
}
export const useAuth = () => useSyncExternalStore(subscribe, () => state);

/** Name, first name, email and picture from the Google account. */
export function profile(user) {
  const md = user?.user_metadata || {};
  const name = md.full_name || md.name || (user?.email || "").split("@")[0] || "Traveller";
  return { name, first: name.split(/\s+/)[0], email: user?.email || "", avatar: md.avatar_url || md.picture || "" };
}

// The signed-in person's own reports. Row level security only ever returns their own rows.
let cache = { uid: null, rows: null };
export function useMyReports(user) {
  const [rows, setRows] = useState(user && cache.uid === user.id ? cache.rows : null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!user) { setRows(null); return; }
    let live = true;
    (async () => {
      try {
        const c = await (await supa()).client();
        const { data, error: err } = await c.from("reports")
          .select("id, station_id, claimed_features, published_features, status, reasons, created_at")
          .order("created_at", { ascending: false }).limit(100);
        if (err) throw err;
        cache = { uid: user.id, rows: data };
        if (live) { setRows(data); setError(false); }
      } catch {
        if (live) setError(true);
      }
    })();
    return () => { live = false; };
  }, [user?.id]);
  return { rows, error };
}

// Recently opened stations, kept in this browser only (never sent anywhere), per account.
const recentKey = (uid) => `railclub-recent-${uid}`;
export function getRecent(uid) {
  try {
    const ids = JSON.parse(localStorage.getItem(recentKey(uid)) || "[]");
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function pushRecent(uid, stationId) {
  try {
    localStorage.setItem(recentKey(uid), JSON.stringify([stationId, ...getRecent(uid).filter((x) => x !== stationId)].slice(0, 6)));
  } catch { /* storage blocked: no recents, nothing else breaks */ }
}
