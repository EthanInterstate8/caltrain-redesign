import { Experience } from "@/components/experience";
import { describeService } from "@/lib/gtfs";
import { listStations, planJourney } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const initial = {
    from: read("from"),
    to: read("to"),
    when: read("when"),
    time: read("time"),
    date: read("date"),
  };
  const plan = planJourney({
    fromId: initial.from,
    toId: initial.to,
    when: initial.when,
    time: initial.time,
    date: initial.date,
  });
  return <Experience stations={listStations()} service={describeService()} plan={plan} initial={initial} />;
}
