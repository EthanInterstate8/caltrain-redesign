import { bartRides } from "./bart";
import { activeServices, getCatalog } from "./gtfs";
import type { Catalog, StopTime, Trip } from "./gtfs";
import { addDays, formatLongDate, formatTime, gtfsEpoch, todayYmd, zonedEpoch } from "./time";
import type { Plan, Station, TripOption, WhenMode } from "./types";

const BERKELEY: Station = {
  id: "DBRK",
  name: "Downtown Berkeley",
  lat: 37.87011,
  lon: -122.268109,
  zone: "",
  access: "unlisted",
};
const MIN_TRANSFER_MS = 4 * 60 * 1000;
const STEP_FREE_TRANSFER_MS = 20 * 60 * 1000;

export type Query = {
  fromId?: string;
  toId?: string;
  when?: string;
  time?: string;
  date?: string;
  now?: number;
  stepFree?: boolean;
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

  const board = catalog.stopMeta.get(origin.stopId);
  const alight = catalog.stopMeta.get(dest.stopId);
  return {
    id: `${ymd}-${trip.id}`,
    tripId: trip.id,
    boardStopName: board?.name,
    alightStopName: alight?.name,
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
  if (query.fromId === "DBRK" || query.toId === "DBRK") return planBerkeley(query);
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
  return [...getCatalog().stations, BERKELEY];
}

function planBerkeley(query: Query): Plan {
  if (query.fromId !== "palo_alto" || query.toId !== "DBRK") {
    return {
      ok: false,
      error: "Downtown Berkeley is on BART. This preview plans it only from Palo Alto, with a transfer at Millbrae.",
    };
  }
  const catalog = getCatalog();
  const from = catalog.byId.get("palo_alto");
  const millbrae = catalog.byId.get("place_MLBR");
  if (!from || !millbrae) return { ok: false, error: "Palo Alto or Millbrae is missing from the Caltrain timetable." };

  const now = query.now ?? Date.now();
  const when: WhenMode = query.when === "depart" || query.when === "arrive" ? query.when : "now";
  const date = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : todayYmd(now);
  const clock = parseClock(query.time);

  const stepFree = query.stepFree === true;
  const buffer = stepFree ? STEP_FREE_TRANSFER_MS : MIN_TRANSFER_MS;
  const bufferMin = buffer / 60000;

  const build = (ymd: string) => {
    const trains = ridesOn(catalog, from, millbrae, ymd);
    const bart = bartRides(ymd);
    const joined: Omit<TripOption, "recommended">[] = [];
    for (const train of trains) {
      const bartRide = bart.find((ride) => ride.departEpoch >= train.arriveEpoch + buffer);
      if (!bartRide) continue;
      const waitMin = Math.round((bartRide.departEpoch - train.arriveEpoch) / 60000);
      joined.push({
        ...train,
        id: `${ymd}-${train.tripId}-${bartRide.id}`,
        headsign: "Downtown Berkeley",
        arriveEpoch: bartRide.arriveEpoch,
        arriveLabel: formatTime(bartRide.arriveEpoch),
        durationMin: Math.max(1, Math.round((bartRide.arriveEpoch - train.departEpoch) / 60000)),
        calls: [
          ...train.calls,
          { id: "DBRK", name: "Downtown Berkeley", time: formatTime(bartRide.arriveEpoch) },
        ],
        destAccess: "unlisted",
        transfer: {
          millbraeArrive: train.arriveLabel,
          millbraeArriveEpoch: train.arriveEpoch,
          waitMin,
          bartDepart: formatTime(bartRide.departEpoch),
          bartDepartEpoch: bartRide.departEpoch,
          bartArrive: formatTime(bartRide.arriveEpoch),
          bartLine: bartRide.line,
          bartColor: bartRide.color,
          bartHeadsign: bartRide.headsign,
          bartTripId: bartRide.id,
          boardStop: bartRide.fromStop === "W40-3" ? "Millbrae (Caltrain Transfer Platform)" : "Millbrae",
        },
        steps: berkeleySteps(train, waitMin, bartRide),
        accessNotes: berkeleyAccess(from, millbrae, train),
      });
    }
    return joined.sort((a, b) => a.arriveEpoch - b.arriveEpoch || a.departEpoch - b.departEpoch);
  };

  const pick = (rows: Omit<TripOption, "recommended">[]) => {
    if (rows.length === 0) return [];
    const best = rows[0];
    const backup = rows.find((row) => row.tripId !== best.tripId && row.departEpoch > best.departEpoch) ?? rows[1];
    const chosen = backup ? [best, backup] : [best];
    return chosen.map((row, index) => ({ ...row, recommended: index === 0 }));
  };

  if (when === "now") {
    let rows = build(date).filter((row) => row.departEpoch >= now - 30_000);
    let used = date;
    let nextDay = false;
    if (rows.length === 0) {
      used = addDays(date, 1);
      rows = build(used);
      nextDay = rows.length > 0;
    }
    const trips = pick(rows);
    if (trips.length === 0) {
      return { ok: false, error: "No Caltrain and BART connection from Palo Alto to Downtown Berkeley on this timetable." };
    }
    return {
      ok: true,
      from,
      to: BERKELEY,
      date: used,
      when,
      nextDay,
      note: berkeleyNote(stepFree, bufferMin),
      trips,
    };
  }

  if (!clock) return { ok: false, error: "Enter a time for that journey." };
  const stamp = zonedEpoch(date, clock.h, clock.m, 0);
  const all = build(date);
  const filtered = when === "arrive" ? all.filter((row) => row.arriveEpoch <= stamp) : all.filter((row) => row.departEpoch >= stamp);
  const trips = pick(when === "arrive" ? filtered.reverse() : filtered);
  if (when === "arrive" && trips.length) trips.forEach((trip, index) => (trip.recommended = index === 0));
  if (trips.length === 0) {
    return { ok: false, error: "No Caltrain and BART connection at that time." };
  }
  return {
    ok: true,
    from,
    to: BERKELEY,
    date,
    when,
    nextDay: false,
    note: berkeleyNote(stepFree, bufferMin),
    trips,
  };
}

function berkeleyNote(stepFree: boolean, bufferMin: number): string {
  const rule = stepFree
    ? `Step-free is on, so the connection at Millbrae must be at least ${bufferMin} minutes. BART's GTFS file does not publish wheelchair boarding, so a shorter gap is not treated as step-free.`
    : "Connections shorter than 4 minutes are not offered.";
  return `Caltrain to Millbrae, then BART Red from the Millbrae transfer platform. The transfer minutes are the gap in the timetable. ${rule} Live delays are not connected.`;
}

function side(name: string | undefined): string | undefined {
  if (!name) return undefined;
  if (/northbound/i.test(name)) return "northbound";
  if (/southbound/i.test(name)) return "southbound";
  return undefined;
}

function berkeleySteps(
  train: Omit<TripOption, "recommended">,
  waitMin: number,
  bartRide: { line: string; color: string; headsign: string; departEpoch: number; arriveEpoch: number; fromStop: string },
): string[] {
  const direction = side(train.boardStopName);
  const ridden = Math.max(train.calls.length - 1, 1);
  return [
    `Board Caltrain ${train.number} (${train.type}) at Palo Alto${direction ? `, ${direction}` : ""}, at ${train.departLabel}.`,
    `Ride ${ridden} stops and get off at Millbrae at ${train.arriveLabel}.`,
    `Transfer at Millbrae. The timetable leaves ${waitMin} minutes. BART Red line toward ${bartRide.headsign} departs ${formatTime(bartRide.departEpoch)} from the Millbrae transfer platform.`,
    `Arrive Downtown Berkeley at ${formatTime(bartRide.arriveEpoch)}.`,
  ];
}

function berkeleyAccess(from: Station, millbrae: Station, train: Omit<TripOption, "recommended">) {
  return [
    {
      station: "Palo Alto",
      detail: `${train.boardStopName ?? "Palo Alto"}: ${accessFact(from.access)}.`,
      source: "Caltrain GTFS stops.txt wheelchair_boarding",
    },
    {
      station: "Millbrae",
      detail: `${train.alightStopName ?? "Millbrae"}: ${accessFact(millbrae.access)}. The feed also names elevator stops at Millbrae. It does not say whether they are working.`,
      source: "Caltrain GTFS stops.txt",
    },
    {
      station: "Downtown Berkeley",
      detail: "The bundled BART GTFS file has no wheelchair_boarding field for this station.",
      source: "https://www.bart.gov/schedules/elevators",
    },
  ];
}

function accessFact(access: Station["access"]): string {
  if (access === "step-free") return "wheelchair_boarding 1 (step-free)";
  if (access === "not-step-free") return "wheelchair_boarding 2 (not step-free)";
  return "no wheelchair_boarding value";
}
