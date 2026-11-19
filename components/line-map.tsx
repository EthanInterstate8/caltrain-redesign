"use client";

import type { Station } from "@/lib/types";

export function LineMap({
  stations,
  fromId,
  toId,
  calls,
  onPick,
}: {
  stations: Station[];
  fromId?: string;
  toId?: string;
  calls?: string[];
  onPick: (id: string) => void;
}) {
  const fromIndex = stations.findIndex((station) => station.id === fromId);
  const toIndex = stations.findIndex((station) => station.id === toId);
  const ready = fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex;
  const lo = Math.min(fromIndex, toIndex);
  const hi = Math.max(fromIndex, toIndex);
  const callSet = new Set(calls ?? []);
  const south = toIndex > fromIndex;
  const row = 24;
  const top = ready ? lo * row + row / 2 : 0;
  const height = ready ? Math.max((hi - lo) * row, 2) : 0;

  return (
    <div className="line-wrap" id="line">
      <p className="line-caption">
        <span>{ready ? (south ? "South" : "North") : "The line"}</span>
        <span>Zones 1–6</span>
      </p>
      <ol className="line">
        {ready ? (
          <span className="seg" style={{ top: `${top}px`, height: `${height}px` }} aria-hidden />
        ) : null}
        {stations.map((station, index) => {
          const end = station.id === fromId || station.id === toId;
          const inside = ready && index >= lo && index <= hi;
          const stops = !calls || callSet.has(station.id);
          const cls = [
            end ? "end" : "",
            inside && stops ? "on" : "",
            inside && !stops ? "passed" : "",
            ready && !inside ? "dim" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={station.id} className={cls}>
              <button type="button" onClick={() => onPick(station.id)} aria-pressed={end}>
                <span className="tick" aria-hidden />
                <span className="nm">{station.name}</span>
                <span className="zn">{station.zone}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
