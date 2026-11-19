import { activeServices, getCatalog } from "./gtfs";

export type TrainCol = { number: string; type: string };
export type TableRow = { zone: string; name: string; times: (string | null)[] };
export type ScheduleTable = { trains: TrainCol[]; rows: TableRow[] };

export type Schedules = {
  weekday: { north: ScheduleTable; south: ScheduleTable };
  weekend: { north: ScheduleTable; south: ScheduleTable };
};

function clock(gtfs: string): string {
  const [hs, ms] = gtfs.split(":");
  let hour = Number(hs);
  const minute = Number(ms);
  const suffix = hour % 24 >= 12 ? "pm" : "am";
  hour = hour % 24;
  const h12 = hour % 12 || 12;
  return `${h12}:${String(minute).padStart(2, "0")}${suffix}`;
}

function kind(routeName: string): string {
  if (routeName.startsWith("Express")) return "Express";
  if (routeName.startsWith("Limited")) return "Limited";
  if (routeName.startsWith("Local")) return "Local";
  return routeName || "Train";
}

function table(ymd: string, direction: "0" | "1"): ScheduleTable {
  const catalog = getCatalog();
  const services = activeServices(ymd);
  const cols = [...catalog.trips.values()]
    .filter((trip) => services.has(trip.serviceId) && trip.direction === direction)
    .map((trip) => {
      const byParent = new Map<string, string>();
      let first = "99:99:99";
      for (const stop of catalog.timesByTrip.get(trip.id) ?? []) {
        const parent = catalog.parentOf.get(stop.stopId);
        if (!parent || byParent.has(parent)) continue;
        byParent.set(parent, stop.departure);
        if (stop.departure < first) first = stop.departure;
      }
      return {
        number: trip.number,
        type: kind(catalog.routeName.get(trip.routeId) || ""),
        first,
        byParent,
      };
    })
    .filter((col) => col.byParent.size > 0)
    .sort((a, b) => a.first.localeCompare(b.first) || a.number.localeCompare(b.number, undefined, { numeric: true }));

  const ordered = direction === "0" ? [...catalog.stations].reverse() : [...catalog.stations];
  return {
    trains: cols.map(({ number, type }) => ({ number, type })),
    rows: ordered.map((station) => ({
      zone: station.zone,
      name: station.name,
      times: cols.map((col) => {
        const raw = col.byParent.get(station.id);
        return raw ? clock(raw) : null;
      }),
    })),
  };
}

export function buildSchedules(): Schedules {
  return {
    weekday: { north: table("2026-11-19", "0"), south: table("2026-11-19", "1") },
    weekend: { north: table("2026-11-21", "0"), south: table("2026-11-21", "1") },
  };
}
