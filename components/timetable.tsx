"use client";

import { useState } from "react";
import type { ScheduleTable, Schedules } from "@/lib/timetable";

export function Timetable({ schedules }: { schedules: Schedules }) {
  const [day, setDay] = useState<"weekday" | "weekend">("weekday");
  const [direction, setDirection] = useState<"north" | "south">("north");
  const table: ScheduleTable = schedules[day][direction];

  return (
    <div className="page">
      <p className="kicker">Schedules</p>
      <h1>Weekday and weekend trains.</h1>
      <p className="dek">
        The same board as caltrain.com: zone, station, then one column per train. A dash means that train does not stop.
        Northbound reads from Gilroy toward San Francisco. Southbound reads the other way.
      </p>
      <div className="toggles" role="group" aria-label="Which timetable">
        <div>
          <button type="button" aria-pressed={day === "weekday"} onClick={() => setDay("weekday")}>
            Weekday
          </button>
          <button type="button" aria-pressed={day === "weekend"} onClick={() => setDay("weekend")}>
            Weekend
          </button>
        </div>
        <div>
          <button type="button" aria-pressed={direction === "north"} onClick={() => setDirection("north")}>
            Northbound
          </button>
          <button type="button" aria-pressed={direction === "south"} onClick={() => setDirection("south")}>
            Southbound
          </button>
        </div>
      </div>
      <p className="note">
        {table.trains.length} trains. Express is red. Limited is outlined. Local is plain.{" "}
        <a href="https://www.caltrain.com/schedules">caltrain.com/schedules</a>
      </p>
      <div className="sheet">
        <table>
          <caption className="sr">
            {day === "weekday" ? "Weekday" : "Weekend"} {direction === "north" ? "northbound" : "southbound"} timetable
          </caption>
          <thead>
            <tr>
              <th className="station" scope="col">
                Station
              </th>
              {table.trains.map((train) => (
                <th key={train.number} scope="col" className={trainClass(train.type)}>
                  <span className="train-no">{train.number}</span>
                  <span className="train-type">{train.type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.name}>
                <th className="station" scope="row">
                  <span className="z">{row.zone}</span>
                  {row.name}
                </th>
                {row.times.map((time, index) => (
                  <td key={table.trains[index].number} className={time ? trainClass(table.trains[index].type) : "miss"}>
                    {time ?? "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function trainClass(type: string): string {
  if (type === "Express") return "is-express";
  if (type === "Limited") return "is-limited";
  return "is-local";
}
