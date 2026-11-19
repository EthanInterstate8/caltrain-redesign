import { activeServices, getCatalog } from "./gtfs";
import type { Catalog, StopTime, Trip } from "./gtfs";
import { addDays, formatLongDate, formatTime, gtfsEpoch, todayYmd, zonedEpoch } from "./time";
import type { Plan, Station, TripOption, WhenMode } from "./types";

export type Query = {
  fromId?: string;
  toId?: string;
  when?: string;
  time?: string;
  date?: string;
  now?: number;
};

function trainType(routeName: string): string {
  if (routeName.startsWith("Local")) return "Local";
  if (routeName.startsWith("Limited")) return "Limited";
  if (routeName.startsWith("Express")) return "Express";
  return routeName || "Train";
}

function parseClock(value: string | undefined): { h: number; m: number } | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

function ridesOn(
  catalog: Catalog,
  from: Station,
  to: Station,
  ymd: string,
): Omit<TripOption, "recommended">[] {
  const services = activeServices(ymd);
  const fromStops = new Set(catalog.children.get(from.id) ?? []);
  const toStops = new Set(catalog.children.get(to.id) ?? []);
  const seen = new Set<string>();
  const options: Omit<TripOption, "recommended">[] = [];

  for (const stopId of fromStops) {
    for (const hit of catalog.timesByStop.get(stopId) ?? []) {
      if (seen.has(hit.tripId)) continue;
      const trip = catalog.trips.get(hit.tripId);
      if (!trip || !services.has(trip.serviceId)) continue;
      const times = catalog.timesByTrip.get(hit.tripId);
      if (!times) continue;
      const dest = times.find((time) => toStops.has(time.stopId) && time.seq > hit.seq);
      if (!dest) continue;
      seen.add(hit.tripId);
      options.push(toOption(catalog, trip, times, hit, dest, from, to, ymd));
    }
  }

  options.sort((a, b) => a.departEpoch - b.departEpoch || a.arriveEpoch - b.arriveEpoch);
  return options;
}

function toOption(
  catalog: Catalog,
  trip: Trip,
  times: StopTime[],
  origin: StopTime,
  dest: StopTime,
  from: Station,
  to: Station,
  ymd: string,
): Omit<TripOption, "recommended"> {
  const departEpoch = gtfsEpoch(ymd, origin.departure);
  const arriveEpoch = gtfsEpoch(ymd, dest.arrival);
  const calls = times
    .filter((time) => time.seq >= origin.seq && time.seq <= dest.seq)
    .map((time) => {
      const parent = catalog.parentOf.get(time.stopId);
      const station = parent ? catalog.byId.get(parent) : undefined;
      return {
        id: station?.id || time.stopId,
        name: station?.name || time.stopId,
        time: formatTime(gtfsEpoch(ymd, time.arrival || time.departure)),
      };
    })
    .filter((call, index, list) => list.findIndex((item) => item.id === call.id) === index);

  return {
    id: `${ymd}-${trip.id}`,
    tripId: trip.id,
    number: trip.number,
    type: trainType(catalog.routeName.get(trip.routeId) || ""),
    headsign: trip.headsign,
    departEpoch,
    arriveEpoch,
    departLabel: formatTime(departEpoch),
    arriveLabel: formatTime(arriveEpoch),
    durationMin: Math.max(1, Math.round((arriveEpoch - departEpoch) / 60000)),
    calls,
    originAccess: from.access,
    destAccess: to.access,
  };
}

function mark(trips: Omit<TripOption, "recommended">[], when: WhenMode): TripOption[] {
  if (trips.length === 0) return [];
  let best = 0;
  if (when === "arrive") {
    best = trips.reduce((win, trip, index) => (trip.departEpoch > trips[win].departEpoch ? index : win), 0);
  } else {
    best = trips.reduce((win, trip, index) => (trip.arriveEpoch < trips[win].arriveEpoch ? index : win), 0);
  }
  return trips.map((trip, index) => ({ ...trip, recommended: index === best }));
}

export function planJourney(query: Query): Plan | null {
  if (!query.fromId || !query.toId) return null;
  const catalog = getCatalog();
  const from = catalog.byId.get(query.fromId);
  const to = catalog.byId.get(query.toId);
  if (!from || !to) return { ok: false, error: "Those stations are not in the Caltrain timetable." };
  if (from.id === to.id) return { ok: false, error: "Choose two different stations." };

  const now = query.now ?? Date.now();
  const when: WhenMode = query.when === "depart" || query.when === "arrive" ? query.when : "now";
  const date = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : todayYmd(now);
  const clock = parseClock(query.time);

  const collect = (ymd: string) => ridesOn(catalog, from, to, ymd);

  if (when === "now") {
    let trips = collect(date).filter((trip) => trip.departEpoch >= now - 30_000);
    let nextDay = false;
    let used = date;
    if (trips.length === 0) {
      used = addDays(date, 1);
      trips = collect(used);
      nextDay = trips.length > 0;
    }
    const sliced = mark(trips.slice(0, 8), "now");
    if (sliced.length === 0) {
      return {
        ok: false,
        error: `No scheduled train from ${from.name} to ${to.name} on this timetable.`,
      };
    }
    return {
      ok: true,
      from,
      to,
      date: used,
      when,
      nextDay,
      note: nextDay
        ? `Nothing else today. First trains ${formatLongDate(sliced[0].departEpoch)}.`
        : "Times are the published timetable. Live delays are not connected.",
      trips: sliced,
    };
  }

  if (!clock) return { ok: false, error: "Enter a time for that journey." };
  const stamp = zonedEpoch(date, clock.h, clock.m, 0);
  const all = collect(date);
  const filtered =
    when === "arrive"
      ? all.filter((trip) => trip.arriveEpoch <= stamp && trip.departEpoch >= stamp - 18 * 3600_000)
      : all.filter((trip) => trip.departEpoch >= stamp);

  const pool = when === "arrive" ? filtered.slice(-8) : filtered.slice(0, 8);
  const trips = mark(pool, when);
  if (trips.length === 0) {
    const verb = when === "arrive" ? "arriving by" : "departing after";
    return {
      ok: false,
      error: `No scheduled train from ${from.name} to ${to.name} ${verb} ${formatTime(stamp)}.`,
    };
  }
  return {
    ok: true,
    from,
    to,
    date,
    when,
    nextDay: false,
    note: "Times are the published timetable. Live delays are not connected.",
    trips,
  };
}

export function listStations(): Station[] {
  return getCatalog().stations;
}
