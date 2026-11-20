# CALTRAIN ONE

An unofficial redesign concept of [caltrain.com](https://www.caltrain.com) for the Berkeley × Stanford Grok Bot Hackathon, Best Design track. Not affiliated with Caltrain.

Live site: https://caltrain-redesign-ten.vercel.app

## Inspiration

caltrain.com opens on a wide timetable and a pile of notices. Riders come to answer a simpler question: where am I going, and what is the next train? CALTRAIN ONE keeps Caltrain’s own facts and puts that question first, in a Swiss editorial layout: warm paper (`#F7F5F0`), navy (`#172233`), and Caltrain red (`#D92632`).

## What it does

- Plans trips from the real Caltrain GTFS timetable: train number, Local / Limited / Express, times, and a countdown.
- Plans Palo Alto to Downtown Berkeley as Caltrain to Millbrae, then BART Red from the Millbrae transfer platform, with the timetable gap and a backup connection.
- Shows numbered boarding steps taken only from GTFS stop names, direction, and platform codes. If a fact is not in the feed, it is left out.
- Offers ONE Agent as Rescue, Confidence, and Access, including a homepage **Ask ONE** box. Without live keys it says live alerts are not connected.
- A step-free toggle lengthens the Millbrae connection because BART’s GTFS file does not publish wheelchair boarding. It never invents a delay or an elevator status.

## How we built it

Next.js, React, and TypeScript. Caltrain static GTFS is bundled in `data/gtfs`. Direct Millbrae-to-Downtown Berkeley BART trips are bundled from BART’s public GTFS. `POST /api/agent` answers from that data. If `XAI_API_KEY` is set, Grok phrases the answer from those facts only. If `API_511_KEY` is set, 511 service alerts for Caltrain (CT) and BART (BA) are added. The team’s own photos are in `public/images`.

## Challenges

GTFS times, calendars, and platform names had to stay the source of truth, including the Millbrae transfer and BART’s missing wheelchair field. Live feeds are optional and rate-limited, so the site has to say when it cannot see delays or elevators. The homepage had to stay readable over a real photograph without turning into a generic dashboard.

## Accomplishments

A public site that looks like a designed transit product, answers Palo Alto to Downtown Berkeley with a real connection, and keeps ONE Agent on the homepage instead of a side chat. Step-free routing changes the BART train. Nothing on the page fabricates a delay or an elevator outage.

## What we learned

The timetable is clearer when times share a column and the map is the same object as the search. Small red type fails contrast, so red stays on the headline, the button, and express trains. Saying “not connected” is more useful than a guessed “on time.”

## What's next

Elevator outages when a live feed is connected, more BART station pairs, and the two later photos (a two-train hero and an interior) by swapping paths in `lib/photos.ts`.

## How Grok Bot helped build it

Grok Bot, a desktop assistant, brainstormed the idea from the hackathon tracks, read the team’s Google Doc brief, connected GitHub, and launched and steered this Cursor cloud agent in small increments. It kept the work to spec, cropped and supplied the team’s photos, and guided the Vercel deploy and environment variables.

## How to run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Optional keys go in `.env` (see `.env.example`): `XAI_API_KEY` for Grok and `API_511_KEY` for 511 alerts. Without them, schedules and Ask ONE still work and say live alerts are not connected.
