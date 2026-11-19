export type Access = "step-free" | "not-step-free" | "unlisted";

export type Station = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  zone: string;
  access: Access;
};

export type StopCall = {
  id: string;
  name: string;
  time: string;
};

export type TripOption = {
  id: string;
  tripId: string;
  number: string;
  type: string;
  headsign: string;
  departEpoch: number;
  arriveEpoch: number;
  departLabel: string;
  arriveLabel: string;
  durationMin: number;
  calls: StopCall[];
  recommended: boolean;
  originAccess: Access;
  destAccess: Access;
};

export type Plan =
  | {
      ok: true;
      from: Station;
      to: Station;
      date: string;
      when: "now" | "depart" | "arrive";
      nextDay: boolean;
      note: string;
      trips: TripOption[];
    }
  | { ok: false; error: string };

export type ServiceInfo = {
  dateLabel: string;
  kind: string;
  range: string;
};

export type WhenMode = "now" | "depart" | "arrive";
