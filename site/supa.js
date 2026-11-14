// One shared Supabase client for the whole site: the header sign-in, visitor reports and the
// review page all import this, so there is a single session and a single copy of the library.
import { CONFIG } from "./config.js";

const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";
const RETURN_KEY = "railclub-return";
const TOKEN_KEY = `sb-${new URL(CONFIG.supabaseUrl).hostname.split(".")[0]}-auth-token`;

let pending = null;
export function client() {
  pending ??= import(SUPABASE_JS).then(({ createClient }) =>
    createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
    }));
  return pending;
}

/** True when this browser already holds a sign-in. Pages use it to avoid loading Supabase at all
 * for people who are just reading. */
export function hasStoredSession() {
  try {
    return localStorage.getItem(TOKEN_KEY) !== null;
  } catch {
    return false;
  }
}

/** Sends the visitor to Google and remembers which page to come back to. */
export async function signInWithGoogle() {
  try {
    sessionStorage.setItem(RETURN_KEY, location.hash);
  } catch { /* storage blocked: they land on the home page instead */ }
  const c = await client();
  await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.href.split("#")[0].split("?")[0] } });
}

export function takeReturnHash() {
  try {
    const hash = sessionStorage.getItem(RETURN_KEY) || "";
    sessionStorage.removeItem(RETURN_KEY);
    return /^#\/[a-z0-9/-]*$/.test(hash) ? hash : "";
  } catch {
    return "";
  }
}
