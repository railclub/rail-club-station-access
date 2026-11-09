// Station-style LED announcement board. Pauses on hover/focus; still text for reduced motion.
export default function Led({ count }) {
  const msg = (
    <>
      <span className="hi" lang="hi">यात्रीगण कृपया ध्यान दें</span> · Passengers, kindly note: lifts, ramps and accessible toilets for{" "}
      <b>{count ? `${count} stations` : "hundreds of stations"}</b>, with the source for every fact · Check at the station before you rely on a facility ·
      Spotted a lift or ramp? Film it and help the next traveller ·{" "}
    </>
  );
  return (
    <div className="led" role="note" aria-label="Announcement">
      <div className="led-tag"><span className="hi" lang="hi">सूचना</span> NOTICE</div>
      <div className="led-track" tabIndex={0}>
        <p className="led-text">{msg}<span aria-hidden="true">{msg}</span></p>
      </div>
    </div>
  );
}
