import fs from "fs";
import path from "path";
import { parseCsv } from "./csv";
import type { Access, ServiceInfo, Station } from "./types";
import { partsInZone, todayYmd, weekdayIndex } from "./time";

type CalendarRow = {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
};

type StopTime = {
  tripId: string;
  arrival: string;
  departure: string;
  stopId: string;
  seq: number;
};

type Trip = {
  id: string;
  routeId: string;
  serviceId: string;
  number: string;
  headsign: string;
  direction: string;
};

type Catalog = {
  stations: Station[];
  byId: Map<string, Station>;
  children: Map<string, string[]>;
  parentOf: Map<string, string>;
  trips: Map<string, Trip>;
  timesByTrip: Map<string, StopTime[]>;
  timesByStop: Map<string, StopTime[]>;
  routeName: Map<string, string>;
  calendar: CalendarRow[];
  exceptions: { service_id: string; date: string; exception_type: string }[];
  range: string;
};

const DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function shortName(name: string): string {
  return name
    .replace(/\s+Caltrain Station$/i, "")
    .replace(/\s+Station$/i, "")
    .replace(/\s+Caltrain$/i, "")
    .trim();
}

function zoneNumber(name: string): string {
  const match = name.match(/Zone\s+(\d+)/i);
  return match ? match[1] : "";
}

function accessOf(codes: number[]): Access {
  const known = codes.filter((code) => code === 1 || code === 2);
  if (known.length === 0) return "unlisted";
  if (known.every((code) => code === 1)) return "step-free";
  if (known.every((code) => code === 2)) return "not-step-free";
  return "not-step-free";
}

function load(): Catalog {
  const dir = path.join(process.cwd(), "data", "gtfs");
  const read = (file: string) => parseCsv(fs.readFileSync(path.join(dir, file), "utf8"));

  const stops = read("stops.txt");
  const zones = new Map(read("farezone_attributes.txt").map((row) => [row.zone_id, zoneNumber(row.zone_name)]));
  const routes = read("routes.txt");
  const routeName = new Map(routes.map((row) => [row.route_id, row.route_short_name]));

  const parents = stops.filter((row) => row.location_type === "1");
  const platforms = stops.filter((row) => row.location_type === "0" && row.parent_station);

  const childCodes = new Map<string, number[]>();
  const childZones = new Map<string, string>();
  const children = new Map<string, string[]>();
  const parentOf = new Map<string, string>();

  for (const platform of platforms) {
    const parent = platform.parent_station;
    const list = children.get(parent) ?? [];
    list.push(platform.stop_id);
    children.set(parent, list);
    parentOf.set(platform.stop_id, parent);
    const codes = childCodes.get(parent) ?? [];
    codes.push(Number(platform.wheelchair_boarding || "0"));
    childCodes.set(parent, codes);
    if (!childZones.has(parent) && platform.zone_id) {
      childZones.set(parent, zones.get(platform.zone_id) || "");
    }
  }

  const stationDrafts: Station[] = parents.map((row) => ({
    id: row.stop_id,
    name: shortName(row.stop_name),
    lat: Number(row.stop_lat),
    lon: Number(row.stop_lon),
    zone: childZones.get(row.stop_id) || "",
    access: accessOf(childCodes.get(row.stop_id) ?? []),
  }));

  const trips = new Map<string, Trip>();
  for (const row of read("trips.txt")) {
    trips.set(row.trip_id, {
      id: row.trip_id,
      routeId: row.route_id,
      serviceId: row.service_id,
      number: row.trip_short_name || row.trip_id,
      headsign: row.trip_headsign,
      direction: row.direction_id,
    });
  }

  const timesByTrip = new Map<string, StopTime[]>();
  const timesByStop = new Map<string, StopTime[]>();
  for (const row of read("stop_times.txt")) {
    const time: StopTime = {
      tripId: row.trip_id,
      arrival: row.arrival_time,
      departure: row.departure_time,
      stopId: row.stop_id,
      seq: Number(row.stop_sequence),
    };
    const tripList = timesByTrip.get(time.tripId) ?? [];
    tripList.push(time);
    timesByTrip.set(time.tripId, tripList);
    const stopList = timesByStop.get(time.stopId) ?? [];
    stopList.push(time);
    timesByStop.set(time.stopId, stopList);
  }
  for (const list of timesByTrip.values()) list.sort((a, b) => a.seq - b.seq);

  const served = new Set<string>();
  for (const stopId of timesByStop.keys()) {
    const parent = parentOf.get(stopId);
    if (parent) served.add(parent);
  }
  const stations = stationDrafts.filter((station) => served.has(station.id)).sort((a, b) => b.lat - a.lat);

  const calendar = read("calendar.txt") as CalendarRow[];
  const exceptions = read("calendar_dates.txt").map((row) => ({
    service_id: row.service_id,
    date: row.date,
    exception_type: row.exception_type,
  }));

  const starts = calendar.map((row) => row.start_date).sort();
  const ends = calendar.map((row) => row.end_date).sort();
  const pretty = (compact: string) => {
    const y = compact.slice(0, 4);
    const m = Number(compact.slice(4, 6));
    const d = Number(compact.slice(6, 8));
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
    return `${month} ${d}, ${y}`;
  };

  return {
    stations,
    byId: new Map(stations.map((station) => [station.id, station])),
    children,
    parentOf,
    trips,
    timesByTrip,
    timesByStop,
    routeName,
    calendar,
    exceptions,
    range: `${pretty(starts[0] || "")} – ${pretty(ends[ends.length - 1] || "")}`,
  };
}

const globalCatalog = globalThis as unknown as { __caltrainCatalog?: Catalog };

export function getCatalog(): Catalog {
  if (!globalCatalog.__caltrainCatalog) globalCatalog.__caltrainCatalog = load();
  return globalCatalog.__caltrainCatalog;
}

export function activeServices(ymd: string): Set<string> {
  const catalog = getCatalog();
  const compact = ymd.replace(/-/g, "");
  const key = DOW[weekdayIndex(ymd)];
  const active = new Set<string>();
  for (const row of catalog.calendar) {
    if (compact < row.start_date || compact > row.end_date) continue;
    if (row[key] === "1") active.add(row.service_id);
  }
  for (const row of catalog.exceptions) {
    if (row.date !== compact) continue;
    if (row.exception_type === "1") active.add(row.service_id);
    if (row.exception_type === "2") active.delete(row.service_id);
  }
  return active;
}

export function describeService(now = Date.now()): ServiceInfo {
  const catalog = getCatalog();
  const ymd = todayYmd(now);
  const services = activeServices(ymd);
  const p = partsInZone(now);
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
  }).format(new Date(now));
  let kind = "No scheduled service";
  if (services.size) {
    const weekend = p.weekday === "Saturday" || p.weekday === "Sunday";
    kind = weekend ? "Weekend timetable" : "Weekday timetable";
    const names = [...services].join(" ");
    if (!weekend && names.includes("d_96") && !names.includes("d_31")) kind = "Holiday timetable";
  }
  return {
    dateLabel: `${p.weekday}, ${month} ${p.day}`,
    kind,
    range: catalog.range,
  };
}

export type { Catalog, StopTime, Trip };
