export function SiteHeader() {
  return (
    <header className="nav">
      <a className="brand" href="/">
        <svg className="mark" viewBox="0 0 16 16" aria-hidden>
          <rect width="16" height="16" fill="#172233" />
          <rect y="7" width="16" height="2" fill="#D92632" />
        </svg>
        <span>
          CALTRAIN <em>ONE</em>
        </span>
      </a>
      <nav className="nav-side" aria-label="Primary">
        <a href="/">Trip</a>
        <a href="/schedules">Schedules</a>
        <a href="/fares">Fares</a>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="foot">
      <span>Unofficial redesign concept. Not affiliated with Caltrain.</span>
      <span>
        Facts from{" "}
        <a href="https://www.caltrain.com/fares">caltrain.com/fares</a>
        {" and the "}
        <a href="https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip">Caltrain GTFS feed</a>.
      </span>
    </footer>
  );
}
