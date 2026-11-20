import fs from "fs";
import path from "path";
import { parseCsv } from "./csv";
import { getCatalog } from "./gtfs";
import { planJourney, type Query } from "./plan";
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
