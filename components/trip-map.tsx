import type { Station, TripOption } from "@/lib/types";

const PAPER = "#F7F5F0";
const NAVY = "#172233";
const RED = "#D92632";
const W = 360;
const H = 460;
const PAD = 56;

type Pt = { id: string; name: string; lat: number; lon: number };

function corridor(stations: Station[], a: Station, b: Station): Pt[] {
  const lo = Math.min(a.lat, b.lat) - 0.002;
  const hi = Math.max(a.lat, b.lat) + 0.002;
  return stations
    .filter((station) => station.id !== "DBRK" && station.lat >= lo && station.lat <= hi)
    .sort((left, right) => right.lat - left.lat)
    .map((station) => ({ id: station.id, name: station.name, lat: station.lat, lon: station.lon }));
}

function project(points: Pt[]) {
  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const minLon = Math.min(...points.map((point) => point.lon));
  const maxLon = Math.max(...points.map((point) => point.lon));
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const x0 = minLon * cos;
  const y1 = maxLat;
  const dx = Math.max((maxLon - minLon) * cos, 0.02);
  const dy = Math.max(maxLat - minLat, 0.02);
  const scale = Math.min((W - PAD * 2) / dx, (H - PAD * 2) / dy);
  const ox = (W - dx * scale) / 2;
  const oy = (H - dy * scale) / 2;
  return (lat: number, lon: number) => ({
    x: ox + (lon * cos - x0) * scale,
    y: oy + (y1 - lat) * scale,
  });
}

function pointsAttr(pts: { x: number; y: number }[]) {
  return pts.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

export function TripMap({
  stations,
  from,
  to,
  trip,
}: {
  stations: Station[];
  from: Station;
  to: Station;
  trip?: TripOption;
}) {
  const transfer = Boolean(trip?.transfer);
  const millbrae = stations.find((station) => station.id === "place_MLBR");
  const calEnd = transfer && millbrae ? millbrae : to;
  const spine = corridor(stations, from, calEnd);
  const calPts: Pt[] = spine.length >= 2 ? spine : [from, calEnd].filter((station) => station.lat && station.lon);
  const bartPts: Pt[] = transfer && millbrae ? [millbrae, to] : [];
  const all = [...calPts, ...bartPts];
  if (all.length < 2) return null;
  const xy = project(all);
  const cal = calPts.map((point) => ({ ...point, ...xy(point.lat, point.lon) }));
  const bart = bartPts.map((point) => ({ ...point, ...xy(point.lat, point.lon) }));
  const called = new Set((trip?.calls ?? []).map((call) => call.id));
  const ends = new Set([from.id, calEnd.id, to.id]);

  const labelFor = (id: string, name: string, x: number, y: number, sub?: string) => {
    const anchor = x > W * 0.62 ? "end" : "start";
    const dx = anchor === "start" ? 12 : -12;
    return (
      <text key={id} x={x + dx} y={sub ? y - 2 : y + 4} textAnchor={anchor} fill={NAVY} fontSize="13" fontFamily="inherit">
        <tspan x={x + dx}>{name}</tspan>
        {sub ? (
          <tspan x={x + dx} dy="15" fill={RED} fontSize="11" letterSpacing="0.08em">
            {sub}
          </tspan>
        ) : null}
      </text>
    );
  };

  const caption = transfer
    ? `Caltrain from ${from.name} to Millbrae, then BART Red to ${to.name}. Transfer at Millbrae.`
    : `Caltrain from ${from.name} to ${to.name}.`;

  return (
    <figure className="trip-map" id="trip-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={caption}>
        <rect width={W} height={H} fill={PAPER} />
        <polyline points={pointsAttr(cal)} fill="none" stroke={NAVY} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {bart.length >= 2 ? (
          <polyline points={pointsAttr(bart)} fill="none" stroke={RED} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {cal
          .filter((point) => !ends.has(point.id))
          .map((point) => (
            <circle
              key={point.id}
              cx={point.x}
              cy={point.y}
              r={called.has(point.id) ? 3.5 : 2}
              fill={called.has(point.id) ? NAVY : PAPER}
              stroke={NAVY}
              strokeWidth={called.has(point.id) ? 0 : 1.25}
            />
          ))}
        {cal
          .filter((point) => point.id === from.id || point.id === calEnd.id)
          .map((point) => (
            <circle key={`end-${point.id}`} cx={point.x} cy={point.y} r="6" fill={PAPER} stroke={NAVY} strokeWidth="2.5" />
          ))}
        {transfer && bart[0] ? <circle cx={bart[0].x} cy={bart[0].y} r="4" fill={RED} /> : null}
        {bart[1] ? <circle cx={bart[1].x} cy={bart[1].y} r="6" fill={PAPER} stroke={RED} strokeWidth="2.5" /> : null}
        {(() => {
          const origin = cal.find((point) => point.id === from.id);
          const dest = cal.find((point) => point.id === to.id);
          return (
            <>
              {origin ? labelFor(from.id, from.name, origin.x, origin.y) : null}
              {transfer && bart[0]
                ? labelFor("xfer", "Millbrae", bart[0].x, bart[0].y, "Transfer")
                : dest
                  ? labelFor(to.id, to.name, dest.x, dest.y)
                  : null}
            </>
          );
        })()}
        {bart[1] ? labelFor(to.id, to.name, bart[1].x, bart[1].y) : null}
      </svg>
      <figcaption>
        <span>
          <i className="swatch cal" /> Caltrain
        </span>
        {transfer ? (
          <span>
            <i className="swatch bart" /> BART Red
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
