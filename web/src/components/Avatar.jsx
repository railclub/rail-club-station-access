import { useState } from "react";

// Google profile picture, or the person's initial if there isn't one or it fails to load.
export default function Avatar({ who, size = 36 }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.44 };
  return who.avatar && !broken
    ? <img className="avatar" style={style} src={who.avatar} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    : <span className="avatar avatar-initial" style={style} aria-hidden="true">{who.name.charAt(0).toUpperCase()}</span>;
}
