// How facilities are grouped and what each status means, shared by the station, facilities
// and browse pages.
export const GROUPS = [
  { title: "Getting around", keys: ["lift", "escalator", "ramp_entry", "ramp_second", "ramp_fob", "battery_car", "boarding_ramp"] },
  { title: "Help on hand", keys: ["wheelchair", "wheelchair_booking", "human_assistance", "help_booth"] },
  { title: "Facilities", keys: ["accessible_toilet", "water_booth", "parking", "low_counter", "tactile_path", "braille_signage", "braille_map"] },
];
export const STATUS = {
  yes: { mark: "✓", text: "Available" },
  no: { mark: "✕", text: "Not available, according to official data" },
  not_listed: { mark: "–", text: "Not in the official list for this division" },
  unknown: { mark: "?", text: "No data yet" },
};
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function Legend() {
  return (
    <div className="legend" aria-label="What the marks mean">
      <span className="pill yes"><b aria-hidden="true">✓</b> Available</span>
      <span className="pill no"><b aria-hidden="true">✕</b> Not available</span>
      <span className="pill not_listed"><b aria-hidden="true">–</b> Not in official list</span>
      <span className="pill unknown"><b aria-hidden="true">?</b> No data yet</span>
    </div>
  );
}
