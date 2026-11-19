# CALTRAIN ONE

An unofficial redesign of the Caltrain homepage. The trip planner is the page: two stations, the next trains, the kind of train, and a live countdown. Not affiliated with Caltrain or the San Mateo County Transit District.

## Inspiration

caltrain.com still opens on a wide timetable and a pile of notices. The journey is the thing a rider came to do, so this concept puts that search in the first screen and treats the peninsula line as wayfinding, not a spreadsheet. The visual language is Swiss editorial transit design: warm paper, navy, one red, oversized type, and a route you can read.

## What it does

- Asks where you are going, with a station picker ordered north to south and a leave-now, depart-at, or arrive-by choice.
- Lists the next Caltrain trips between those stations from the real GTFS timetable: train number, Local / Limited / Express / South County, departure, arrival, duration, and stops.
- Marks the fastest arrival and counts down to each departure in Pacific Time.
- Draws the trip on the corridor. Express trains leave a hollow stop where they do not call.
- Saves nothing and asks for no account. A link such as `/?from=palo_alto&to=san_francisco` is the whole query.
- Leaves hooks on each train for ONE Agent: Protect this journey, Explain my transfer, and Check accessibility. They open a short panel on the row. Live alerts are not connected in this pass, and the panels say so instead of inventing a delay.

## How we built it

Next.js (App Router), React, and TypeScript. The schedule is the Caltrain GTFS feed published by Trillium, bundled in `data/gtfs` and read on the server. Trip search, service calendars, and wheelchair-boarding flags all come from that feed. The interface is hand-set CSS with Geist.

## Challenges we ran into

GTFS times run past midnight and the calendar has holiday exceptions, so “leave now” has to be computed in America/Los_Angeles against the right service id. Express trains skip stations, which only shows up if the map is drawn from the trip’s actual calls. A class name reused from the skip link also yanked skipped stations out of the route and stacked them in a navy block.

## Accomplishments

A homepage that leads with the journey, and a results view that is a timetable plus the line. Palo Alto to San Francisco returns real afternoon trains, including Express 515, with type, time, and a countdown. It holds together on a laptop and a phone.

## What we learned

A transit page gets clearer when the times share a column and the map is the same object as the search, not a second product. Small type in the brand red fails contrast, so red is reserved for the headline, the search button, the express badge, and the route.

## What's next

- ONE Agent for real: Rescue against 511 service alerts, Confidence as step-by-step boarding, Access against elevator alerts. The buttons are already on the train.
- BART, so Palo Alto to Downtown Berkeley is a timed Caltrain plus BART itinerary via Millbrae.
- Road incidents near the origin station.
- Station pages, a full timetable, and the visitor ticket guide.
- A public deploy. This pass is the design increment.

## How Grok Bot helped build it

Draft for the team: Grok Bot scaffolded the Next.js app, wired the GTFS trip search, and iterated the layout from screenshots of the desktop and phone homepage.

## How to run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Try Palo Alto to San Francisco, or open `/?from=palo_alto&to=san_francisco`.

```bash
npm run build
npm start
```

Palo Alto to Downtown Berkeley uses the bundled BART trips in `data/bart-mlbr-dbrk.json` (from BART's public GTFS). Other station pairs stay on Caltrain.

ONE Agent is `POST /api/agent`. Copy `.env.example` to `.env` if you have keys. `XAI_API_KEY` calls Grok. `API_511_KEY` loads 511 service alerts for Caltrain (CT) and BART (BA), cached five minutes. With neither key, the panel uses the timetable and says live alerts are not connected.

The bundled timetable covers 31 Jan 2026 through 31 Jan 2027 (`data/gtfs`, from https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip). Refresh those files when Caltrain publishes a new feed.
