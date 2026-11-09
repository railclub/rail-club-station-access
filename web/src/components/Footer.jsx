import { PHOTOS } from "../photos.js";

export default function Footer({ data }) {
  return (
    <footer className="foot">
      <div className="wrap">
        <p className="farewell"><span className="hi" lang="hi">आपकी यात्रा मंगलमय हो</span><small>Wishing you a safe and happy journey</small></p>
        <p>Built from accessibility PDFs published by Indian Railways. Rail Club is not an official Indian Railways or IRCTC service, so check at the station before you rely on a facility.</p>
        {data && (
          <p>Data: {data.divisions.map((v, i) => (
            <span key={v.division}>{i ? ", " : ""}<a href={v.source_url} target="_blank" rel="noopener">{v.division} division</a> (checked {v.retrieved})</span>
          ))}</p>
        )}
        <details className="credits">
          <summary>Photo credits</summary>
          <ul>
            {Object.values(PHOTOS).map((p) => (
              <li key={p.src}><a href={p.page} target="_blank" rel="noopener">{p.title}</a> by {p.author}, <a href={p.licenseUrl} target="_blank" rel="noopener">{p.license}</a>, via Wikimedia Commons</li>
            ))}
          </ul>
          <p>Photos are resized for this site. Resized copies are shared under the same licence as the original.</p>
        </details>
        <p>Contact: <a href="mailto:railclub.support@gmail.com">railclub.support@gmail.com</a> · <a href="privacy.html">Privacy</a> · <a href="https://github.com/railclub/rail-club-station-access">Source code &amp; data on GitHub</a></p>
      </div>
    </footer>
  );
}
