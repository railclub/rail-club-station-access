// Review queue for admins. The page itself holds no secrets: every action goes through the
// review-report Edge Function, which checks the signed-in account is in the admins table.
import { client } from "./supa.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (id) => document.getElementById(id);

const sb = await client();

async function call(body) {
  const { data, error } = await sb.functions.invoke("review-report", { body });
  if (error) {
    let msg = "Request failed";
    try { msg = (await error.context.json()).error || msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return data;
}

async function main() {
  const { data } = await sb.auth.getSession();
  if (new URLSearchParams(location.search).has("code")) history.replaceState(null, "", location.pathname);
  if (!data.session) {
    $("queue").innerHTML = `<button type="button" class="btn" id="g-in">Sign in with Google</button>`;
    $("g-in").onclick = () => sb.auth.signInWithOAuth({ provider: "google",
      options: { redirectTo: location.href.split("?")[0].split("#")[0] } });
    return;
  }
  $("who").innerHTML = `Signed in as ${esc(data.session.user.email)} · <button type="button" class="link" id="out">Sign out</button>`;
  $("out").onclick = async () => { await sb.auth.signOut(); location.reload(); };
  await load();
  await loadChat();
}

// ---------- station chat: usage, switches and reported messages ----------
// Everything goes through chat_admin_* database functions, which check the account is an admin.

async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

async function loadChat() {
  let o;
  try {
    o = await rpc("chat_admin_overview");
  } catch {
    return; // not an admin, or chat not set up: leave the section hidden
  }
  $("chat-admin").hidden = false;
  const s = o.settings, closed = s.closed_stations || [];
  const busiest = (o.busiest || []).map((b) => `${esc(b.station_id)} (${b.people})`).join(", ") || "nobody right now";
  $("chat-panel").innerHTML = `
    <p class="chat-admin-stats"><b>${o.in_chat_now}</b> people in chat now, at <b>${o.stations_now}</b> station${o.stations_now === 1 ? "" : "s"} · <b>${o.messages_24h}</b> messages in the last 24 hours<br>
      <span class="hint">Busiest: ${busiest}. The free Supabase plan allows 200 people connected at once across the site.</span></p>
    <div class="actions">
      <button type="button" class="btn ${s.enabled ? "danger" : ""}" id="chat-toggle">${s.enabled ? "Switch chat off everywhere" : "Switch chat back on"}</button>
      <input type="text" id="chat-station" placeholder="Station id, e.g. santa-cruz" aria-label="Station id to close or reopen">
      <button type="button" class="btn ghost" id="chat-close">Close this station</button>
      <button type="button" class="btn ghost" id="chat-open">Reopen</button>
    </div>
    <p class="hint">${s.enabled ? "Chat is on." : "<strong>Chat is OFF everywhere.</strong>"} Closed stations: ${closed.length ? closed.map(esc).join(", ") : "none"}.</p>
    <h2>Reported messages</h2>
    ${o.reports.length ? o.reports.map((r) => `<article class="card">
      <p><b>${esc(r.nickname)}</b> at ${esc(r.station_id)}, ${esc(new Date(r.created_at).toLocaleString("en-IN"))}${r.banned ? " · <strong>already banned</strong>" : ""}</p>
      <blockquote>${esc(r.body)}</blockquote>
      <p class="hint">Reported for: ${esc(r.reason)} · ${r.reports_on_message} report${r.reports_on_message === 1 ? "" : "s"} on this message · this person has ${r.author_reports} in all · ${r.hidden ? "<strong>hidden from the room now</strong>" : "still showing in the room"}</p>
      <div class="actions">
        <button type="button" class="btn ghost" data-r="${r.id}" data-a="dismiss">${r.hidden ? "Keep it (show it again)" : "Keep it"}</button>
        <button type="button" class="btn" data-r="${r.id}" data-a="delete">Delete message</button>
        <button type="button" class="btn danger" data-r="${r.id}" data-a="ban">Delete and ban</button>
      </div></article>`).join("") : "<p>No reports. 🎉</p>"}`;
  const act = async (fn, args, confirmText) => {
    if (confirmText && !confirm(confirmText)) return;
    try { await rpc(fn, args); } catch (e) { alert(e.message); }
    await loadChat();
  };
  $("chat-toggle").onclick = () => act("chat_admin_switch", { p_enabled: !s.enabled },
    s.enabled ? "Switch station chat off for everyone, everywhere?" : null);
  const station = () => $("chat-station").value.trim().toLowerCase();
  $("chat-close").onclick = () => station() && act("chat_admin_switch", { p_enabled: null, p_station: station(), p_closed: true });
  $("chat-open").onclick = () => station() && act("chat_admin_switch", { p_enabled: null, p_station: station(), p_closed: false });
  for (const b of $("chat-panel").querySelectorAll("button[data-r]")) {
    b.onclick = () => act("chat_admin_act", { p_report: Number(b.dataset.r), p_action: b.dataset.a },
      b.dataset.a === "ban" ? "Ban this person from chat and video reports, and delete all their messages?" : null);
  }
}

async function load() {
  let res;
  try {
    res = await call({ action: "list" });
  } catch (e) {
    $("queue").innerHTML = `<p>${esc(e.message)}</p>`;
    return;
  }
  const { items, features } = res;
  if (!items.length) {
    $("queue").innerHTML = `<p>Nothing waiting. 🎉</p>`;
    return;
  }
  $("queue").innerHTML = `<p class="hint">${items.length} waiting, oldest first. Video links expire after 10 minutes; reload the page for fresh ones.</p>` +
    items.map((r) => card(r, features)).join("");
  for (const r of items) {
    $(`ok-${r.id}`).onclick = () => decide(r.id, "approve");
    $(`no-${r.id}`).onclick = () => decide(r.id, "reject");
  }
}

function card(r, features) {
  const g = r.gemini;
  const seen = new Map((g?.features ?? []).map((f) => [f.key, f]));
  const ticks = r.claimed_features.map((k) => {
    const f = seen.get(k);
    const info = f ? ` <span class="hint">(Gemini: ${f.seen ? `seen, ${esc(f.confidence)}${f.at ? ` at ${esc(f.at)}` : ""}${f.where ? `, ${esc(f.where)}` : ""}` : "not seen"})</span>` : "";
    return `<label><input type="checkbox" name="f-${r.id}" value="${esc(k)}" ${r.suggested_features.includes(k) ? "checked" : ""}> ${esc(features[k] || k)}${info}</label>`;
  }).join("");
  const gem = g ? [
    `railway station: ${g.is_railway_station ? "yes" : "NO"}`,
    `inside station: ${g.inside_station_premises ? "yes" : "NO"}`,
    `board: ${g.station_board_visible ? `"${esc(g.station_board_text)}" (${esc(g.board_matches_station)})` : "not visible"}`,
    g.is_screen_or_recording_of_screen ? "<strong>SCREEN</strong>" : "",
    g.looks_edited ? "<strong>EDITED</strong>" : "",
    g.notes ? esc(g.notes) : "",
  ].filter(Boolean).join(" · ") : "Not checked by Gemini";
  return `<article class="card">
    <h2>${esc(r.station)}</h2>
    ${r.video_url ? `<video src="${esc(r.video_url)}" controls muted playsinline preload="metadata"></video>` : "<p>Video missing</p>"}
    <dl>
      <dt>Recorded</dt><dd>${esc(new Date(r.recorded_at).toLocaleString("en-IN"))} · ${Math.round(r.duration_s ?? 0)} s</dd>
      <dt>Location</dt><dd>${r.distance_m == null ? "no station coordinates on file" : `${esc(r.distance_m)} m from station`} (±${Math.round(r.accuracy_m ?? 0)} m)</dd>
      <dt>Contributor</dt><dd>${r.contributor.approved} approved, ${r.contributor.rejected} rejected before</dd>
      <dt>Why here</dt><dd>${(r.reasons ?? []).map(esc).join("; ")}</dd>
      <dt>Gemini</dt><dd>${gem}</dd>
    </dl>
    <fieldset class="ticks"><legend>Publish these facilities</legend>${ticks}</fieldset>
    <div class="actions">
      <button type="button" class="btn" id="ok-${r.id}">Approve</button>
      <input type="text" id="why-${r.id}" placeholder="Reason, if rejecting" aria-label="Reason for rejecting">
      <button type="button" class="btn danger" id="no-${r.id}">Reject</button>
    </div>
  </article>`;
}

async function decide(id, action) {
  const body = { action, report_id: id };
  if (action === "approve") {
    body.features = [...document.querySelectorAll(`input[name="f-${id}"]:checked`)].map((i) => i.value);
    if (!body.features.length) return alert("Tick at least one facility to publish, or reject the report.");
  } else {
    body.reason = $(`why-${id}`).value;
  }
  document.querySelectorAll(`#ok-${id}, #no-${id}`).forEach((b) => (b.disabled = true));
  try {
    await call(body);
  } catch (e) {
    alert(e.message);
  }
  await load();
}

main();
