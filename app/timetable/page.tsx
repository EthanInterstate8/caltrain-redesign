import { SiteNav } from "@/components/site-nav";
import { listStations } from "@/lib/plan";
import { stationBoard } from "@/lib/timetable";

export const dynamic = "force-dynamic";

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const stations = listStations();
  const requested = read("station");
  const stationId = stations.some((station) => station.id === requested) ? requested! : "palo_alto";
  const direction = read("dir") === "south" ? "south" : "north";
  const board = stationBoard(stationId, direction);
  const name = board.station?.name || "Station";

  return (
    <>
      <a className="skip" href="#board">
        Skip to departures
      </a>
      <SiteNav />
      <main className="board" id="board">
        <p className="kicker">{board.dateLabel}</p>
        <h1>{name}</h1>
        <form className="board-controls" action="/timetable">
          <label>
            Station
            <select name="station" defaultValue={stationId}>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          </label>
          <button className={direction === "north" ? "on" : ""} name="dir" value="north" type="submit">
            Northbound
          </button>
          <button className={direction === "south" ? "on" : ""} name="dir" value="south" type="submit">
            Southbound
          </button>
        </form>
        {board.departures.length === 0 ? (
          <p className="note">No {direction}bound departures today.</p>
        ) : (
          <ol className="deps">
            {board.departures.map((row) => (
              <li key={`${row.number}-${row.time}`}>
                <span className="when">{row.time}</span>
                <span className="train">{row.number}</span>
                <span className={`badge badge-${row.type === "Express" ? "express" : row.type === "Limited" ? "limited" : row.type === "South County" ? "south" : "local"}`}>
                  {row.type}
                </span>
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  );
}
