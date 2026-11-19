import { SiteFooter, SiteHeader } from "@/components/chrome";
import { Timetable } from "@/components/timetable";
import { buildSchedules } from "@/lib/timetable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Schedules — CALTRAIN ONE",
  description: "Weekday and weekend Caltrain timetables, northbound and southbound, from the official GTFS feed.",
};

export default function SchedulesPage() {
  const schedules = buildSchedules();
  return (
    <>
      <a className="skip" href="#board">
        Skip to the timetable
      </a>
      <SiteHeader />
      <main id="board">
        <Timetable schedules={schedules} />
      </main>
      <SiteFooter />
    </>
  );
}
