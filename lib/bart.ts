import fs from "fs";
import path from "path";
import { gtfsEpoch, weekdayIndex } from "./time";

type BartTrip = {
  id: string;
  service: string;
  route: string;
  color: string;
  headsign: string;
  depart: string;
  arrive: string;
  fromStop: string;
  toStop: string;
};

type BartFeed = {
  source: string;
  calendar: {
    id: string;
    mon: string;
    tue: string;
    wed: string;
    thu: string;
    fri: string;
    sat: string;
    sun: string;
    start: string;
    end: string;
  }[];
  exceptions: { service: string; date: string; type: string }[];
  trips: BartTrip[];
};

export type BartRide = {
  id: string;
  line: string;
  color: string;
  headsign: string;
  departEpoch: number;
  arriveEpoch: number;
  fromStop: string;
};

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const globalBart = globalThis as unknown as { __bartFeed?: BartFeed };

function feed(): BartFeed {
  if (!globalBart.__bartFeed) {
    const file = path.join(process.cwd(), "data", "bart-mlbr-dbrk.json");
    globalBart.__bartFeed = JSON.parse(fs.readFileSync(file, "utf8")) as BartFeed;
  }
  return globalBart.__bartFeed;
}

function servicesOn(ymd: string): Set<string> {
  const data = feed();
  const compact = ymd.replace(/-/g, "");
  const key = DOW[weekdayIndex(ymd)];
  const active = new Set<string>();
  for (const row of data.calendar) {
    if (compact < row.start || compact > row.end) continue;
    if (row[key] === "1") active.add(row.id);
  }
  for (const row of data.exceptions) {
    if (row.date !== compact) continue;
    if (row.type === "1") active.add(row.service);
    if (row.type === "2") active.delete(row.service);
  }
  return active;
}

export function bartRides(ymd: string): BartRide[] {
  const services = servicesOn(ymd);
  return feed()
    .trips.filter((trip) => services.has(trip.service))
    .map((trip) => ({
      id: trip.id,
      line: trip.route.startsWith("Red") ? "Red" : trip.route,
      color: trip.color,
      headsign: trip.headsign,
      departEpoch: gtfsEpoch(ymd, trip.depart),
      arriveEpoch: gtfsEpoch(ymd, trip.arrive),
      fromStop: trip.fromStop,
    }))
    .sort((a, b) => a.departEpoch - b.departEpoch);
}

export function bartSource(): string {
  return feed().source;
}
