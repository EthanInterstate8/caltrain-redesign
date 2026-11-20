import { activeServices, getCatalog } from "./gtfs";
import { formatLongDate, formatTime, gtfsEpoch, todayYmd } from "./time";

export type Departure = { time: string; number: string; type: string };

function trainType(routeName: string): string {
  if (routeName.startsWith("Local")) return "Local";
  if (routeName.startsWith("Limited")) return "Limited";
  if (routeName.startsWith("Express")) return "Express";
  if (routeName.startsWith("South")) return "South County";
  return routeName || "Train";
}

export function stationBoard(stationId: string, direction: "north" | "south", now = Date.now()) {
  const catalog = getCatalog();
  const station = catalog.byId.get(stationId);
  const ymd = todayYmd(now);
  const services = activeServices(ymd);
  const want = direction === "north" ? "0" : "1";
  const seen = new Set<string>();
  const rows: (Departure & { epoch: number })[] = [];
  for (const stopId of catalog.children.get(stationId) ?? []) {
    for (const call of catalog.timesByStop.get(stopId) ?? []) {
      const trip = catalog.trips.get(call.tripId);
      if (!trip || trip.direction !== want || !services.has(trip.serviceId) || seen.has(trip.id)) continue;
      seen.add(trip.id);
      const epoch = gtfsEpoch(ymd, call.departure || call.arrival);
      rows.push({
        epoch,
        time: formatTime(epoch),
        number: trip.number,
        type: trainType(catalog.routeName.get(trip.routeId) || ""),
      });
    }
  }
  rows.sort((a, b) => a.epoch - b.epoch || a.number.localeCompare(b.number, undefined, { numeric: true }));
  return {
    station,
    dateLabel: formatLongDate(now),
    direction,
    departures: rows.map(({ time, number, type }) => ({ time, number, type })),
  };
}
