"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { photos } from "@/lib/photos";
import { LineMap } from "@/components/line-map";
import { formatClock, formatCountdown } from "@/lib/time";
import type { Access, Plan, ServiceInfo, Station, TripOption, WhenMode } from "@/lib/types";

type Arm = "from" | "to";

const ACCESS_WORD: Record<Access, string> = {
  "step-free": "Step-free",
  "not-step-free": "Not step-free",
  unlisted: "Access unlisted",
};

export function Experience({
  stations,
  service,
  plan,
  initial,
}: {
  stations: Station[];
  service: ServiceInfo;
  plan: Plan | null;
  initial: { from?: string; to?: string; when?: string; time?: string; date?: string; stepfree?: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fromId, setFromId] = useState(initial.from ?? "");
  const [toId, setToId] = useState(initial.to ?? "");
  const [when, setWhen] = useState<WhenMode>(
    initial.when === "depart" || initial.when === "arrive" ? initial.when : "now",
  );
  const [time, setTime] = useState(initial.time || "08:00");
  const [date, setDate] = useState(initial.date || "");
  const [stepFree, setStepFree] = useState(initial.stepfree === "1");
  const [arm, setArm] = useState<Arm>("from");
  const [selected, setSelected] = useState(plan && plan.ok ? plan.trips[0]?.id ?? "" : "");
  const [hook, setHook] = useState<{
    trip: string;
    kind: "protect" | "explain" | "access";
    loading: boolean;
    title: string;
    text: string;
  } | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (plan?.ok) setSelected(plan.trips.find((trip) => trip.recommended)?.id || plan.trips[0]?.id || "");
  }, [plan]);

  const from = stations.find((station) => station.id === fromId);
  const to = stations.find((station) => station.id === toId);
  const selectedTrip = plan?.ok ? plan.trips.find((trip) => trip.id === selected) ?? plan.trips[0] : undefined;

  function search(next?: { fromId?: string; toId?: string; stepFree?: boolean }) {
    const origin = next?.fromId ?? fromId;
    const dest = next?.toId ?? toId;
    const accessible = next?.stepFree ?? stepFree;
    if (!origin || !dest || origin === dest) return;
    const params = new URLSearchParams({ from: origin, to: dest, when });
    if (when !== "now") {
      params.set("time", time);
      if (date) params.set("date", date);
    }
    if (accessible) params.set("stepfree", "1");
    startTransition(() => router.push(`/?${params.toString()}`, { scroll: false }));
  }

  function pickStation(id: string) {
    if (arm === "from") {
      setFromId(id);
      setArm("to");
    } else if (!toId || toId === id) {
      setToId(id);
    } else if (!fromId) {
      setFromId(id);
    } else {
      setToId(id);
    }
  }

  function fill(origin: string, dest: string) {
    setFromId(origin);
    setToId(dest);
    setWhen("now");
    setArm("to");
    const params = new URLSearchParams({ from: origin, to: dest, when: "now" });
    startTransition(() => router.push(`/?${params.toString()}`, { scroll: false }));
  }

  return (
    <>
      <a className="skip" href="#search">
        Skip to search
      </a>
      <header className="nav">
        <a className="brand" href="/">
          <svg className="mark" viewBox="0 0 16 16" aria-hidden>
            <rect width="16" height="16" fill="#172233" />
            <rect y="7" width="16" height="2" fill="#D92632" />
          </svg>
          <span>
            CALTRAIN <em>ONE</em>
          </span>
        </a>
        <div className="nav-side">
          <a href="#line">Line</a>
          <a href="#status">Status</a>
          <span className="unofficial">Unofficial concept</span>
          <span className="clock" suppressHydrationWarning>
            {now ? `${formatClock(now)} PT` : ""}
          </span>
        </div>
      </header>

      {plan?.ok ? (
        <div className="result-head">
          <p className="kicker">Your trains</p>
          <h1>
            {plan.from.name}
            <span>to {plan.to.name}</span>
          </h1>
          <p className="note">{plan.note}</p>
          <figure className="result-photo">
            <Image
              src={photos.station}
              alt="An electric Caltrain train at a station platform, seen from above, with riders on the platform."
              width={1600}
              height={900}
              sizes="100vw"
            />
          </figure>
        </div>
      ) : (
        <>
        <section className="hero">
          <div className="hero-scrim">
            <p className="kicker">Where are you headed today?</p>
            <h1>
              Go further.
              <span className="worry">Worry less.</span>
            </h1>
            <p className="dek">
              Tell us the stations. We’ll show the train, the transfer, and a real backup if you miss it.
            </p>
          </div>
          <div className="hero-frame">
            <Image
              src={photos.hero}
              alt="Riders wait on a Caltrain platform as a red and white electric train arrives."
              fill
              priority
              sizes="(max-width: 900px) 100vw, 46vw"
            />
          </div>
        </section>
        <div className="hero-follow">
            <SearchForm
              stations={stations}
              from={from}
              to={to}
              when={when}
              time={time}
              date={date}
              arm={arm}
              onArm={setArm}
              onFrom={setFromId}
              onTo={setToId}
              onWhen={setWhen}
              onTime={setTime}
              stepFree={stepFree}
              onStepFree={(value) => {
                setStepFree(value);
                search({ stepFree: value });
              }}
              onDate={setDate}
              onSwap={() => {
                setFromId(toId);
                setToId(fromId);
              }}
              onTry={() => fill("palo_alto", "san_francisco")}
              onBerkeley={() => fill("palo_alto", "DBRK")}
              onSubmit={() => search()}
              pending={pending}
            />
            <AskOne onPlan={fill} />
            {plan && !plan.ok ? <p className="empty">{plan.error}</p> : null}
            <h2 className="section-title">How CALTRAIN ONE helps</h2>
            <div className="agent">
              <article>
                <div className="idx">01</div>
                <h2>Rescue</h2>
                <p>Miss this train? We’ll show the next real one, and how much later you arrive.</p>
              </article>
              <article>
                <div className="idx">02</div>
                <h2>Confidence</h2>
                <p>Boarding steps in order: which train, where you get off, and the transfer.</p>
              </article>
              <article>
                <div className="idx">03</div>
                <h2>Access</h2>
                <p>Turn on step-free when you need a longer, safer connection. We only mark what the data says.</p>
              </article>
            </div>
        </div>
        <div className="band line-home">
          <LineMap stations={stations.filter((station) => station.id !== "DBRK")} fromId={fromId} toId={toId} onPick={pickStation} />
        </div>
        </>
      )}

      {pending ? <div className="progress" role="status" aria-label="Looking up trains" /> : null}

      {plan?.ok ? (
        <div className="split">
          <section aria-live="polite">
            <div className="edit">
            <SearchForm
              stations={stations}
              from={from}
              to={to}
              when={when}
              time={time}
              date={date}
              arm={arm}
              onArm={setArm}
              onFrom={setFromId}
              onTo={setToId}
              onWhen={setWhen}
              onTime={setTime}
              stepFree={stepFree}
              onStepFree={(value) => {
                setStepFree(value);
                search({ stepFree: value });
              }}
              onDate={setDate}
              onSwap={() => {
                setFromId(toId);
                setToId(fromId);
              }}
              onTry={() => fill("palo_alto", "san_francisco")}
              onBerkeley={() => fill("palo_alto", "DBRK")}
              onSubmit={() => search()}
              pending={pending}
              compact
            />
            <p className="under-search">
              <a className="textbtn map-jump" href="#line">
                View on the line
              </a>
              <a className="textbtn" href="/">
                Clear
              </a>
            </p>
            </div>
            <div className="rows">
              {plan.trips.map((trip) => (
                <TripRow
                  key={trip.id}
                  trip={trip}
                  now={now}
                  active={trip.id === selectedTrip?.id}
                  hook={hook?.trip === trip.id ? hook : null}
                  onSelect={() => {
                    setSelected(trip.id);
                    setHook(null);
                  }}
                  onHook={(kind) => {
                    setSelected(trip.id);
                    if (hook?.trip === trip.id && hook.kind === kind && !hook.loading) {
                      setHook(null);
                      return;
                    }
                    setHook({ trip: trip.id, kind, loading: true, title: "", text: "" });
                    void fetch("/api/agent", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: kind,
                        fromId: plan.from.id,
                        toId: plan.to.id,
                        when,
                        time,
                        date,
                        tripId: trip.id,
                      }),
                    })
                      .then((res) => res.json())
                      .then((data: { title?: string; text?: string }) => {
                        setHook({
                          trip: trip.id,
                          kind,
                          loading: false,
                          title: data.title || "ONE Agent",
                          text: data.text || "No answer.",
                        });
                      })
                      .catch(() => {
                        setHook({
                          trip: trip.id,
                          kind,
                          loading: false,
                          title: "ONE Agent",
                          text: "Live alerts not connected. The request failed, so no delay or outage is shown.",
                        });
                      });
                  }}
                />
              ))}
            </div>
          </section>
          <div className="map-col">
            <LineMap
              stations={stations.filter((station) => station.id !== "DBRK")}
              fromId={plan.from.id}
              toId={plan.to.id === "DBRK" ? "place_MLBR" : plan.to.id}
              calls={selectedTrip?.calls.filter((call) => call.id !== "DBRK").map((call) => call.id)}
              onPick={pickStation}
            />
          </div>
        </div>
      ) : (
        <>
          <section className="band agent-below" id="agent">
            <hr className="rule" />
            <h2 className="section-title">ONE Agent</h2>
            <p className="section-dek">It sits on the journey, not in a side chat. Open it from a train.</p>
            <div className="agent">
              <article>
                <div className="idx">01</div>
                <h2>Rescue</h2>
                <p>If this departure fails, the backup is the next real train, with the minutes you gain or lose.</p>
              </article>
              <article>
                <div className="idx">02</div>
                <h2>Confidence</h2>
                <p>Which train, which stations it actually calls at, and where you stay on board.</p>
              </article>
              <article>
                <div className="idx">03</div>
                <h2>Access</h2>
                <p>Step-free only when the station data says so. Elevator alerts come with the live feed.</p>
              </article>
            </div>
          </section>
          <section className="band boarding">
            <div>
              <h2 className="section-title">Boarding</h2>
              <p className="section-dek">
                Wait on the platform for your train number. If you need a hand boarding, stay where the conductor can see you. Bikes board at the marked doors.
              </p>
            </div>
            <figure>
              <Image
                src={photos.boarding}
                alt="Riders and a bicycle beside an open Caltrain door at San Francisco platform 4."
                width={1200}
                height={1200}
                sizes="(max-width: 900px) 100vw, 42vw"
              />
            </figure>
          </section>
          <section className="band" id="status">
            <div className="status">
              <div>
                <span>In effect</span>
                <strong>{service.kind}</strong>
              </div>
              <div>
                <span>Today</span>
                <strong>{service.dateLabel}</strong>
              </div>
              <div>
                <span>Timetable</span>
                <strong>{service.range}</strong>
              </div>
              <div>
                <span>Live</span>
                <strong>Not connected</strong>
              </div>
            </div>
          </section>
          <section className="band" aria-labelledby="stations-title">
            <figure className="station-photo">
            <Image
              src={photos.station}
              alt="Aerial view of a Caltrain station with a red and white electric train along the platform."
              width={1600}
              height={900}
              sizes="100vw"
            />
          </figure>
          <h2 className="section-title" id="stations-title">
              Stations
            </h2>
            <p className="section-dek">North to south. Access is the GTFS wheelchair boarding flag, not a guess.</p>
            <div className="stations">
              {stations.map((station) => (
                <button key={station.id} type="button" onClick={() => pickStation(station.id)}>
                  <span>{station.name}</span>
                  <span className="zone-no">{station.zone ? `Z${station.zone}` : ""}</span>
                  <span className={station.access === "not-step-free" ? "access bad" : "access"}>
                    {ACCESS_WORD[station.access]}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      <footer className="foot">
        <span>Unofficial redesign. Not affiliated with Caltrain.</span>
        <span>
          Schedule from the{" "}
          <a href="https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip">Caltrain GTFS feed</a>.
        </span>
      </footer>
    </>
  );
}

function SearchForm({
  stations,
  from,
  to,
  when,
  time,
  date,
  arm,
  onArm,
  onFrom,
  onTo,
  onWhen,
  onTime,
  onDate,
  stepFree,
  onStepFree,
  onSwap,
  onTry,
  onBerkeley,
  onSubmit,
  pending,
  compact,
}: {
  stations: Station[];
  from?: Station;
  to?: Station;
  when: WhenMode;
  time: string;
  date: string;
  arm: Arm;
  onArm: (arm: Arm) => void;
  onFrom: (id: string) => void;
  onTo: (id: string) => void;
  onWhen: (when: WhenMode) => void;
  onTime: (time: string) => void;
  onDate: (date: string) => void;
  stepFree: boolean;
  onStepFree: (value: boolean) => void;
  onSwap: () => void;
  onTry: () => void;
  onBerkeley: () => void;
  onSubmit: () => void;
  pending: boolean;
  compact?: boolean;
}) {
  return (
    <form
      id="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className={compact ? "search slim" : "search"}>
        <StationField
          label="From"
          station={from}
          stations={stations}
          active={arm === "from"}
          onOpen={() => onArm("from")}
          onPick={onFrom}
        />
        <StationField
          label="To"
          station={to}
          stations={stations}
          active={arm === "to"}
          onOpen={() => onArm("to")}
          onPick={onTo}
        />
        <WhenField when={when} time={time} date={date} onWhen={onWhen} onTime={onTime} onDate={onDate} />
        <button className="go" type="submit" disabled={pending}>
          Search
        </button>
      </div>
      <label className="stepfree">
        <input
          type="checkbox"
          checked={stepFree}
          onChange={(event) => onStepFree(event.target.checked)}
        />
        Step-free / I use a wheelchair or need elevators
      </label>
      {compact ? null : (
        <div className="under-search">
          <button className="textbtn" type="button" onClick={onSwap}>
            Swap direction
          </button>
          <button className="textbtn" type="button" onClick={onTry}>
            Palo Alto to San Francisco
          </button>
          <button className="textbtn" type="button" onClick={onBerkeley}>
            Palo Alto to Downtown Berkeley
          </button>
        </div>
      )}
    </form>
  );
}

function StationField({
  label,
  station,
  stations,
  active,
  onOpen,
  onPick,
}: {
  label: string;
  station?: Station;
  stations: Station[];
  active: boolean;
  onOpen: () => void;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter((item) => item.name.toLowerCase().includes(q));
  }, [query, stations]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div className="cell">
      <span className="label" id={`${listId}-label`}>
        {label}
      </span>
      <button
        type="button"
        className={station ? "field-btn" : "field-btn placeholder"}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          onOpen();
          setOpen((value) => !value);
          setQuery("");
          setHi(0);
        }}
      >
        {station?.name || "Station"}
      </button>
      {open ? (
        <div className="picker">
          <input
            ref={inputRef}
            className="filter"
            value={query}
            placeholder="Filter stations"
            aria-label={`Filter ${label} stations`}
            aria-controls={listId}
            aria-activedescendant={filtered[hi] ? `${listId}-${filtered[hi].id}` : undefined}
            onChange={(event) => {
              setQuery(event.target.value);
              setHi(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHi((index) => Math.min(index + 1, filtered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setHi((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter" && filtered[hi]) {
                event.preventDefault();
                onPick(filtered[hi].id);
                setOpen(false);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          <div className="picker-list" role="listbox" id={listId} aria-labelledby={`${listId}-label`}>
            {filtered.map((item, index) => (
              <button
                key={item.id}
                id={`${listId}-${item.id}`}
                type="button"
                role="option"
                aria-selected={index === hi || item.id === station?.id}
                onMouseEnter={() => setHi(index)}
                onClick={() => {
                  onPick(item.id);
                  setOpen(false);
                }}
              >
                <span>{item.name}</span>
                <span className="zone-no">{item.zone ? `Z${item.zone}` : ""}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WhenField({
  when,
  time,
  date,
  onWhen,
  onTime,
  onDate,
}: {
  when: WhenMode;
  time: string;
  date: string;
  onWhen: (when: WhenMode) => void;
  onTime: (time: string) => void;
  onDate: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = when === "depart" ? "Depart at" : when === "arrive" ? "Arrive by" : "Leave now";
  return (
    <div className="cell">
      <span className="label">When</span>
      <button type="button" className="field-btn" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {label}
      </button>
      {when !== "now" ? (
        <div className="when-extra">
          <input aria-label="Time" type="time" value={time} onChange={(event) => onTime(event.target.value)} />
          <input aria-label="Date" type="date" value={date} onChange={(event) => onDate(event.target.value)} />
        </div>
      ) : null}
      {open ? (
        <div className="when-pop" role="menu">
          {(
            [
              ["now", "Leave now"],
              ["depart", "Depart at"],
              ["arrive", "Arrive by"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={when === value}
              onClick={() => {
                onWhen(value);
                setOpen(false);
              }}
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TripRow({
  trip,
  now,
  active,
  hook,
  onSelect,
  onHook,
}: {
  trip: TripOption;
  now: number | null;
  active: boolean;
  hook: { kind: "protect" | "explain" | "access"; loading: boolean; title: string; text: string } | null;
  onSelect: () => void;
  onHook: (kind: "protect" | "explain" | "access") => void;
}) {
  const accessRisk =
    trip.originAccess === "not-step-free" || trip.destAccess === "not-step-free"
      ? trip.originAccess === "not-step-free"
        ? "Origin is not step-free"
        : "Destination is not step-free"
      : "";
  return (
    <article className={active ? "row is-on" : "row"} data-trip={trip.number} onClick={onSelect}>
      <div className="num">
        <div>
          <div className="flag">{trip.recommended ? (trip.id ? "Fastest" : "") : ""}</div>
          <div className="no">{trip.number}</div>
          <span className={`badge badge-${badgeClass(trip.type)}`}>{trip.type}</span>
        </div>
      </div>
      <div className="dep">
        <div className="tm">{trip.departLabel}</div>
        <div className="st">{trip.calls[0]?.name}</div>
      </div>
      <div className="arr">
        <div className="tm">{trip.arriveLabel}</div>
        <div className="st">{trip.calls[trip.calls.length - 1]?.name}</div>
      </div>
      <div className="meta">
        <div>{trip.durationMin} min</div>
        <div>{trip.transfer ? "1 transfer" : `${Math.max(trip.calls.length - 1, 1)} stops · Direct`}</div>
        <div className="count" suppressHydrationWarning>
          {now ? formatCountdown(trip.departEpoch, now) : "Scheduled"}
        </div>
        {accessRisk ? <div className="risk">{accessRisk}</div> : null}
      </div>
      <div className="actions">
        <button className="agent-btn" type="button" onClick={(event) => { event.stopPropagation(); onHook("protect"); }}>
          Protect this journey
        </button>
        <button className="agent-btn" type="button" onClick={(event) => { event.stopPropagation(); onHook("explain"); }}>
          Explain my transfer
        </button>
        <button className="agent-btn" type="button" onClick={(event) => { event.stopPropagation(); onHook("access"); }}>
          Check accessibility
        </button>
      </div>
      {trip.steps ? (
        <ol className="steps">
          {trip.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {trip.transfer ? (
        <p className="xfer">
          Millbrae {trip.transfer.millbraeArrive}
          {" · "}
          {trip.transfer.waitMin} min transfer
          {" · "}
          <span className="swatch" style={{ background: trip.transfer.bartColor }} aria-hidden />
          BART {trip.transfer.bartLine} {trip.transfer.bartDepart}
          {" · "}
          {trip.transfer.boardStop}
        </p>
      ) : null}
      {hook?.kind === "access" && trip.accessNotes ? (
        <div className="hook" data-agent="access">
          <h3>Access</h3>
          {trip.accessNotes.map((note) => (
            <p key={note.station}>
              <strong>{note.station}.</strong> {note.detail} Source:{" "}
              {note.source.startsWith("http") ? <a href={note.source}>BART elevator status</a> : note.source}.
            </p>
          ))}
          <p>Live elevator status not connected.</p>
        </div>
      ) : hook ? (
        <div className="hook" data-agent={hook.kind}>
          <h3>{hook.loading ? "ONE Agent" : hook.title}</h3>
          <p>{hook.loading ? "Checking the timetable…" : hook.text}</p>
        </div>
      ) : null}
    </article>
  );
}

function AskOne({ onPlan }: { onPlan: (fromId: string, toId: string) => void }) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<{
    title: string;
    text: string;
    sources?: string[];
    plans?: { label: string; fromId: string; toId: string }[];
  } | null>(null);
  const chips = [
    "Is my 5pm train to SF on time?",
    "Which stations have elevators?",
    "How do I get to Berkeley?",
  ];

  async function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    setValue(text);
    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      setAnswer(await res.json());
    } catch {
      setAnswer({
        title: "ONE Agent",
        text: "Live alerts not connected. I couldn't read the timetable just now, so I won't guess a delay.",
        sources: [],
        plans: [],
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="ask"
      onSubmit={(event) => {
        event.preventDefault();
        void ask(value);
      }}
    >
      <label htmlFor="ask-one">Ask ONE</label>
      <div className="ask-row">
        <input
          id="ask-one"
          value={value}
          placeholder="Ask anything: Is my 5pm train to SF on time? Which stations have elevators? How do I get to Berkeley?"
          onChange={(event) => setValue(event.target.value)}
        />
        <button className="go" type="submit">
          {loading ? "…" : "Ask"}
        </button>
      </div>
      <div className="chips">
        {chips.map((chip) => (
          <button key={chip} type="button" className="chip" onClick={() => void ask(chip)}>
            {chip}
          </button>
        ))}
      </div>
      {answer ? (
        <div className="ask-panel" data-ask="one">
          <h3>{answer.title}</h3>
          <p>{answer.text}</p>
          {answer.plans?.map((item) => (
            <button key={item.label} type="button" className="agent-btn" onClick={() => onPlan(item.fromId, item.toId)}>
              {item.label}
            </button>
          ))}
          {answer.sources && answer.sources.length > 0 ? (
            <p className="sources">Sources: {answer.sources.join(" · ")}</p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

function badgeClass(type: string): string {
  if (type === "Express") return "express";
  if (type === "Limited") return "limited";
  if (type === "South County") return "south";
  return "local";
}
