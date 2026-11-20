export function SiteNav({ children }: { children?: React.ReactNode }) {
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
      <div className="nav-side">
        <a href="/#line">Line</a>
        <a href="/#status">Status</a>
        <a className="keep" href="/timetable">
          Timetable
        </a>
        {children}
      </div>
    </header>
  );
}
