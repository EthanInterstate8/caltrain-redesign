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

export type Transfer = {
  millbraeArrive: string;
  millbraeArriveEpoch: number;
  waitMin: number;
  bartDepart: string;
  bartDepartEpoch: number;
  bartArrive: string;
  bartLine: string;
  bartColor: string;
  bartHeadsign: string;
  bartTripId: string;
  boardStop: string;
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
  transfer?: Transfer;
  boardStopName?: string;
  alightStopName?: string;
  steps?: string[];
  accessNotes?: { station: string; detail: string; source: string }[];
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
