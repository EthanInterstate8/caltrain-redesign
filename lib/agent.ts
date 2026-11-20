import fs from "fs";
import path from "path";
import { parseCsv } from "./csv";
import { getCatalog } from "./gtfs";
import { listStations, planJourney, type Query } from "./plan";
import type { TripOption } from "./types";

export type AgentAction = "protect" | "explain" | "access";

type Alert = { agency: string; text: string };

const cache = globalThis as unknown as { __alerts?: { at: number; value: Alert[] | null } };

function accessFact(access: TripOption["originAccess"]): string {
  if (access === "step-free") return "GTFS wheelchair_boarding is 1 (accessible)";
  if (access === "not-step-free") return "GTFS wheelchair_boarding is 2 (not accessible)";
  return "GTFS does not publish wheelchair_boarding";
}

function millbraeElevators(): string[] {
  const file = path.join(process.cwd(), "data", "gtfs", "stops.txt");
  return parseCsv(fs.readFileSync(file, "utf8"))
    .filter((row) => row.parent_station === "place_MLBR" && /elevator/i.test(row.stop_name))
    .map((row) => row.stop_name);
}

function factsFor(trip: TripOption, backup: TripOption | undefined) {
  const elevators = millbraeElevators();
  return {
    liveAlerts: "not_connected" as const,
    instruction:
      "Use only these fields. Do not invent delays, outages, or elevator status. If liveAlerts is not_connected, say live alerts are not connected.",
    itinerary: {
      train: trip.number,
      type: trip.type,
      from: trip.calls[0]?.name,
      depart: trip.departLabel,
      to: trip.calls[trip.calls.length - 1]?.name,
      arrive: trip.arriveLabel,
      minutes: trip.durationMin,
      transfer: trip.transfer
        ? {
            millbraeArrive: trip.transfer.millbraeArrive,
            waitMinutes: trip.transfer.waitMin,
            minimumOfferedMinutes: 4,
            bartLine: trip.transfer.bartLine,
            bartColor: trip.transfer.bartColor,
            bartDepart: trip.transfer.bartDepart,
            bartArrive: trip.transfer.bartArrive,
            bartHeadsign: trip.transfer.bartHeadsign,
            boardAt: trip.transfer.boardStop,
          }
        : null,
    },
    backup: backup
      ? {
          train: backup.number,
          type: backup.type,
          depart: backup.departLabel,
          arrive: backup.arriveLabel,
          transferWaitMinutes: backup.transfer?.waitMin ?? null,
          bartDepart: backup.transfer?.bartDepart ?? null,
        }
      : null,
    access: [
      { station: trip.calls[0]?.name, fact: accessFact(trip.originAccess) },
      trip.transfer
        ? {
            station: "Millbrae",
            fact: `${accessFact(getCatalog().byId.get("place_MLBR")?.access ?? "unlisted")}. GTFS names these elevator stops: ${elevators.join("; ") || "none listed"}. The feed does not say if they are in service.`,
          }
        : { station: trip.calls[trip.calls.length - 1]?.name, fact: accessFact(trip.destAccess) },
      trip.transfer
        ? {
            station: "Downtown Berkeley",
            fact: "The bundled BART GTFS file does not include wheelchair_boarding for this station.",
          }
        : null,
    ].filter(Boolean),
  };
}

function deterministic(action: AgentAction, trip: TripOption, backup: TripOption | undefined): string {
  const live = "Live alerts not connected.";
  if (action === "protect") {
    const link = trip.transfer
      ? `Caltrain ${trip.number} is scheduled into Millbrae at ${trip.transfer.millbraeArrive}. BART ${trip.transfer.bartLine} is scheduled at ${trip.transfer.bartDepart}, ${trip.transfer.waitMin} minutes later. Nothing here is a live delay.`
      : `Train ${trip.number} is scheduled to leave at ${trip.departLabel} and arrive at ${trip.arriveLabel}. Nothing here is a live delay.`;
    const alt = backup
      ? ` The next connection in the timetable is train ${backup.number} at ${backup.departLabel}, arriving ${backup.arriveLabel}.`
      : " No later connection is in this list.";
    return `${live} ${link}${alt}`;
  }
  if (action === "explain") {
    if (!trip.transfer) {
      return `${live} Stay on Caltrain ${trip.number} (${trip.type}) from ${trip.departLabel} to ${trip.arriveLabel}. This timetable shows no transfer.`;
    }
    return `${live} Board Caltrain ${trip.number} (${trip.type}) at ${trip.calls[0]?.name} at ${trip.departLabel}. Get off at Millbrae at ${trip.transfer.millbraeArrive}. The timetable leaves ${trip.transfer.waitMin} minutes before BART ${trip.transfer.bartLine} (${trip.transfer.bartHeadsign}) at ${trip.transfer.bartDepart} from ${trip.transfer.boardStop}. Get off at Downtown Berkeley at ${trip.transfer.bartArrive}.`;
  }
  const bits = factsFor(trip, backup).access as { station: string; fact: string }[];
  return `${live} ${bits.map((bit) => `${bit.station}: ${bit.fact}`).join(" ")}`;
}

async function liveAlerts(): Promise<Alert[] | null> {
  const key = process.env.API_511_KEY;
  if (!key) return null;
  if (cache.__alerts && Date.now() - cache.__alerts.at < 5 * 60 * 1000) return cache.__alerts.value;
  const alerts: Alert[] = [];
  for (const agency of ["CT", "BA"] as const) {
    const url = `https://api.511.org/transit/servicealerts?api_key=${encodeURIComponent(key)}&agency=${agency}&format=json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) continue;
    const json = (await res.json()) as { entity?: { alert?: Record<string, unknown> }[] };
    for (const entity of json.entity ?? []) {
      const text = alertText(entity.alert);
      if (text) alerts.push({ agency, text: text.slice(0, 400) });
    }
  }
  const value = alerts.slice(0, 12);
  cache.__alerts = { at: Date.now(), value };
  return value;
}

function alertText(alert: Record<string, unknown> | undefined): string {
  if (!alert) return "";
  const header = alert.header_text ?? alert.headerText;
  if (!header || typeof header !== "object") return "";
  const translations = (header as { translation?: { text?: string }[] }).translation;
  return translations?.map((item) => item.text).filter(Boolean).join(" ") ?? "";
}

async function grok(action: AgentAction, payload: unknown): Promise<string | null> {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  const model = process.env.XAI_MODEL || "grok-4";
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are ONE Agent on a Caltrain planner. Use only the JSON facts. Never invent delays, outages, elevator status, or times. If liveAlerts is not_connected, say live alerts are not connected. Write 2 to 5 plain sentences for the requested action: protect (backup if this trip fails), explain (the transfer steps), or access (only the accessibility facts given).",
        },
        { role: "user", content: JSON.stringify({ action, facts: payload }) },
      ],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() || null;
}

export async function runAgent(query: Query & { action?: string; tripId?: string }) {
  const action: AgentAction =
    query.action === "explain" || query.action === "access" || query.action === "protect" ? query.action : "protect";
  const plan = planJourney(query);
  if (!plan || !plan.ok) {
    return { title: "ONE Agent", text: "Live alerts not connected. That trip is not in the timetable.", live: false };
  }
  const trip = plan.trips.find((item) => item.id === query.tripId) ?? plan.trips[0];
  const backup = plan.trips.find((item) => item.id !== trip.id);
  const base = factsFor(trip, backup);
  let alerts: Alert[] | null = null;
  try {
    alerts = await liveAlerts();
  } catch {
    alerts = null;
  }
  const payload = alerts
    ? { ...base, liveAlerts: alerts.length ? alerts : "none_in_feed" }
    : base;
  const titles = { protect: "Rescue", explain: "Confidence", access: "Access" };
  let text: string | null = null;
  try {
    text = await grok(action, payload);
  } catch {
    text = null;
  }
  if (!text) text = deterministic(action, trip, backup);
  else if (!process.env.API_511_KEY && !/live alerts not connected/i.test(text)) {
    text = `Live alerts not connected. ${text}`;
  }
  return { title: titles[action], text, live: Boolean(alerts) };
}

export type AskPlan = { label: string; fromId: string; toId: string };

function clockFromQuestion(question: string): string | undefined {
  const match = question.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = match[2] ?? "00";
  const ap = match[3].toLowerCase();
  if (ap === "pm" && hour < 12) hour += 12;
  if (ap === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function stationsIn(question: string): { id: string; name: string }[] {
  const q = ` ${question.toLowerCase()} `;
  const hits: { id: string; name: string; at: number }[] = [];
  const add = (id: string, name: string, key: string) => {
    const at = q.indexOf(key);
    if (at >= 0 && !hits.some((hit) => hit.id === id)) hits.push({ id, name, at });
  };
  add("DBRK", "Downtown Berkeley", "berkeley");
  add("san_francisco", "San Francisco", "san francisco");
  if (/\bsf\b/.test(q)) add("san_francisco", "San Francisco", " sf ");
  for (const station of listStations()) {
    if (station.name.length < 4) continue;
    add(station.id, station.name, station.name.toLowerCase());
  }
  return hits.sort((a, b) => a.at - b.at).map(({ id, name }) => ({ id, name }));
}

function elevatorStations(): { station: string; names: string[] }[] {
  const file = path.join(process.cwd(), "data", "gtfs", "stops.txt");
  const rows = parseCsv(fs.readFileSync(file, "utf8")).filter((row) => /elevator/i.test(row.stop_name));
  const catalog = getCatalog();
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const parent = catalog.byId.get(row.parent_station);
    const key = parent?.name || row.parent_station || row.stop_name;
    const list = grouped.get(key) ?? [];
    list.push(row.stop_name);
    grouped.set(key, list);
  }
  return [...grouped.entries()].map(([station, names]) => ({ station, names }));
}

export async function askQuestion(question: string, context?: Query) {
  const found = stationsIn(question);
  const wantsAccess = /elevator|wheelchair|step-free|accessible/i.test(question);
  const wantsOnTime = /on time|delay|delayed|running late/i.test(question);
  const time = clockFromQuestion(question);
  let fromId = context?.fromId;
  let toId = context?.toId;
  if (found.length >= 2) {
    fromId = found[0].id;
    toId = found[1].id;
  } else if (/berkeley/i.test(question)) {
    fromId = found.find((station) => station.id !== "DBRK")?.id || "palo_alto";
    toId = "DBRK";
  } else if (found.length === 1 && /\bto\b/i.test(question)) {
    toId = found[0].id;
  }
  const plans: AskPlan[] = [];
  if (fromId && toId && fromId !== toId) {
    const nameOf = (id: string) => listStations().find((station) => station.id === id)?.name || id;
    plans.push({ label: `Plan ${nameOf(fromId)} to ${nameOf(toId)}`, fromId, toId });
  }
  const plan = fromId && toId ? planJourney({ fromId, toId, when: time ? "depart" : "now", time, stepFree: wantsAccess }) : null;
  const trip = plan && plan.ok ? plan.trips[0] : undefined;
  const sources = [
    "Caltrain GTFS stops.txt and stop_times.txt",
    toId === "DBRK" ? "BART GTFS, Millbrae transfer platform to Downtown Berkeley" : "",
  ].filter(Boolean);
  let alerts: Alert[] | null = null;
  try {
    alerts = await liveAlerts();
  } catch {
    alerts = null;
  }
  const elevators = wantsAccess ? elevatorStations() : [];
  const facts = {
    question,
    liveAlerts: alerts ?? "not_connected",
    itinerary: trip
      ? {
          train: trip.number,
          type: trip.type,
          depart: trip.departLabel,
          arrive: trip.arriveLabel,
          minutes: trip.durationMin,
          transfer: trip.transfer ?? null,
          steps: trip.steps ?? [],
        }
      : null,
    access: trip?.accessNotes ?? null,
    elevatorStops: elevators,
  };
  let text: string | null = null;
  if (process.env.XAI_API_KEY) {
    try {
      text = await grok("explain", { ...facts, instruction: "Answer the question using only these facts. Never invent delays or elevator status." });
    } catch {
      text = null;
    }
  }
  if (!text) {
    const live = "Live alerts not connected.";
    if (wantsOnTime && !trip) {
      text = `${live} I can't say if that train is on time. Name the station you are leaving from and I can show the scheduled trains.`;
    } else if (wantsAccess && elevators.length && found.length === 0) {
      text = `${live} These Caltrain stations have elevator stops named in GTFS: ${elevators.map((item) => item.station).join(", ")}. The feed does not say if they are working. Live elevator status not connected.`;
      sources.push("https://www.bart.gov/schedules/elevators");
    } else if (trip?.transfer) {
      text = `${live} ${trip.steps?.join(" ") ?? ""} Scheduled only. This is not a live delay.`;
    } else if (trip) {
      text = `${live} Next scheduled train is ${trip.number} ${trip.type}, ${trip.departLabel} to ${trip.arriveLabel} (${trip.durationMin} min). That is the timetable, not a live status.`;
    } else if (wantsAccess && found[0]) {
      const station = getCatalog().byId.get(found[0].id);
      text = station
        ? `${live} ${station.name}: ${accessFact(station.access)}. Live elevator status not connected.`
        : `${live} I can only check stations in the Caltrain GTFS feed.`;
      sources.push("https://www.bart.gov/schedules/elevators");
    } else {
      text = `${live} I can look up a Caltrain trip, a station's wheelchair boarding flag, or the Palo Alto to Downtown Berkeley transfer. I won't guess a delay.`;
    }
  } else if (!process.env.API_511_KEY && !/live alerts not connected/i.test(text)) {
    text = `Live alerts not connected. ${text}`;
  }
  return { title: "ONE Agent", text, live: Boolean(alerts), sources, plans };
}
