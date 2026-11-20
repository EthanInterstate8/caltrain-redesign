"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Station, TripOption } from "@/lib/types";

const NAVY = "#172233";
const RED = "#D92632";
const PAPER = "#F7F5F0";

/** Parent stops on BART Red-N, Millbrae through Downtown Berkeley. From BART GTFS stops.txt. */
const BART_RED: { id: string; name: string; lat: number; lon: number }[] = [
  { id: "MLBR", name: "Millbrae", lat: 37.600237, lon: -122.386757 },
  { id: "SFIA", name: "San Francisco International Airport", lat: 37.616091, lon: -122.391954 },
  { id: "SBRN", name: "San Bruno", lat: 37.63773, lon: -122.416326 },
  { id: "SSAN", name: "South San Francisco", lat: 37.664462, lon: -122.444211 },
  { id: "COLM", name: "Colma", lat: 37.684635, lon: -122.466157 },
  { id: "DALY", name: "Daly City", lat: 37.706259, lon: -122.468908 },
  { id: "BALB", name: "Balboa Park", lat: 37.721747, lon: -122.447457 },
  { id: "GLEN", name: "Glen Park", lat: 37.733235, lon: -122.433515 },
  { id: "24TH", name: "24th Street / Mission", lat: 37.752419, lon: -122.418468 },
  { id: "16TH", name: "16th Street / Mission", lat: 37.765173, lon: -122.419704 },
  { id: "CIVC", name: "Civic Center / UN Plaza", lat: 37.779408, lon: -122.413826 },
  { id: "POWL", name: "Powell Street", lat: 37.784606, lon: -122.407331 },
  { id: "MONT", name: "Montgomery Street", lat: 37.789173, lon: -122.401587 },
  { id: "EMBR", name: "Embarcadero", lat: 37.792762, lon: -122.397037 },
  { id: "WOAK", name: "West Oakland", lat: 37.804888, lon: -122.295151 },
  { id: "12TH", name: "12th Street / Oakland City Center", lat: 37.803482, lon: -122.27163 },
  { id: "19TH", name: "19th Street Oakland", lat: 37.808078, lon: -122.268758 },
  { id: "MCAR", name: "MacArthur", lat: 37.828803, lon: -122.267105 },
  { id: "ASHB", name: "Ashby", lat: 37.853072, lon: -122.269771 },
  { id: "DBRK", name: "Downtown Berkeley", lat: 37.87011, lon: -122.268109 },
];

function corridor(stations: Station[], a: Station, b: Station): Station[] {
  const lo = Math.min(a.lat, b.lat) - 0.002;
  const hi = Math.max(a.lat, b.lat) + 0.002;
  return stations
    .filter((station) => station.id !== "DBRK" && station.lat >= lo && station.lat <= hi)
    .sort((left, right) => right.lat - left.lat);
}

function Fit({ positions }: { positions: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) map.fitBounds(positions as [number, number][], { padding: [28, 28] });
  }, [map, positions]);
  return null;
}

export function TripMap({
  stations,
  from,
  to,
  trip,
}: {
  stations: Station[];
  from: Station;
  to: Station;
  trip?: TripOption;
}) {
  const transfer = Boolean(trip?.transfer);
  const millbrae = stations.find((station) => station.id === "place_MLBR");
  const calEnd = transfer && millbrae ? millbrae : to;
  const spine = corridor(stations, from, calEnd);
  const cal = (spine.length >= 2 ? spine : [from, calEnd]).map((station) => [station.lat, station.lon] as [number, number]);
  const bart = transfer ? BART_RED.map((stop) => [stop.lat, stop.lon] as [number, number]) : [];
  const positions = [...cal, ...bart];
  const caption = transfer
    ? `Caltrain from ${from.name} to Millbrae, then BART Red line to ${to.name}. Transfer at Millbrae.`
    : `Caltrain from ${from.name} to ${to.name}.`;

  return (
    <figure className="trip-map" id="trip-map">
      <MapContainer center={cal[0]} zoom={11} scrollWheelZoom={false} attributionControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Fit positions={positions} />
        <Polyline positions={cal} pathOptions={{ color: NAVY, weight: 4 }} />
        {bart.length > 1 ? <Polyline positions={bart} pathOptions={{ color: RED, weight: 4 }} /> : null}
        {(transfer ? BART_RED : [])
          .filter((stop) => stop.id !== "MLBR" && stop.id !== "DBRK")
          .map((stop) => (
            <CircleMarker
              key={stop.id}
              center={[stop.lat, stop.lon]}
              radius={3}
              pathOptions={{ color: RED, fillColor: RED, fillOpacity: 1, weight: 0 }}
            />
          ))}
        <CircleMarker center={[from.lat, from.lon]} radius={8} pathOptions={{ color: NAVY, fillColor: PAPER, fillOpacity: 1, weight: 3 }}>
          <Tooltip permanent direction="right">
            {from.name}
          </Tooltip>
        </CircleMarker>
        {transfer && millbrae ? (
          <CircleMarker
            center={[millbrae.lat, millbrae.lon]}
            radius={8}
            pathOptions={{ color: RED, fillColor: PAPER, fillOpacity: 1, weight: 3 }}
          >
            <Tooltip permanent direction="left">
              Millbrae transfer
            </Tooltip>
          </CircleMarker>
        ) : null}
        <CircleMarker
          center={[to.lat, to.lon]}
          radius={8}
          pathOptions={{ color: transfer ? RED : NAVY, fillColor: PAPER, fillOpacity: 1, weight: 3 }}
        >
          <Tooltip permanent direction="right">
            {to.name}
          </Tooltip>
        </CircleMarker>
      </MapContainer>
      <figcaption>
        <span>
          <i className="swatch cal" /> Caltrain
        </span>
        {transfer ? (
          <span>
            <i className="swatch bart" /> BART Red line
          </span>
        ) : null}
      </figcaption>
      <p className="sr-only">{caption}</p>
    </figure>
  );
}
