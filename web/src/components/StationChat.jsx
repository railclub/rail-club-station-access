import { useEffect, useMemo, useRef, useState } from "react";
import { signIn, useAuth } from "../auth.js";

// Station Chat: a live room for each station, open only to people who are there.
// 1. The visitor's live location goes to the station-pass Edge Function, which checks it against
//    the station (same rules as video reports) and gives a 20-minute pass.
// 2. Messages are sent with the chat_send database function (which checks the pass, limits,
//    links and phone numbers) and arrive in everyone's browser over a private Supabase Realtime
//    channel (WebSocket) that only pass holders can listen to.
// 3. Every few minutes the page checks the location again; leaving the station ends the pass.
// See supabase/migrations/20261123000000_station_chat.sql.

const supa = () => import(/* @vite-ignore */ new URL("supa.js", document.baseURI).href);
const RULES_KEY = "railclub-chat-rules";
const BLOCK_KEY = "railclub-chat-blocked";
const REASONS = ["Abusive or harassing", "Spam or a scam", "Asking for personal details", "Something else"];

const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* fine: only a convenience */ } },
};
const clock = (iso) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

/** The best location the phone can give within `ms` (stops early once it's within 30 m). */
function locate(ms = 15000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser can't share your location."));
    let best = null;
    const done = () => {
      navigator.geolocation.clearWatch(watch);
      clearTimeout(timer);
      best ? resolve(best) : reject(new Error("We couldn't get your location. Check location is allowed for this site."));
    };
    const watch = navigator.geolocation.watchPosition((p) => {
      const fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy_m: p.coords.accuracy };
      if (!best || fix.accuracy_m < best.accuracy_m) best = fix;
      if (fix.accuracy_m <= 30) done();
    }, () => done(), { enableHighAccuracy: true, maximumAge: 0, timeout: ms });
    const timer = setTimeout(done, ms);
  });
}

async function getPass(stationId, fix) {
  const c = await (await supa()).client();
  const { data, error } = await c.functions.invoke("station-pass", { body: { station_id: stationId, ...fix } });
  if (error) {
    let body = {};
    try { body = await error.context.json(); } catch { /* network error: no body */ }
    throw Object.assign(new Error(body.error || "Couldn't check you in just now. Please try again."), { nearest: body.nearest, status: error.context?.status });
  }
  return data;
}

const rpcError = (e) => e?.message || "Something went wrong";

export default function StationChat({ station }) {
  const { ready, user } = useAuth();
  const [phase, setPhase] = useState("idle"); // idle | rules | locating | in | error | left
  const [error, setError] = useState(null); // { message, nearest }
  const [pass, setPass] = useState(null); // { expires_at, nickname, renew_after_s }
  const [room, setRoom] = useState("open");
  const [rooms, setRooms] = useState([]); // friends' rooms: { room, code, expires_at }

  // a different station page: start again
  useEffect(() => { setPhase("idle"); setPass(null); setRoom("open"); setRooms([]); setError(null); }, [station.id]);

  const join = async () => {
    if (!store.get(RULES_KEY, false)) return setPhase("rules");
    setPhase("locating");
    setError(null);
    try {
      const p = await getPass(station.id, await locate());
      setPass(p);
      setPhase("in");
      const c = await (await supa()).client();
      const { data } = await c.rpc("chat_my_rooms", { p_station: station.id });
      setRooms(data || []);
    } catch (e) {
      setError({ message: e.message, nearest: e.nearest });
      setPhase("error");
    }
  };

  // Keep the pass while they're at the station: check again every few minutes and when the
  // phone wakes up. Leaving the station (or the pass running out) ends the chat.
  useEffect(() => {
    if (phase !== "in" || !pass) return undefined;
    let stopped = false;
    const renew = async () => {
      try {
        const p = await getPass(station.id, await locate(12000));
        if (!stopped) setPass(p);
      } catch (e) {
        if (stopped) return;
        if (e.status === 403 || e.status === 503) {
          setError({ message: e.message, nearest: e.nearest });
          setPhase("left");
        } // location or network trouble: try again next time, the pass is still good for a while
      }
    };
    const timer = setInterval(renew, pass.renew_after_s * 1000);
    const expiry = setInterval(() => {
      if (Date.now() > Date.parse(pass.expires_at)) { setError({ message: "Your pass ran out." }); setPhase("left"); }
    }, 15000);
    const wake = () => { if (document.visibilityState === "visible") renew(); };
    document.addEventListener("visibilitychange", wake);
    return () => { stopped = true; clearInterval(timer); clearInterval(expiry); document.removeEventListener("visibilitychange", wake); };
  }, [phase, pass?.expires_at, station.id]);

  return (
    <section className="group chat" aria-labelledby="chat-title">
      <h2 id="chat-title">💬 Station chat <span className="chat-new">New</span></h2>
      {phase === "idle" && (
        <>
          <p className="group-lede">Talk live with people at {station.name} right now: is the train late, which platform, has anyone found a lost bag? Only people at the station can join, and messages vanish after 2 hours.</p>
          {!ready ? null : user
            ? <button type="button" className="btn" onClick={join}>Join {station.name} chat</button>
            : <button type="button" className="btn" onClick={signIn}>Sign in with Google to join</button>}
        </>
      )}
      {phase === "rules" && <Rules onOk={() => { store.set(RULES_KEY, true); join(); }} onCancel={() => setPhase("idle")} />}
      {phase === "locating" && <p className="chat-wait" role="status"><span className="chat-pulse" aria-hidden="true" />Checking you're at {station.name}…</p>}
      {(phase === "error" || phase === "left") && (
        <div className="chat-stop" role="alert">
          <p><b>{phase === "left" ? `You're out of the ${station.name} chat.` : "You can't join this chat right now."}</b> {error?.message}</p>
          {error?.nearest && <a className="btn" href={`#/s/${encodeURIComponent(error.nearest.id)}`}>Open {error.nearest.name} chat instead</a>}{" "}
          <button type="button" className={error?.nearest ? "link" : "btn"} onClick={join}>Check my location again</button>
        </div>
      )}
      {phase === "in" && pass && (
        <Room station={station} pass={pass} setPass={setPass} room={room} setRoom={setRoom} rooms={rooms} setRooms={setRooms}
          onLeave={() => { setPhase("idle"); setPass(null); setRoom("open"); }} />
      )}
    </section>
  );
}

function Rules({ onOk, onCancel }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="chat-rules">
      <p><b>Before you join</b></p>
      <ul>
        <li>Be kind. Abuse, harassment and scams get people banned.</li>
        <li>Never share phone numbers, links or personal details with strangers. Chat won't send them.</li>
        <li>You appear only by a nickname. Messages vanish after 2 hours.</li>
        <li>We check your location only to let you in. We keep which station you joined, never where you are.</li>
        <li>Emergency? Call <a href="tel:139">139</a> (Rail Madad), or tell the RPF on the platform.</li>
      </ul>
      <label className="chat-agree"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I agree</label>
      <button type="button" className="btn" disabled={!ok} onClick={onOk}>Continue</button>{" "}
      <button type="button" className="link" onClick={onCancel}>Cancel</button>
    </div>
  );
}

function Room({ station, pass, setPass, room, setRoom, rooms, setRooms, onLeave }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [live, setLive] = useState(false);
  const [blocked, setBlocked] = useState(() => store.get(BLOCK_KEY, []));
  const [mineIds] = useState(() => new Set());
  const list = useRef(null);
  const topic = `chat:${station.id}:${room}`;

  // Load the last messages, then listen on the room's private channel over the WebSocket.
  useEffect(() => {
    let channel = null, stopped = false;
    setMessages([]);
    setLive(false);
    (async () => {
      const c = await (await supa()).client();
      const load = async () => {
        const { data, error } = await c.rpc("chat_recent", { p_station: station.id, p_room: room });
        if (error) return setNote(rpcError(error));
        if (!stopped) {
          for (const m of data) if (m.mine) mineIds.add(m.id);
          setMessages(data);
        }
      };
      const { data: { session } } = await c.auth.getSession();
      if (session) c.realtime.setAuth(session.access_token);
      channel = c.channel(topic, { config: { private: true } })
        .on("broadcast", { event: "message" }, ({ payload }) =>
          setMessages((ms) => (ms.some((m) => m.id === payload.id) ? ms : [...ms, payload].slice(-200))))
        .on("broadcast", { event: "delete" }, ({ payload }) => setMessages((ms) => ms.filter((m) => m.id !== payload.id)))
        .subscribe((status) => {
          if (stopped) return;
          setLive(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") load(); // also after a reconnect, to catch up
        });
    })();
    return () => { stopped = true; if (channel) supa().then((m) => m.client()).then((c) => c.removeChannel(channel)); };
  }, [topic]);

  // keep the newest message in view, unless they've scrolled up to read
  useEffect(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const call = async (fn, args) => {
    const c = await (await supa()).client();
    const { data, error } = await c.rpc(fn, args);
    if (error) throw new Error(rpcError(error));
    return data;
  };
  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setNote("");
    try {
      const id = await call("chat_send", { p_station: station.id, p_room: room, p_body: body });
      mineIds.add(id);
      setText("");
    } catch (err) {
      setNote(err.message);
    }
  };
  const block = (author, nick) => {
    const next = [...new Set([...blocked, author])];
    setBlocked(next);
    store.set(BLOCK_KEY, next);
    setNote(`You won't see messages from ${nick} any more.`);
  };
  const report = async (m, reason) => {
    try {
      await call("chat_report", { p_message: m.id, p_reason: reason });
      setNote("Thanks. A reviewer will look at it; if several people report it, it's hidden straight away.");
    } catch (err) { setNote(err.message); }
  };
  const startRoom = async () => {
    try {
      const [r] = await call("chat_create_room", { p_station: station.id });
      setRooms((rs) => [...rs, r]);
      setRoom(r.room);
      setNote(`Your friends' room code is ${r.code}. Your friends type it here while they're at ${station.name}.`);
    } catch (err) { setNote(err.message); }
  };
  const joinRoom = async (code) => {
    try {
      const [r] = await call("chat_join_room", { p_station: station.id, p_code: code });
      setRooms((rs) => (rs.some((x) => x.room === r.room) ? rs : [...rs, r]));
      setRoom(r.room);
      setNote("");
    } catch (err) { setNote(err.message); }
  };
  const rename = async (name) => {
    try { setPass({ ...pass, nickname: await call("chat_set_nickname", { p_name: name }) }); setNote(""); } catch (err) { setNote(err.message); }
  };

  const shown = messages.filter((m) => !blocked.includes(m.author));
  const current = rooms.find((r) => r.room === room);

  return (
    <div className="chat-room">
      <div className="chat-bar">
        <span className={`chat-live ${live ? "on" : ""}`}>{live ? "Live" : "Connecting…"}</span>
        <Nick name={pass.nickname} onSave={rename} />
        <button type="button" className="link" onClick={onLeave}>Leave</button>
      </div>
      <div className="chat-tabs" role="tablist" aria-label="Rooms">
        <button type="button" role="tab" aria-selected={room === "open"} onClick={() => setRoom("open")}>Everyone at {station.name}</button>
        {rooms.map((r) => (
          <button key={r.room} type="button" role="tab" aria-selected={room === r.room} onClick={() => setRoom(r.room)}>Friends · {r.code}</button>
        ))}
        <FriendsMenu onStart={startRoom} onJoin={joinRoom} />
      </div>
      {current && <p className="chat-code">Room code <b>{current.code}</b>: friends at {station.name} can join with it until {clock(current.expires_at)}.</p>}
      <p className="chat-pin">🚨 Emergency? Call <a href="tel:139">139</a> or find the RPF on the platform. Never share personal details here.</p>
      <ol className="chat-list" ref={list} aria-live="polite" aria-label="Messages">
        {shown.length === 0 && <li className="chat-empty">No messages in the last 2 hours. Say hello!</li>}
        {shown.map((m) => <Message key={m.id} m={m} mine={m.mine || mineIds.has(m.id)} onReport={report} onBlock={block} />)}
      </ol>
      <form className="chat-send" onSubmit={send}>
        <label className="sr-only" htmlFor="chat-text">Message</label>
        <input id="chat-text" value={text} maxLength={500} autoComplete="off" placeholder="Message everyone here…"
          onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn" disabled={!text.trim()}>Send</button>
      </form>
      {note && <p className="chat-note" role="status">{note}</p>}
    </div>
  );
}

function Message({ m, mine, onReport, onBlock }) {
  const [menu, setMenu] = useState(false);
  return (
    <li className={`chat-msg${mine ? " mine" : ""}`}>
      <div className="chat-meta"><b>{mine ? "You" : m.nickname}</b> <time>{clock(m.created_at)}</time>
        {!mine && <button type="button" className="chat-more" aria-expanded={menu} aria-label={`Report or block ${m.nickname}`} onClick={() => setMenu(!menu)}>⋯</button>}
      </div>
      <p>{m.body}</p>
      {menu && (
        <div className="chat-menu">
          {REASONS.map((r) => <button key={r} type="button" onClick={() => { onReport(m, r); setMenu(false); }}>Report: {r.toLowerCase()}</button>)}
          <button type="button" onClick={() => { onBlock(m.author, m.nickname); setMenu(false); }}>Block {m.nickname}</button>
        </div>
      )}
    </li>
  );
}

function Nick({ name, onSave }) {
  const [edit, setEdit] = useState(false);
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  return edit ? (
    <form className="chat-nick" onSubmit={(e) => { e.preventDefault(); onSave(value); setEdit(false); }}>
      <input value={value} maxLength={20} aria-label="Nickname" onChange={(e) => setValue(e.target.value)} autoFocus />
      <button type="submit" className="link">Save</button>
    </form>
  ) : <span className="chat-you">You're <b>{name}</b> <button type="button" className="link" onClick={() => setEdit(true)}>Change</button></span>;
}

function FriendsMenu({ onStart, onJoin }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const valid = useMemo(() => /^[A-Za-z0-9]{6}$/.test(code.trim()), [code]);
  if (!open) return <button type="button" className="chat-add" onClick={() => setOpen(true)}>+ Friends' room</button>;
  return (
    <div className="chat-friends">
      <button type="button" className="btn" onClick={() => { onStart(); setOpen(false); }}>Start a room</button>
      <form onSubmit={(e) => { e.preventDefault(); if (valid) { onJoin(code); setOpen(false); setCode(""); } }}>
        <input value={code} maxLength={6} placeholder="Code" aria-label="Room code" onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button type="submit" className="link" disabled={!valid}>Join</button>
      </form>
      <button type="button" className="link" onClick={() => setOpen(false)}>Close</button>
    </div>
  );
}
