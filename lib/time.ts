const TZ = "America/Los_Angeles";

type Zoned = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

export function partsInZone(epoch: number): Zoned {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(epoch))) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday: bag.weekday,
  };
}

export function todayYmd(now = Date.now()): string {
  const p = partsInZone(now);
  return toYmd(p.year, p.month, p.day);
}

export function toYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function weekdayIndex(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function zonedEpoch(ymd: string, hour: number, minute: number, second = 0): number {
  const [y, m, d] = ymd.split("-").map(Number);
  let utc = Date.UTC(y, m - 1, d, hour, minute, second);
  for (let i = 0; i < 3; i++) {
    const p = partsInZone(utc);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const desired = Date.UTC(y, m - 1, d, hour, minute, second);
    utc += desired - seen;
  }
  return utc;
}

export function gtfsEpoch(serviceYmd: string, gtfsTime: string): number {
  const [hh, mm, ss] = gtfsTime.split(":").map((n) => Number(n) || 0);
  const extra = Math.floor(hh / 24);
  const hour = hh % 24;
  const day = extra ? addDays(serviceYmd, extra) : serviceYmd;
  return zonedEpoch(day, hour, mm, ss);
}

export function formatTime(epoch: number): string {
  const p = partsInZone(epoch);
  const suffix = p.hour >= 12 ? "PM" : "AM";
  const hour = p.hour % 12 || 12;
  return `${hour}:${String(p.minute).padStart(2, "0")} ${suffix}`;
}

export function formatClock(epoch: number): string {
  const p = partsInZone(epoch);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function formatLongDate(epoch: number): string {
  const p = partsInZone(epoch);
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "long",
  }).format(new Date(epoch));
  return `${p.weekday}, ${month} ${p.day}`;
}

export function formatCountdown(departEpoch: number, now: number): string {
  const diff = departEpoch - now;
  if (diff <= -60_000) return "Departed";
  if (diff <= 30_000) return "Boarding";
  const total = Math.floor(diff / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return `Leaves in ${hours}h ${rem}m`;
  }
  if (minutes >= 1) return `Leaves in ${minutes} min`;
  return `Leaves in ${seconds}s`;
}
