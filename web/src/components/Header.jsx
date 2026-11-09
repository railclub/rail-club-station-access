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
        <nav className="nav" aria-label="Sections">
          <a href="#/" className="nav-on">Stations</a>
          <span className="nav-soon" title="Coming soon">Journeys <i>soon</i></span>
        </nav>
      </div>
    </header>
  );
}
