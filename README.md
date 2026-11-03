# Cruise Price History by CabinSaver

Chrome extension that shows a sailing's price history on seven cruise lines' sites, using the `/api/sailing` and `/api/itinerary` endpoints of the deployed charts service. On NCL sailings it also has an "Estimate remaining cabins" button, which calls count-cabins at `/cabinCounts` only when clicked. This repo has no server of its own.

## Layout

- `extension/`: Manifest V3 extension. The content script reads the sailing from the page URL, and the service worker calls charts.

## Run locally

1. Chrome → `chrome://extensions` → Developer mode → Load unpacked → `extension/`
2. Open an ncl.com booking page, e.g. `https://www.ncl.com/vacation-builder/planning/stateroom?itineraryCode=JOY4MIANPINASMIA&packageId=23379735&guests=1&stateroomTypeCode=INSIDE&gateway=NONE`

To test against a local charts server, set `API_BASE` in `extension/src/config.js` and add that origin to `host_permissions` in `extension/manifest.json`.

Tests: `node --test extension/test/`

## API

Documented at `GET https://cabinsaver.com/charts/api` and implemented in `charts/src/sailing.js`.

| Endpoint | Params | Returns |
|---|---|---|
| `GET /charts/api/sailing` | `packageId` (plus `sailDate` for Royal, Celebrity and MSC), or `itineraryCode` + `sailDate`; optional `cruiseLine`, `guestCount`, `cabinType` | History, low/high/median, 7/30-day change, up to 5 cheapest other dates on the same itinerary |
| `GET /charts/api/itinerary` | `itineraryCode`; optional `cruiseLine`, `guestCount`, `cabinType` | Upcoming sailings with current price |

History covers the last 90 record dates, the same window charts gives anonymous users.

## Pages recognised

| Site | Sailing panel when the URL has | Itinerary panel when the URL has |
|---|---|---|
| ncl.com | `itineraryCode` + `voyageId`/`packageId`/`departureDate` | `itineraryCode` |
| carnival.com | `sailingID`, or `itinCode` + `sailDate` (MMDDYYYY) | `itinCode` |
| royalcaribbean.com | `packageCode` + `sailDate`, or `groupId` + `sailDate` | `groupId` |
| celebritycruises.com | `pID`/`packageCode` + `sDT`/`sailDate`, or `groupId` + `sDT`/`sailDate` | `groupId` |
| msccruisesusa.com | `CruiseID` | |
| cunard.com | `/find-a-cruise/{code}` | |
| princess.com | `voyageCode` | |

The URL shapes come from the booking links in `cheapest-ncl/markdown.js`.

Each card on `ncl.com/vacations` also gets a "CabinSaver Price History" button at the bottom that opens the panel on that itinerary's cheapest upcoming date. Panels use the page's guest count, or 2 guests when the URL doesn't set one. A picker in the panel changes it to 1-4 guests, except on MSC, whose data only covers 2.

## Deploy

1. Deploy charts with the new endpoints
2. Add the `/charts/api/(sailing|itinerary)` nginx block from the charts README
3. Publish `extension/`

## Future scope

Off in `extension/src/config.js` `FEATURES` because each one needs a change in another project:

| Flag | Feature | Needs |
|---|---|---|
| `watchSailing` | "Watch this sailing" button that creates a price-drop alert | deal-alerts: per-sailing subscribe endpoint |

Not built yet: badges on search results.
