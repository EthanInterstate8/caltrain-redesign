import fs from "fs";
import path from "path";
import { parseCsv } from "./csv";
import { getCatalog } from "./gtfs";
import { listStations, planJourney, type Query } from "./plan";
import type { TripOption } from "./types";

export type AgentAction = "protect" | "explain" | "access";

type Alert = { agency: string; text: string };

const cache = globalThis as unknown as { __alerts?: { at: number; value: Alert[] } };

const NOT_CONNECTED = "Live alerts not connected.";
const NO_ALERTS = "No active service alerts right now.";

const ticketFacts = {
  source: "https://www.caltrain.com/fares",
  howToBuy: "https://www.caltrain.com/fares/how-buy",
  facts: [
    "Fares are zone-based: the price depends on how many zones you ride. San Francisco to Palo Alto is three zones. Do not quote a price; send riders to https://www.caltrain.com/fares.",
    "Clipper is the reloadable card for cash value and a Monthly Pass. Riders can use a physical card or a digital Clipper card.",
    "A Clipper card can be added to Apple Pay or Google Pay, or used from the Clipper app, then tapped at the validator.",
    "Contactless tap-to-pay is accepted for adult fares: a contactless Visa, Mastercard, American Express, or Discover credit or debit card, or that card in Apple Pay or Google Pay. Youth, Senior, Clipper START, and Clipper Access fares still need a registered Clipper card.",
    "The Caltrain fares pages do not list a Caltrain Mobile app for buying tickets. They tell riders to use Clipper or a station ticket machine.",
    "Ticket machines at stations sell one-way tickets and day passes, sell adult Clipper cards, and can load cash or transit products onto Clipper cards. They take coins, bills, and credit or Visa/Mastercard debit. Tickets are for the day of travel.",
    "Tap on and tap off at the Clipper validator for each trip, with the same card or phone, one card at a time.",
    "A one-way ticket is valid for four hours in one direction. A day pass allows unlimited travel inside the zones purchased and is sold at a ticket machine.",
  ],
};

const GROK_SYSTEM = [
  "You are ONE, a friendly Caltrain guide. Write 2 to 5 concise sentences in plain language.",
  "Answer general questions about Caltrain, Bay Area transit, stations, travel tips, and what to do near a station. Use general knowledge plus the facts you are given. Do not refuse just because a schedule or feed does not cover the question.",
  "Treat the bundled timetable, liveAlerts, and ticketFacts as authoritative when they apply. Do not invent train times, train numbers, or fares. If a price is not in ticketFacts, give https://www.caltrain.com/fares instead.",
  "For delays, elevator outages, and crowding, say only what liveAlerts and the timetable say. Never guess. If liveAlerts is an empty list and the rider asks about delays or whether a train is on time, say exactly: No active service alerts right now. If liveAlerts is not_connected, say live alerts are not connected.",
  "Never mention null, missing fields, JSON, or how the data is structured.",
  "If there is no question: protect offers a backup from the timetable, explain describes the transfer, and access uses only the accessibility facts given.",
].join(" ");

function runtimeEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function liveLine(alerts: Alert[] | null): string {
  if (!alerts) return NOT_CONNECTED;
  if (alerts.length === 0) return NO_ALERTS;
  return `Live 511 alerts: ${alerts.map((alert) => `${alert.agency}: ${alert.text}`).join(" ")}`;
}

function tidy(text: string): string {
  return text
    .replace(/\b(null fields?|internal data structure|JSON)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function withLiveStatus(text: string, alerts: Alert[] | null): string {
  if (!/live alerts not connected/i.test(text)) return tidy(text);
  const body = text.replace(/Live alerts not connected\.?\s*/gi, "").trim();
  if (!alerts) return tidy(`${NOT_CONNECTED} ${body}`);
  if (alerts.length === 0) return tidy(body.startsWith(NO_ALERTS) ? body : `${NO_ALERTS} ${body}`);
  return tidy(`${liveLine(alerts)} ${body}`);
}

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
    ticketFacts,
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
  const key = runtimeEnv("API_511_KEY");
  if (!key) return null;
  const cached = cache.__alerts;
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.value;
  const alerts: Alert[] = [];
  let connected = false;
  for (const agency of ["CT", "BA"] as const) {
    try {
      const url = `https://api.511.org/transit/servicealerts?api_key=${encodeURIComponent(key)}&agency=${agency}&format=json`;
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const raw = (await res.text()).replace(/^\uFEFF/, "").trim();
      const json = JSON.parse(raw) as {
        entity?: { alert?: Record<string, unknown> }[];
        error?: unknown;
        Error?: unknown;
        message?: unknown;
        Message?: unknown;
      };
      if ((json.error || json.Error || json.message || json.Message) && !Array.isArray(json.entity)) continue;
      connected = true;
      for (const entity of json.entity ?? []) {
        const text = alertText(entity.alert);
        if (text) alerts.push({ agency, text: text.slice(0, 400) });
      }
    } catch {
      // Skip this agency. Do not log: the request URL contains the key.
    }
  }
  if (!connected) return null;
  const value = alerts.slice(0, 12);
  cache.__alerts = { at: Date.now(), value };
  return value;
}

function translationText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const translation = (value as { translation?: { text?: string } | { text?: string }[] }).translation;
  const list = Array.isArray(translation) ? translation : translation ? [translation] : [];
  return list.map((item) => item.text).filter(Boolean).join(" ");
}

function alertText(alert: Record<string, unknown> | undefined): string {
  if (!alert) return "";
  return (
    translationText(alert.header_text ?? alert.headerText) ||
    translationText(alert.description_text ?? alert.descriptionText)
  );
}

function omitEmpty(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitEmpty);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== null && item !== undefined)
        .map(([key, item]) => [key, omitEmpty(item)]),
    );
  }
  return value;
}

async function grok(action: AgentAction, payload: unknown): Promise<string | null> {
  const key = runtimeEnv("XAI_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model: "grok-4.7",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: GROK_SYSTEM,
          },
          { role: "user", content: JSON.stringify({ action, facts: omitEmpty(payload) }) },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
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
  const payload = { ...base, ticketFacts, liveAlerts: alerts ?? "not_connected" };
  const titles = { protect: "Rescue", explain: "Confidence", access: "Access" };
  let text: string | null = null;
  try {
    text = await grok(action, payload);
  } catch {
    text = null;
  }
  if (!text) text = deterministic(action, trip, backup);
  return { title: titles[action], text: withLiveStatus(text, alerts), live: alerts !== null };
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
    ticketFacts,
  };
  let text: string | null = null;
  if (runtimeEnv("XAI_API_KEY")) {
    try {
      text = await grok("explain", {
        ...facts,
        instruction:
          "Answer the question helpfully. Use ticketFacts for how to pay. Use the timetable for times. For delays and elevators, use only liveAlerts.",
      });
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
      text = `${live} I can look up a train, a station, or how to pay. Fares and ticket options are at https://www.caltrain.com/fares.`;
    }
  }
  return { title: "ONE Agent", text: withLiveStatus(text, alerts), live: alerts !== null, sources, plans };
}
