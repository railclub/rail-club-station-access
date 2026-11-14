import { m } from "motion/react";

// Three things worth knowing before you search, in a quiet strip under the hero.
const ITEMS = [
  {
    title: "Official sources",
    text: "Every fact links to the Indian Railways document it came from.",
    icon: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M9.5 14l2 2 3.5-4" /></>,
  },
  {
    title: "Check before you travel",
    text: "Facilities change. Confirm at the station or call 139.",
    icon: <><path d="M6 4h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 2-2z" /></>,
  },
  {
    title: "Seen a lift or ramp?",
    text: "Film it at the station and help the next traveller.",
    icon: <><rect x="3" y="7" width="12" height="10" rx="2" /><path d="M15 10.5l6-3v9l-6-3z" /></>,
  },
];

export default function Highlights() {
  return (
    <div className="highlights">
      <ul className="wrap hl-list">
        {ITEMS.map((it, n) => (
          <m.li key={it.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.08 * n, ease: [0.22, 0.8, 0.24, 1] }}>
            <span className="hl-ico" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">{it.icon}</svg></span>
            <span className="hl-body"><b>{it.title}</b><span>{it.text}</span></span>
          </m.li>
        ))}
      </ul>
    </div>
  );
}
