import { SiteFooter, SiteHeader } from "@/components/chrome";
import { getCatalog } from "@/lib/gtfs";

export const metadata = {
  title: "Fares — CALTRAIN ONE",
  description: "How to pay for Caltrain: Clipper, contactless cards, station ticket machines, zones, and current fares.",
};

const ONE_WAY = [
  ["Adult", "Ticket machine or Clipper", "$4.00", "$6.25", "$8.50", "$10.75", "$13.00", "$15.25"],
  ["Eligible discount", "Ticket machine or Clipper", "$2.00", "$3.00", "$4.00", "$5.00", "$6.00", "$7.00"],
  ["Youth", "Ticket machine or Clipper", "$1.00", "$1.00", "$1.00", "$1.00", "$1.00", "$1.00"],
];

const DAY = [
  ["Adult", "Ticket machine", "$8.00", "$12.50", "$17.00", "$21.50", "$26.00", "$30.50"],
  ["Eligible discount", "Ticket machine", "$4.00", "$6.00", "$8.00", "$10.00", "$12.00", "$14.00"],
  ["Youth", "Ticket machine", "$2.00", "$2.00", "$2.00", "$2.00", "$2.00", "$2.00"],
];

const MONTH = [
  ["Adult", "Clipper", "$96.00", "$150.00", "$204.00", "$258.00", "$312.00", "$366.00"],
  ["Eligible discount", "Clipper", "$48.00", "$72.00", "$96.00", "$120.00", "$144.00", "$168.00"],
  ["Youth", "Clipper", "$24.00", "$24.00", "$24.00", "$24.00", "$24.00", "$24.00"],
];

export default function FaresPage() {
  const zones = new Map<string, string[]>();
  for (const station of getCatalog().stations) {
    const list = zones.get(station.zone) ?? [];
    list.push(station.name);
    zones.set(station.zone, list);
  }
  const zoneOrder = [...zones.keys()].sort();

  return (
    <>
      <a className="skip" href="#pay">
        Skip to ways to pay
      </a>
      <SiteHeader />
      <main className="page" id="pay">
        <p className="kicker">Fares</p>
        <h1>Get on board.</h1>
        <p className="dek">
          Caltrain fares are based on the number of zones a passenger travels through. San Francisco to Palo Alto is
          three zones. One-way tickets are valid for four hours, in one direction.
        </p>

        <h2>Ways to pay</h2>
        <div className="pay">
          <article>
            <p className="idx">01</p>
            <h3>Clipper</h3>
            <p>
              Use a physical Clipper card, or a digital card in the Clipper app. Manage the card at clippercard.com.
              Tap on before you board and tap off after you exit. If you ride more than one train in the same
              direction, wait and tap off only at the end.
            </p>
          </article>
          <article>
            <p className="idx">02</p>
            <h3>Contactless card or phone</h3>
            <p>
              Tap a contactless credit or debit card, or Clipper in Apple Pay or Google Pay, on the station validator.
              Take the card out of your wallet first so the right card is charged. Use the same card to tap on and tap
              off. This pays the adult fare. Youth, senior, and disabled discounts still need a Clipper card.
            </p>
          </article>
          <article>
            <p className="idx">03</p>
            <h3>Ticket machine</h3>
            <p>
              Buy a paper one-way ticket or a day pass at the machine in any Caltrain station before you board. The
              Caltrain Mobile app stopped selling tickets on November 1, 2025. Nobody sells tickets on the train.
            </p>
          </article>
        </div>
        <p className="note">
          Tap on and tap off. If you do not tap off within four hours, Clipper charges the maximum one-way fare. Hear a
          beep, then a different tone when you tap off.
        </p>

        <h2>Find your zone</h2>
        <p className="dek">You pay for every zone the trip touches, including the zones where you get on and off.</p>
        <div className="zones">
          {zoneOrder.map((zone) => (
            <article key={zone}>
              <p className="idx">Zone {zone}</p>
              <p>{(zones.get(zone) ?? []).join(" · ")}</p>
            </article>
          ))}
        </div>

        <h2>One-way</h2>
        <p>Valid for four hours from the time it is sold, in one direction.</p>
        <FareTable rows={ONE_WAY} />

        <h2>Day pass</h2>
        <p>Unlimited travel that day inside the zones on the pass. Sold at ticket machines, not on Clipper.</p>
        <FareTable rows={DAY} />

        <h2>Monthly pass</h2>
        <p>
          A calendar month of trips inside the zones you buy, on Clipper. On weekends and holidays it covers every
          zone, except Christmas Eve. From January 1, 2027, tap on and tap off for every ride.
        </p>
        <FareTable rows={MONTH} />

        <h2>Zone upgrade</h2>
        <p>
          Add zones to a ticket you already have. It cannot be used alone, and it is good for four hours. Adult
          upgrades are $2.25 per zone at the ticket machine. Youth and eligible-discount upgrades are $1.00 per zone.
          On January 1, 2027 the adult upgrade rises by $0.25 per zone. One-zone adult fare stays $4.00. Longer adult
          one-way fares become $6.50, $9.00, $11.50, $14.00, and $16.50.
        </p>
        <p className="note">
          Prices above are the current fares published at{" "}
          <a href="https://www.caltrain.com/fares">caltrain.com/fares</a>. Who counts as youth or eligible discount is
          defined there.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}

function FareTable({ rows }: { rows: string[][] }) {
  return (
    <div className="sheet fare-sheet">
      <table>
        <thead>
          <tr>
            <th className="station" scope="col">
              Rider
            </th>
            <th scope="col">Where to buy</th>
            {["1 zone", "2", "3", "4", "5", "6"].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) =>
                index === 0 ? (
                  <th key={`${row[0]}-${index}`} className="station" scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={`${row[0]}-${index}`}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
